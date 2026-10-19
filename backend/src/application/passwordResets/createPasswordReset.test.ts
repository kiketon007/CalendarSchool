import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PasswordResetAlreadyPending } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import { UserNotActive, UserNotFound } from '../../domain/user/userManagementErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { CreatePasswordReset } from './createPasswordReset.js';

const NOW = new Date('2026-10-17T10:00:00Z');
const EXPIRES_AT = new Date('2026-10-20T10:00:00Z');
const TOKEN = 'plain-secret-token-0123456789abcdefghijklmnopq';
const TOKEN_HASH = 'a1'.repeat(32);
const APP_ORIGIN = 'https://app.calendarschools.es';

const input = { schoolId: 'school-1', actorId: 'actor-1', userId: 'user-1' };

describe('CreatePasswordReset', () => {
  let createPasswordReset: Mock<AccessLinkRepository['createPasswordReset']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreatePasswordReset;

  beforeEach(() => {
    createPasswordReset = vi
      .fn<AccessLinkRepository['createPasswordReset']>()
      .mockResolvedValue({ outcome: 'created', createdAt: NOW, replaced: 0 });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreatePasswordReset({
      accessLinkRepository: { createPasswordReset },
      secretTokenGenerator: { generate: () => ({ token: TOKEN, hash: TOKEN_HASH }) },
      idGenerator: { generate: () => 'reset-1' },
      appOrigin: APP_ORIGIN,
      now: () => NOW,
      logger: { info, warn },
    });
  });

  it('stores the hash of the token, never the token, for the user and the author of the request', async () => {
    await useCase.execute(input);

    expect(createPasswordReset).toHaveBeenCalledExactlyOnceWith({
      id: 'reset-1',
      schoolId: 'school-1',
      userId: 'user-1',
      createdById: 'actor-1',
      tokenHash: TOKEN_HASH,
      expiresAt: EXPIRES_AT,
      now: NOW,
    });
    expect(JSON.stringify(createPasswordReset.mock.calls)).not.toContain(TOKEN);
  });

  it('expires exactly 72 hours after the clock of the request', async () => {
    await useCase.execute(input);

    expect(createPasswordReset.mock.calls[0]?.[0].expiresAt).toEqual(
      new Date(NOW.getTime() + 72 * 60 * 60 * 1000),
    );
  });

  it('returns the reset and the link with the token in the fragment of the reset page', async () => {
    const result = await useCase.execute(input);

    expect(result).toEqual({
      passwordReset: { userId: 'user-1', createdAt: NOW, expiresAt: EXPIRES_AT },
      url: `${APP_ORIGIN}/restablecer#${TOKEN}`,
    });
  });

  it('retries once, with the same token, when another generation takes the index in between', async () => {
    createPasswordReset
      .mockRejectedValueOnce(new PasswordResetAlreadyPending())
      .mockResolvedValueOnce({ outcome: 'created', createdAt: NOW, replaced: 1 });

    const result = await useCase.execute(input);

    expect(createPasswordReset).toHaveBeenCalledTimes(2);
    expect(createPasswordReset.mock.calls[1]).toEqual(createPasswordReset.mock.calls[0]);
    expect(result.url).toBe(`${APP_ORIGIN}/restablecer#${TOKEN}`);
  });

  it('propagates a second conflict instead of retrying again', async () => {
    createPasswordReset.mockRejectedValue(new PasswordResetAlreadyPending());

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(PasswordResetAlreadyPending);

    expect(createPasswordReset).toHaveBeenCalledTimes(2);
    expect(info).not.toHaveBeenCalled();
  });

  it('translates notFound into UserNotFound without logging an event', async () => {
    createPasswordReset.mockResolvedValue({ outcome: 'notFound' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(UserNotFound);

    expect(info).not.toHaveBeenCalled();
  });

  it('translates notActive into UserNotActive without logging an event', async () => {
    createPasswordReset.mockResolvedValue({ outcome: 'notActive' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(UserNotActive);

    expect(info).not.toHaveBeenCalled();
  });

  it.each([
    [0, false],
    [2, true],
  ])(
    'logs PASSWORD_RESET_LINK_CREATED for %i replaced links with replaced=%s',
    async (count, replaced) => {
      createPasswordReset.mockResolvedValue({
        outcome: 'created',
        createdAt: NOW,
        replaced: count,
      });

      await useCase.execute(input);

      expect(info).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'PASSWORD_RESET_LINK_CREATED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          user_id: 'user-1',
          replaced,
        },
        expect.any(String),
      );
    },
  );

  it('never logs the token, its hash or the link', async () => {
    createPasswordReset
      .mockRejectedValueOnce(new PasswordResetAlreadyPending())
      .mockResolvedValueOnce({ outcome: 'created', createdAt: NOW, replaced: 1 });

    await useCase.execute(input);

    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN_HASH);
    expect(logged).not.toContain('restablecer#');
  });

  it('propagates DatabaseUnavailable', async () => {
    createPasswordReset.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
