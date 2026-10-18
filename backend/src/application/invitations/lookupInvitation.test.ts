import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { INVITATION_ATTEMPTS_WINDOW_MS } from './invitationAttempts.js';
import { LookupInvitation } from './lookupInvitation.js';

const NOW = new Date('2026-10-18T10:00:00Z');
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const TOKEN = 'token-del-enlace';
const TOKEN_HASH = 'a'.repeat(64);

describe('INVITATION_ATTEMPTS_WINDOW_MS', () => {
  it('is the 15 minute sliding window of the invitation attempt limit', () => {
    expect(INVITATION_ATTEMPTS_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('LookupInvitation', () => {
  let calls: string[];
  let consume: Mock<AttemptLimiter['consume']>;
  let release: Mock<AttemptLimiter['release']>;
  let hash: Mock<SecretTokenGenerator['hash']>;
  let findPendingInvitation: Mock<AccessLinkRepository['findPendingInvitation']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let lookupInvitation: LookupInvitation;

  beforeEach(() => {
    calls = [];
    consume = vi.fn<AttemptLimiter['consume']>().mockImplementation(() => {
      calls.push('consume');
      return Promise.resolve('attempt-1');
    });
    release = vi.fn<AttemptLimiter['release']>().mockImplementation(() => {
      calls.push('release');
      return Promise.resolve();
    });
    hash = vi.fn<SecretTokenGenerator['hash']>().mockReturnValue(TOKEN_HASH);
    findPendingInvitation = vi
      .fn<AccessLinkRepository['findPendingInvitation']>()
      .mockImplementation(() => {
        calls.push('find');
        return Promise.resolve({ schoolName: 'CEIP Lluís Vives', role: 'MEMBER' });
      });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    lookupInvitation = new LookupInvitation({
      attemptLimiter: { consume, release },
      accessLinkRepository: { findPendingInvitation },
      secretTokenGenerator: { hash },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  it('returns the school name and the role of the pending invitation', async () => {
    const preview = await lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT });

    expect(preview).toEqual({ schoolName: 'CEIP Lluís Vives', role: 'MEMBER' });
  });

  it('looks the link up by the hash of the token, at the injected instant', async () => {
    await lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT });

    expect(hash).toHaveBeenCalledWith(TOKEN);
    expect(findPendingInvitation).toHaveBeenCalledWith(TOKEN_HASH, NOW);
  });

  it('counts the attempt under the invitation key of the client ip before looking anything up', async () => {
    await lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT });

    expect(consume).toHaveBeenCalledWith('invitation:203.0.113.7');
    expect(calls.indexOf('consume')).toBeLessThan(calls.indexOf('find'));
  });

  it('shares one counter among the requests that cannot be attributed to an ip', async () => {
    await lookupInvitation.execute({
      body: { token: TOKEN },
      context: { ip: undefined, userAgent: undefined },
    });

    expect(consume).toHaveBeenCalledWith('invitation:unknown');
  });

  it('releases the attempt when the link is valid: only invalid links count', async () => {
    await lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT });

    expect(release).toHaveBeenCalledExactlyOnceWith('attempt-1');
  });

  it('still answers when releasing the attempt fails, and logs it', async () => {
    release.mockRejectedValueOnce(new DatabaseUnavailable(new Error('connection refused')));

    const preview = await lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT });

    expect(preview.schoolName).toBe('CEIP Lluís Vives');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'INVITATION_ATTEMPT_RELEASE_FAILED' }),
      expect.any(String),
    );
  });

  it('throws AccessLinkInvalid and keeps the attempt counted when no link is pending', async () => {
    findPendingInvitation.mockResolvedValueOnce(null);

    const error: unknown = await lookupInvitation
      .execute({ body: { token: TOKEN }, context: CONTEXT })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccessLinkInvalid);
    expect((error as AccessLinkInvalid).reason).toBe('NOT_PENDING');
    expect(release).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ token: '' }], [{ token: 42 }], [null], [undefined], ['texto']])(
    'throws AccessLinkInvalid without looking anything up when the body is %j',
    async (body) => {
      const error: unknown = await lookupInvitation
        .execute({ body, context: CONTEXT })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AccessLinkInvalid);
      expect((error as AccessLinkInvalid).reason).toBe('TOKEN_MISSING');
      expect(hash).not.toHaveBeenCalled();
      expect(findPendingInvitation).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    },
  );

  it('propagates TooManyAttempts without looking the link up', async () => {
    consume.mockRejectedValueOnce(new TooManyAttempts(300));

    await expect(
      lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT }),
    ).rejects.toBeInstanceOf(TooManyAttempts);

    expect(findPendingInvitation).not.toHaveBeenCalled();
  });

  it('logs the rate limit as a warning without the token', async () => {
    consume.mockRejectedValueOnce(new TooManyAttempts(300));

    await lookupInvitation
      .execute({ body: { token: TOKEN }, context: CONTEXT })
      .catch(() => undefined);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'INVITATION_RATE_LIMITED',
        ip: '203.0.113.7',
        retry_after: 300,
      }),
      expect.any(String),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
  });

  it('propagates DatabaseUnavailable from the limiter and from the lookup', async () => {
    consume.mockRejectedValueOnce(new DatabaseUnavailable(new Error('connection refused')));
    await expect(
      lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    findPendingInvitation.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
    await expect(
      lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });

  it('never logs the token nor its hash', async () => {
    findPendingInvitation.mockResolvedValueOnce(null);
    await lookupInvitation
      .execute({ body: { token: TOKEN }, context: CONTEXT })
      .catch(() => undefined);
    await lookupInvitation.execute({ body: { token: TOKEN }, context: CONTEXT });

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN_HASH);
  });
});
