import { describe, expect, it, vi } from 'vitest';
import type {
  AccessLinkRepository,
  PendingInvitation,
} from '../../domain/accessLink/accessLinkRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListPendingInvitations } from './listPendingInvitations.js';

const NOW = new Date('2026-10-17T10:00:00Z');

const pending: PendingInvitation[] = [
  {
    id: 'invitation-1',
    role: 'MEMBER',
    createdBy: { id: 'actor-1', firstName: 'José María', lastName: 'García-López' },
    createdAt: new Date('2026-10-17T09:00:00Z'),
    expiresAt: new Date('2026-10-20T09:00:00Z'),
  },
];

describe('ListPendingInvitations', () => {
  it('asks the repository for the pending invitations of the school at the clock instant', async () => {
    const listPendingInvitations = vi
      .fn<AccessLinkRepository['listPendingInvitations']>()
      .mockResolvedValue(pending);
    const useCase = new ListPendingInvitations({
      accessLinkRepository: { listPendingInvitations },
      now: () => NOW,
    });

    const result = await useCase.execute({ schoolId: 'school-1' });

    expect(result).toEqual(pending);
    expect(listPendingInvitations).toHaveBeenCalledExactlyOnceWith('school-1', NOW);
  });

  it('propagates DatabaseUnavailable', async () => {
    const useCase = new ListPendingInvitations({
      accessLinkRepository: {
        listPendingInvitations: vi
          .fn<AccessLinkRepository['listPendingInvitations']>()
          .mockRejectedValue(new DatabaseUnavailable(new Error('conexión caída'))),
      },
      now: () => NOW,
    });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
