import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InvitationNotFound } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { RevokeInvitation } from './revokeInvitation.js';

const NOW = new Date('2026-10-17T10:00:00Z');
const input = { schoolId: 'school-1', actorId: 'actor-1', invitationId: 'invitation-1' };

describe('RevokeInvitation', () => {
  let revokeInvitation: Mock<AccessLinkRepository['revokeInvitation']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: RevokeInvitation;

  beforeEach(() => {
    revokeInvitation = vi.fn<AccessLinkRepository['revokeInvitation']>();
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new RevokeInvitation({
      accessLinkRepository: { revokeInvitation },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  it('asks the repository to revoke the invitation of the school at the clock instant', async () => {
    revokeInvitation.mockResolvedValue('revoked');

    await useCase.execute(input);

    expect(revokeInvitation).toHaveBeenCalledExactlyOnceWith('school-1', 'invitation-1', NOW);
  });

  it('logs INVITATION_REVOKED when it revokes a pending invitation', async () => {
    revokeInvitation.mockResolvedValue('revoked');

    await useCase.execute(input);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'INVITATION_REVOKED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        invitation_id: 'invitation-1',
      },
      expect.any(String),
    );
  });

  it('finishes without error and without logging when the invitation is no longer pending', async () => {
    revokeInvitation.mockResolvedValue('notPending');

    await expect(useCase.execute(input)).resolves.toBeUndefined();

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws InvitationNotFound when it is not an invitation of the school, without logging', async () => {
    revokeInvitation.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(InvitationNotFound);

    expect(info).not.toHaveBeenCalled();
  });

  it('propagates DatabaseUnavailable without logging', async () => {
    revokeInvitation.mockRejectedValue(new DatabaseUnavailable(new Error('conexión caída')));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(DatabaseUnavailable);

    expect(info).not.toHaveBeenCalled();
  });
});
