import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { UserRole, UserStatus } from '../../domain/user/user.js';
import { type UserChangeSnapshot, planUserChange } from '../../domain/user/userManagement.js';
import { LastAdminRequired } from '../../domain/user/userManagementErrors.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaSchoolUserRepository } from './prismaSchoolUserRepository.js';

const repository = new PrismaSchoolUserRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

const NOW = new Date('2026-10-16T10:00:00Z');

let counter = 0;

async function insertUser(
  schoolId: string,
  overrides: {
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: UserRole;
    status?: UserStatus;
    createdAt?: Date;
  } = {},
) {
  counter += 1;
  const id = `0192f5a0-0000-7000-8000-${String(counter).padStart(12, '0')}`;
  await testPrisma.user.create({
    data: {
      id,
      schoolId,
      email: overrides.email ?? `user${counter}@example.com`,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: overrides.firstName ?? 'Nombre',
      lastName: overrides.lastName ?? 'Apellido',
      role: overrides.role ?? 'MEMBER',
      status: overrides.status ?? 'ACTIVE',
      ...(overrides.createdAt && { createdAt: overrides.createdAt }),
    },
  });
  return id;
}

/** Inserta un enlace de acceso: un restablecimiento pendiente de `userId`, o lo que digan los ajustes. */
async function insertAccessLink(
  createdById: string,
  userId: string | null,
  overrides: Record<string, unknown> = {},
) {
  counter += 1;
  await testPrisma.accessLink.create({
    data: {
      id: `0192f5a0-0000-7000-8000-${String(2000 + counter).padStart(12, '0')}`,
      schoolId: SCHOOL_ID,
      purpose: 'PASSWORD_RESET',
      tokenHash: String(counter).padStart(64, '7'),
      role: null,
      userId,
      createdById,
      expiresAt: new Date('2026-10-19T10:00:00Z'),
      ...overrides,
    } as never,
  });
}

