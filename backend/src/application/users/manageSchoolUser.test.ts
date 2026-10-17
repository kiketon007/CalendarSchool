import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type {
  AppliedUserChange,
  SchoolUserRepository,
} from '../../domain/user/schoolUserRepository.js';
import {
  CannotSuspendSelf,
  LastAdminRequired,
  UserNotActive,
  UserNotFound,
} from '../../domain/user/userManagementErrors.js';
import type { UserChange, UserChangeSnapshot } from '../../domain/user/userManagement.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ManageSchoolUser } from './manageSchoolUser.js';

const NOW = new Date('2026-10-16T10:00:00Z');
const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'actor-1';
const USER_ID = 'user-1';

function schoolUser(overrides: Partial<SchoolUser> = {}): SchoolUser {
  return {
    id: USER_ID,
    firstName: 'José María',
    lastName: 'García-López',
    email: 'jose.garcia@example.com',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-07T09:30:00Z'),
    ...overrides,
  };
}

type ApplyChange = SchoolUserRepository['applyChange'];
type Snapshot = Omit<UserChangeSnapshot, 'actorId'>;

describe('ManageSchoolUser', () => {
  let applyChange: Mock<ApplyChange>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: ManageSchoolUser;

  /** El repositorio de verdad llama a `plan` con la instantánea y escribe lo que devuelva. */
  function repositoryApplying(
    snapshot: Snapshot,
    result: (change: UserChange | null) => AppliedUserChange,
  ): void {
    applyChange.mockImplementation(({ plan }) => Promise.resolve(result(plan(snapshot))));
  }

  beforeEach(() => {
    applyChange = vi.fn<ApplyChange>();
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new ManageSchoolUser({
      schoolUserRepository: { applyChange },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  const input = {
    schoolId: SCHOOL_ID,
    actorId: ACTOR_ID,
    userId: USER_ID,
  };

  it('passes the school, the user and the clock to the repository', async () => {
    applyChange.mockResolvedValue({
      previous: schoolUser(),
      user: schoolUser(),
      change: null,
      revokedSessions: 0,
    });

    await useCase.execute({ ...input, action: { type: 'reactivate' } });

    expect(applyChange).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      now: NOW,
      plan: expect.any(Function) as unknown,
    });
  });

  it('throws UserNotFound when the repository finds no such user in the school', async () => {
    applyChange.mockResolvedValue(null);

    await expect(useCase.execute({ ...input, action: { type: 'suspend' } })).rejects.toBeInstanceOf(
      UserNotFound,
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('adds the acting user to the snapshot so the rule can reject suspending oneself', async () => {
    repositoryApplying(
      { target: { id: ACTOR_ID, role: 'ADMIN', status: 'ACTIVE' }, activeAdminCount: 3 },
      () => {
        throw new Error('no debería escribir');
      },
    );

    await expect(
      useCase.execute({ ...input, userId: ACTOR_ID, action: { type: 'suspend' } }),
    ).rejects.toBeInstanceOf(CannotSuspendSelf);
  });

  it('logs USER_ROLE_CHANGED with the previous and the new role and returns the user', async () => {
    const previous = schoolUser({ role: 'MEMBER' });
    const user = schoolUser({ role: 'ADMIN' });
    repositoryApplying(
      { target: { id: USER_ID, role: 'MEMBER', status: 'ACTIVE' }, activeAdminCount: 1 },
      (change) => ({ previous, user, change, revokedSessions: 0 }),
    );

    const result = await useCase.execute({
      ...input,
      action: { type: 'changeRole', role: 'ADMIN' },
    });

    expect(result).toEqual(user);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      {
        event: 'USER_ROLE_CHANGED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        user_id: USER_ID,
        previous_role: 'MEMBER',
        new_role: 'ADMIN',
      },
      expect.any(String),
    );
  });

  it('logs USER_SUSPENDED with the number of revoked sessions', async () => {
    const previous = schoolUser();
    const user = schoolUser({ status: 'SUSPENDED' });
    repositoryApplying(
      { target: { id: USER_ID, role: 'MEMBER', status: 'ACTIVE' }, activeAdminCount: 1 },
      (change) => ({ previous, user, change, revokedSessions: 2 }),
    );

    const result = await useCase.execute({ ...input, action: { type: 'suspend' } });

    expect(result).toEqual(user);
    expect(info).toHaveBeenCalledWith(
      {
        event: 'USER_SUSPENDED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        user_id: USER_ID,
        revoked_sessions: 2,
      },
      expect.any(String),
    );
  });

  it('logs USER_REACTIVATED', async () => {
    const previous = schoolUser({ status: 'SUSPENDED' });
    const user = schoolUser({ status: 'ACTIVE' });
    repositoryApplying(
      { target: { id: USER_ID, role: 'MEMBER', status: 'SUSPENDED' }, activeAdminCount: 1 },
      (change) => ({ previous, user, change, revokedSessions: 0 }),
    );

    await useCase.execute({ ...input, action: { type: 'reactivate' } });

    expect(info).toHaveBeenCalledWith(
      {
        event: 'USER_REACTIVATED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        user_id: USER_ID,
      },
      expect.any(String),
    );
  });

  it.each([
    ['changeRole', { type: 'changeRole', role: 'MEMBER' } as const, 'MEMBER', 'ACTIVE'],
    ['suspend', { type: 'suspend' } as const, 'MEMBER', 'SUSPENDED'],
    ['reactivate', { type: 'reactivate' } as const, 'MEMBER', 'ACTIVE'],
  ] as const)(
    'does not log anything when %s finds the user already as requested',
    async (_name, action, role, status) => {
      const current = schoolUser({ role, status });
      repositoryApplying(
        { target: { id: USER_ID, role, status }, activeAdminCount: 1 },
        (change) => ({ previous: current, user: current, change, revokedSessions: 0 }),
      );

      await expect(useCase.execute({ ...input, action })).resolves.toEqual(current);

      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'LAST_ADMIN_REQUIRED',
      LastAdminRequired,
      { target: { id: USER_ID, role: 'ADMIN', status: 'ACTIVE' }, activeAdminCount: 1 },
      { type: 'changeRole', role: 'MEMBER' },
    ],
    [
      'USER_NOT_ACTIVE',
      UserNotActive,
      { target: { id: USER_ID, role: 'MEMBER', status: 'SUSPENDED' }, activeAdminCount: 1 },
      { type: 'changeRole', role: 'ADMIN' },
    ],
    [
      'CANNOT_SUSPEND_SELF',
      CannotSuspendSelf,
      { target: { id: ACTOR_ID, role: 'ADMIN', status: 'ACTIVE' }, activeAdminCount: 2 },
      { type: 'suspend' },
    ],
  ] as const)(
    'logs USER_MANAGEMENT_REJECTED with reason %s and rethrows the error',
    async (reason, ErrorClass, snapshot, action) => {
      repositoryApplying(snapshot, () => {
        throw new Error('no debería escribir');
      });

      await expect(
        useCase.execute({ ...input, userId: snapshot.target.id, action }),
      ).rejects.toBeInstanceOf(ErrorClass);

      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        {
          event: 'USER_MANAGEMENT_REJECTED',
          reason,
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          user_id: snapshot.target.id,
        },
        expect.any(String),
      );
    },
  );

  it('propagates DatabaseUnavailable without logging a rejection', async () => {
    applyChange.mockRejectedValue(new DatabaseUnavailable(new Error('conexión caída')));

    await expect(useCase.execute({ ...input, action: { type: 'suspend' } })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('never puts emails or names in the logs', async () => {
    repositoryApplying(
      { target: { id: USER_ID, role: 'MEMBER', status: 'ACTIVE' }, activeAdminCount: 1 },
      (change) => ({
        previous: schoolUser(),
        user: schoolUser({ role: 'ADMIN' }),
        change,
        revokedSessions: 0,
      }),
    );

    await useCase.execute({ ...input, action: { type: 'changeRole', role: 'ADMIN' } });

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain('jose.garcia@example.com');
    expect(logged).not.toContain('José');
    expect(logged).not.toContain('García');
  });
});
