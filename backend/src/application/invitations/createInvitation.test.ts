import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  AccessLinkRepository,
  PendingInvitation,
} from '../../domain/accessLink/accessLinkRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { CreateInvitation } from './createInvitation.js';

const NOW = new Date('2026-10-17T10:00:00Z');
const EXPIRES_AT = new Date('2026-10-20T10:00:00Z');
const TOKEN = 'plain-secret-token-0123456789abcdefghijklmnopq';
const TOKEN_HASH = 'a1'.repeat(32);
const APP_ORIGIN = 'https://app.calendarschools.es';

const input = { schoolId: 'school-1', actorId: 'actor-1', role: 'MEMBER' } as const;

function invitationFor(overrides: Partial<PendingInvitation> = {}): PendingInvitation {
  return {
    id: 'invitation-1',
    role: 'MEMBER',
    createdBy: { id: 'actor-1', firstName: 'José María', lastName: 'García-López' },
    createdAt: NOW,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('CreateInvitation', () => {
  let createInvitation: Mock<AccessLinkRepository['createInvitation']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreateInvitation;

  beforeEach(() => {
    createInvitation = vi
      .fn<AccessLinkRepository['createInvitation']>()
      .mockResolvedValue(invitationFor());
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreateInvitation({
      accessLinkRepository: { createInvitation },
      secretTokenGenerator: { generate: () => ({ token: TOKEN, hash: TOKEN_HASH }) },
      idGenerator: { generate: () => 'invitation-1' },
      appOrigin: APP_ORIGIN,
      now: () => NOW,
      logger: { info, warn },
    });
  });

  it('stores the hash of the token, never the token, with the school, the role and the author of the request', async () => {
    await useCase.execute(input);

    expect(createInvitation).toHaveBeenCalledExactlyOnceWith({
      id: 'invitation-1',
      schoolId: 'school-1',
      tokenHash: TOKEN_HASH,
      role: 'MEMBER',
      createdById: 'actor-1',
      expiresAt: EXPIRES_AT,
    });
    expect(JSON.stringify(createInvitation.mock.calls)).not.toContain(TOKEN);
  });

  it('expires exactly 72 hours after the clock of the request', async () => {
    await useCase.execute({ ...input, role: 'ADMIN' });

    expect(createInvitation.mock.calls[0]?.[0].expiresAt).toEqual(
      new Date(NOW.getTime() + 72 * 60 * 60 * 1000),
    );
    expect(createInvitation.mock.calls[0]?.[0].role).toBe('ADMIN');
  });

  it('returns the invitation and the link with the fragment, built with the origin of the application', async () => {
    const result = await useCase.execute(input);

    expect(result).toEqual({
      invitation: invitationFor(),
      url: `${APP_ORIGIN}/invitacion#${TOKEN}`,
    });
  });

  it('logs INVITATION_CREATED with the school, the actor, the invitation and the role', async () => {
    await useCase.execute(input);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'INVITATION_CREATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        invitation_id: 'invitation-1',
        role: 'MEMBER',
      },
      expect.any(String),
    );
  });

  it('never puts the token, its hash or the link in the logs', async () => {
    await useCase.execute(input);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN_HASH);
    expect(logged).not.toContain('invitacion#');
  });

  it('propagates DatabaseUnavailable without logging anything', async () => {
    createInvitation.mockRejectedValue(new DatabaseUnavailable(new Error('conexión caída')));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(DatabaseUnavailable);

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