describe('PrismaSchoolUserRepository.listBySchool', () => {
  beforeEach(async () => {
    counter = 0;
    await testPrisma.school.create({
      data: {
        id: SCHOOL_ID,
        name: 'CEIP Uno',
        normalizedName: 'ceipuno',
        municipalityCode: '46250',
      },
    });
    await testPrisma.school.create({
      data: {
        id: OTHER_SCHOOL_ID,
        name: 'CEIP Dos',
        normalizedName: 'ceipdos',
        municipalityCode: '46250',
      },
    });
  });

  it('returns exactly the eight fields of the list, without the password hash or the consent', async () => {
    const createdAt = new Date('2026-10-07T09:30:00Z');
    const id = await insertUser(SCHOOL_ID, {
      firstName: 'José María',
      lastName: 'García-López',
      email: 'jose.garcia@example.com',
      role: 'ADMIN',
      createdAt,
    });

    const users = await repository.listBySchool(SCHOOL_ID, NOW);

    expect(users).toEqual([
      {
        id,
        firstName: 'José María',
        lastName: 'García-López',
        email: 'jose.garcia@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordResetPending: false,
        createdAt,
      },
    ]);
    expect(JSON.stringify(users)).not.toContain('$2b$12$');
  });

  it('returns only the users of the school it is given', async () => {
    await insertUser(SCHOOL_ID, { email: 'a@example.com', lastName: 'Uno' });
    await insertUser(SCHOOL_ID, { email: 'b@example.com', lastName: 'Dos' });
    await insertUser(OTHER_SCHOOL_ID, { email: 'c@example.com', lastName: 'Ajeno' });

    const users = await repository.listBySchool(SCHOOL_ID, NOW);

    expect(users.map((user) => user.email).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect((await repository.listBySchool(OTHER_SCHOOL_ID, NOW)).map((user) => user.email)).toEqual(
      ['c@example.com'],
    );
  });

  it('returns ACTIVE and SUSPENDED users and leaves out the DELETED ones', async () => {
    await insertUser(SCHOOL_ID, { email: 'active@example.com', status: 'ACTIVE' });
    await insertUser(SCHOOL_ID, { email: 'suspended@example.com', status: 'SUSPENDED' });
    await insertUser(SCHOOL_ID, { email: 'deleted@example.com', status: 'DELETED' });

    const users = await repository.listBySchool(SCHOOL_ID, NOW);

    expect(users.map((user) => [user.email, user.status]).sort()).toEqual([
      ['active@example.com', 'ACTIVE'],
      ['suspended@example.com', 'SUSPENDED'],
    ]);
  });

  it('sorts by last name, first name and email with the Spanish collation', async () => {
    await insertUser(SCHOOL_ID, { lastName: 'Zapata', firstName: 'Ana', email: 'z@example.com' });
    // Un apellido con tilde inicial va con la A, no al final como con una intercalación binaria.
    await insertUser(SCHOOL_ID, { lastName: 'Álvarez', firstName: 'Luis', email: 'a@example.com' });
    await insertUser(SCHOOL_ID, { lastName: 'García', firstName: 'Luis', email: 'g2@example.com' });
    await insertUser(SCHOOL_ID, { lastName: 'García', firstName: 'Ana', email: 'g1@example.com' });
    await insertUser(SCHOOL_ID, { lastName: 'García', firstName: 'Ana', email: 'g0@example.com' });

    const users = await repository.listBySchool(SCHOOL_ID, NOW);

    expect(users.map((user) => user.email)).toEqual([
      'a@example.com',
      'g0@example.com',
      'g1@example.com',
      'g2@example.com',
      'z@example.com',
    ]);
  });

  describe('passwordResetPending', () => {
    const pendingOf = async () =>
      Object.fromEntries(
        (await repository.listBySchool(SCHOOL_ID, NOW)).map((user) => [
          user.email,
          user.passwordResetPending,
        ]),
      );

    it('is true only for a user with a reset pending at the given instant', async () => {
      const admin = await insertUser(SCHOOL_ID, { email: 'admin@example.com', role: 'ADMIN' });
      const pending = await insertUser(SCHOOL_ID, { email: 'pending@example.com' });
      const expired = await insertUser(SCHOOL_ID, { email: 'expired@example.com' });
      const expiredNow = await insertUser(SCHOOL_ID, { email: 'expirednow@example.com' });
      const used = await insertUser(SCHOOL_ID, { email: 'used@example.com' });
      const revoked = await insertUser(SCHOOL_ID, { email: 'revoked@example.com' });
      await insertUser(SCHOOL_ID, { email: 'none@example.com' });
      await insertAccessLink(admin, pending);
      await insertAccessLink(admin, expired, { expiresAt: new Date('2026-10-16T09:00:00Z') });
      await insertAccessLink(admin, expiredNow, { expiresAt: NOW });
      await insertAccessLink(admin, used, { usedAt: NOW });
      await insertAccessLink(admin, revoked, { revokedAt: NOW });

      expect(await pendingOf()).toEqual({
        'admin@example.com': false,
        'pending@example.com': true,
        'expired@example.com': false,
        'expirednow@example.com': false,
        'used@example.com': false,
        'revoked@example.com': false,
        'none@example.com': false,
      });
    });

    it('ignores an invitation created by the user', async () => {
      const admin = await insertUser(SCHOOL_ID, { email: 'admin@example.com', role: 'ADMIN' });
      await insertAccessLink(admin, null, { purpose: 'INVITATION', role: 'MEMBER' });

      expect(await pendingOf()).toEqual({ 'admin@example.com': false });
    });
  });

  it('returns an empty list for a school without users', async () => {
    await expect(repository.listBySchool(SCHOOL_ID, NOW)).resolves.toEqual([]);
  });
});

/** Instantánea sin el usuario que actúa, que añade el caso de uso. */
type Snapshot = Omit<UserChangeSnapshot, 'actorId'>;

async function insertSession(userId: string, revokedAt: Date | null = null) {
  counter += 1;
  await testPrisma.refreshToken.create({
    data: {
      id: `0192f5a0-0000-7000-8000-${String(1000 + counter).padStart(12, '0')}`,
      userId,
      tokenHash: String(counter).padStart(64, '0'),
      expiresAt: new Date('2026-10-17T10:00:00Z'),
      revokedAt,
    },
  });
}

describe('PrismaSchoolUserRepository.applyChange', () => {
  beforeEach(async () => {
    counter = 0;
    await testPrisma.school.create({
      data: {
        id: SCHOOL_ID,
        name: 'CEIP Uno',
        normalizedName: 'ceipuno',
        municipalityCode: '46250',
      },
    });
    await testPrisma.school.create({
      data: {
        id: OTHER_SCHOOL_ID,
        name: 'CEIP Dos',
        normalizedName: 'ceipdos',
        municipalityCode: '46250',
      },
    });
  });

  it('returns null for a user of another school, a missing one or a DELETED one, without calling plan', async () => {
    const otherSchoolUser = await insertUser(OTHER_SCHOOL_ID);
    const deleted = await insertUser(SCHOOL_ID, { status: 'DELETED' });
    const plan = vi.fn();

    for (const userId of [otherSchoolUser, deleted, '0192f5a0-0000-7000-8000-00000000ffff']) {
      await expect(
        repository.applyChange({ schoolId: SCHOOL_ID, userId, now: NOW, plan }),
      ).resolves.toBeNull();
    }
    expect(plan).not.toHaveBeenCalled();
  });

  it('passes plan the target and the number of ACTIVE administrators of the school only', async () => {
    const target = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    await insertUser(SCHOOL_ID, { role: 'ADMIN' });
    await insertUser(SCHOOL_ID, { role: 'ADMIN' });
    await insertUser(SCHOOL_ID, { role: 'ADMIN', status: 'SUSPENDED' });
    await insertUser(SCHOOL_ID, { role: 'ADMIN', status: 'DELETED' });
    await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    await insertUser(OTHER_SCHOOL_ID, { role: 'ADMIN' });
    let received: Snapshot | undefined;

    await repository.applyChange({
      schoolId: SCHOOL_ID,
      userId: target,
      now: NOW,
      plan: (snapshot) => {
        received = snapshot;
        return null;
      },
    });

    expect(received).toEqual({
      target: { id: target, role: 'MEMBER', status: 'ACTIVE' },
      activeAdminCount: 2,
    });
  });

  it('writes nothing when plan returns null and reports no change', async () => {
    const id = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    await insertSession(id);

    const result = await repository.applyChange({
      schoolId: SCHOOL_ID,
      userId: id,
      now: NOW,
      plan: () => null,
    });

    expect(result).toMatchObject({ change: null, revokedSessions: 0 });
    expect(result?.user).toEqual(result?.previous);
    expect(await testPrisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    expect(await testPrisma.refreshToken.count({ where: { revokedAt: { not: null } } })).toBe(0);
  });

  it('writes nothing and rethrows when plan throws', async () => {
    const admin = await insertUser(SCHOOL_ID, { role: 'ADMIN' });

    await expect(
      repository.applyChange({
        schoolId: SCHOOL_ID,
        userId: admin,
        now: NOW,
        plan: (snapshot) =>
          planUserChange({ type: 'changeRole', role: 'MEMBER' }, { actorId: admin, ...snapshot }),
      }),
    ).rejects.toBeInstanceOf(LastAdminRequired);

    expect(await testPrisma.user.findUniqueOrThrow({ where: { id: admin } })).toMatchObject({
      role: 'ADMIN',
    });
  });

  it('applies a role change and returns the previous and the updated user with the eight list fields', async () => {
    const id = await insertUser(SCHOOL_ID, {
      firstName: 'José María',
      lastName: 'García-López',
      email: 'jose@example.com',
      role: 'MEMBER',
      createdAt: new Date('2026-10-07T09:30:00Z'),
    });
    await insertSession(id);
    const eightFields = {
      id,
      firstName: 'José María',
      lastName: 'García-López',
      email: 'jose@example.com',
      status: 'ACTIVE',
      passwordResetPending: false,
      createdAt: new Date('2026-10-07T09:30:00Z'),
    };

    const result = await repository.applyChange({
      schoolId: SCHOOL_ID,
      userId: id,
      now: NOW,
      plan: () => ({ role: 'ADMIN' }),
    });

    expect(result).toEqual({
      previous: { ...eightFields, role: 'MEMBER' },
      user: { ...eightFields, role: 'ADMIN' },
      change: { role: 'ADMIN' },
      revokedSessions: 0,
    });
    // El cambio de rol no toca las sesiones.
    expect(await testPrisma.refreshToken.count({ where: { revokedAt: { not: null } } })).toBe(0);
  });

  it('suspends the user and revokes only its sessions that were not revoked yet', async () => {
    const target = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    const bystander = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    const alreadyRevokedAt = new Date('2026-10-15T08:00:00Z');
    await insertSession(target);
    await insertSession(target);
    await insertSession(target, alreadyRevokedAt);
    await insertSession(bystander);

    const result = await repository.applyChange({
      schoolId: SCHOOL_ID,
      userId: target,
      now: NOW,
      plan: () => ({ status: 'SUSPENDED', revokeSessions: true }),
    });

    expect(result).toMatchObject({
      user: { status: 'SUSPENDED' },
      previous: { status: 'ACTIVE' },
      revokedSessions: 2,
    });
    const sessions = await testPrisma.refreshToken.findMany({ where: { userId: target } });
    expect(sessions.filter((s) => s.revokedAt?.getTime() === NOW.getTime())).toHaveLength(2);
    // La que ya estaba revocada conserva su primer instante.
    expect(
      sessions.filter((s) => s.revokedAt?.getTime() === alreadyRevokedAt.getTime()),
    ).toHaveLength(1);
    expect(
      await testPrisma.refreshToken.count({ where: { userId: bystander, revokedAt: null } }),
    ).toBe(1);
  });

  it('reports passwordResetPending in the response of the change, before and after', async () => {
    const admin = await insertUser(SCHOOL_ID, { role: 'ADMIN' });
    const id = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    const noReset = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    await insertAccessLink(admin, id);
    const apply = (userId: string) =>
      repository.applyChange({
        schoolId: SCHOOL_ID,
        userId,
        now: NOW,
        plan: () => ({ role: 'ADMIN' }),
      });

    const withReset = await apply(id);
    const withoutReset = await apply(noReset);

    expect(withReset?.previous.passwordResetPending).toBe(true);
    expect(withReset?.user.passwordResetPending).toBe(true);
    expect(withoutReset?.user.passwordResetPending).toBe(false);
  });

  it('does not count an expired reset as pending in the response of the change', async () => {
    const admin = await insertUser(SCHOOL_ID, { role: 'ADMIN' });
    const id = await insertUser(SCHOOL_ID, { role: 'MEMBER' });
    await insertAccessLink(admin, id, { expiresAt: NOW });

    const result = await repository.applyChange({
      schoolId: SCHOOL_ID,
      userId: id,
      now: NOW,
      plan: () => null,
    });

    expect(result?.user.passwordResetPending).toBe(false);
  });

  it('reactivates a suspended user keeping its role and does not revive its sessions', async () => {
    const id = await insertUser(SCHOOL_ID, { role: 'MEMBER', status: 'SUSPENDED' });
    await insertSession(id, new Date('2026-10-15T08:00:00Z'));

    const result = await repository.applyChange({
      schoolId: SCHOOL_ID,
      userId: id,
      now: NOW,
      plan: () => ({ status: 'ACTIVE' }),
    });

    expect(result?.user).toMatchObject({ status: 'ACTIVE', role: 'MEMBER' });
    expect(result?.revokedSessions).toBe(0);
    expect(await testPrisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('serialises concurrent changes of the same school so it keeps an active administrator', async () => {
    const first = await insertUser(SCHOOL_ID, { role: 'ADMIN' });
    const second = await insertUser(SCHOOL_ID, { role: 'ADMIN' });
    const demote = (actorId: string, userId: string) =>
      repository.applyChange({
        schoolId: SCHOOL_ID,
        userId,
        now: NOW,
        plan: (snapshot) =>
          planUserChange({ type: 'changeRole', role: 'MEMBER' }, { actorId, ...snapshot }),
      });

    const results = await Promise.allSettled([demote(first, second), demote(second, first)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(LastAdminRequired);
    expect(await testPrisma.user.count({ where: { schoolId: SCHOOL_ID, role: 'ADMIN' } })).toBe(1);
  });
});

describe('PrismaSchoolUserRepository with an unreachable database', () => {
  it('applyChange throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaSchoolUserRepository(prisma).applyChange({
        schoolId: SCHOOL_ID,
        userId: '0192f5a0-0000-7000-8000-000000000099',
        now: NOW,
        plan: () => null,
      }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });

  it('listBySchool throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaSchoolUserRepository(prisma).listBySchool(SCHOOL_ID, NOW),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
