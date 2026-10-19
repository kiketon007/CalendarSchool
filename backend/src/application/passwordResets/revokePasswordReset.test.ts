import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import { UserNotFound } from '../../domain/user/userManagementErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { RevokePasswordReset } from './revokePasswordReset.js';

const NOW = new Date('2026-10-17T10:00:00Z');
const input = { schoolId: 'school-1', actorId: 'actor-1', userId: 'user-1' };

describe('RevokePasswordReset', () => {
  let revokePasswordReset: Mock<AccessLinkRepository['revokePasswordReset']>;
  let info: Mock<ApplicationLogger['info']>;
  let useCase: RevokePasswordReset;

  beforeEach(() => {
    revokePasswordReset = vi
      .fn<AccessLinkRepository['revokePasswordReset']>()
      .mockResolvedValue('revoked');
    info = vi.fn<ApplicationLogger['info']>();
    useCase = new RevokePasswordReset({
      accessLinkRepository: { revokePasswordReset },
      now: () => NOW,
      logger: { info, warn: vi.fn<ApplicationLogger['warn']>() },
    });
  });

  it('revokes with the school of the request, the user and the clock', async () => {
    await useCase.execute(input);

    expect(revokePasswordReset).toHaveBeenCalledExactlyOnceWith('school-1', 'user-1', NOW);
  });

  it('logs PASSWORD_RESET_LINK_REVOKED when it revokes', async () => {
    await useCase.execute(input);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PASSWORD_RESET_LINK_REVOKED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        user_id: 'user-1',
      },
      expect.any(String),
    );
  });

  it('finishes without error and without an event when there was nothing pending', async () => {
    revokePasswordReset.mockResolvedValue('none');

    await expect(useCase.execute(input)).resolves.toBeUndefined();

    expect(info).not.toHaveBeenCalled();
  });

  it('throws UserNotFound when the user is not in the school', async () => {
    revokePasswordReset.mockResolvedValue('notFound');

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(UserNotFound);

    expect(info).not.toHaveBeenCalled();
  });

  it('propagates DatabaseUnavailable', async () => {
    revokePasswordReset.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
