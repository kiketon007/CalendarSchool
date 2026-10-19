import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { LookupPasswordReset } from './lookupPasswordReset.js';
import { PASSWORD_RESET_ATTEMPTS_WINDOW_MS } from './passwordResetAttempts.js';

const NOW = new Date('2026-10-18T10:00:00Z');
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const TOKEN = 'token-del-enlace';
const TOKEN_HASH = 'a'.repeat(64);
const EMAIL = 'ana.perez@example.com';

describe('PASSWORD_RESET_ATTEMPTS_WINDOW_MS', () => {
  it('is the 15 minute sliding window of the password reset attempt limit', () => {
    expect(PASSWORD_RESET_ATTEMPTS_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('LookupPasswordReset', () => {
  let calls: string[];
  let consume: Mock<AttemptLimiter['consume']>;
  let release: Mock<AttemptLimiter['release']>;
  let hash: Mock<SecretTokenGenerator['hash']>;
  let findPendingPasswordReset: Mock<AccessLinkRepository['findPendingPasswordReset']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let lookup: LookupPasswordReset;

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
    findPendingPasswordReset = vi
      .fn<AccessLinkRepository['findPendingPasswordReset']>()
      .mockImplementation(() => {
        calls.push('find');
        return Promise.resolve({ schoolName: 'CEIP Lluís Vives', email: EMAIL });
      });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    lookup = new LookupPasswordReset({
      attemptLimiter: { consume, release },
      accessLinkRepository: { findPendingPasswordReset },
      secretTokenGenerator: { hash },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  const run = (body: unknown = { token: TOKEN }) => lookup.execute({ body, context: CONTEXT });

  it('returns the school name and the masked email, never the email in clear', async () => {
    const preview = await run();

    expect(preview).toEqual({ schoolName: 'CEIP Lluís Vives', email: 'a***@example.com' });
    expect(JSON.stringify(preview)).not.toContain(EMAIL);
  });

  it('follows the order limit, link, release and looks the link up by the hash at the injected instant', async () => {
    await run();

    expect(calls).toEqual(['consume', 'find', 'release']);
    expect(hash).toHaveBeenCalledWith(TOKEN);
    expect(findPendingPasswordReset).toHaveBeenCalledExactlyOnceWith(TOKEN_HASH, NOW);
  });

  it('counts the attempt under the password-reset key of the client ip', async () => {
    await run();

    expect(consume).toHaveBeenCalledWith('password-reset:203.0.113.7');
  });

  it('shares one counter among the requests that cannot be attributed to an ip', async () => {
    await lookup.execute({ body: { token: TOKEN }, context: { ip: undefined, userAgent: '' } });

    expect(consume).toHaveBeenCalledWith('password-reset:unknown');
  });

  it('still answers when releasing the attempt fails, and logs it', async () => {
    release.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));

    await expect(run()).resolves.toMatchObject({ schoolName: 'CEIP Lluís Vives' });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'PASSWORD_RESET_ATTEMPT_RELEASE_FAILED' }),
      expect.any(String),
    );
  });

  describe('when the link is not valid', () => {
    it('throws AccessLinkInvalid and keeps the attempt counted when no reset is pending', async () => {
      findPendingPasswordReset.mockResolvedValueOnce(null);

      await expect(run()).rejects.toMatchObject({
        name: 'AccessLinkInvalid',
        reason: 'NOT_PENDING',
      });

      expect(release).not.toHaveBeenCalled();
    });

    it.each([
      ['no body', null],
      ['no token', {}],
      ['an empty token', { token: '' }],
      ['a token that is not a string', { token: 42 }],
      ['an array', [TOKEN]],
    ])('throws AccessLinkInvalid without looking anything up for %s', async (_name, body) => {
      await expect(run(body)).rejects.toBeInstanceOf(AccessLinkInvalid);

      expect(findPendingPasswordReset).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });
  });

  describe('failures of the infrastructure', () => {
    it('propagates TooManyAttempts without looking the link up, and logs the rate limit', async () => {
      consume.mockRejectedValueOnce(new TooManyAttempts(300));

      await expect(run()).rejects.toBeInstanceOf(TooManyAttempts);

      expect(findPendingPasswordReset).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'PASSWORD_RESET_RATE_LIMITED',
          ip: CONTEXT.ip,
          retry_after: 300,
        }),
        expect.any(String),
      );
    });

    it('propagates DatabaseUnavailable from the limiter and from the lookup', async () => {
      consume.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
      await expect(run()).rejects.toBeInstanceOf(DatabaseUnavailable);

      findPendingPasswordReset.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
      await expect(run()).rejects.toBeInstanceOf(DatabaseUnavailable);
    });
  });

  it('never logs the token, its hash or the email', async () => {
    await run();
    findPendingPasswordReset.mockResolvedValueOnce(null);
    await run().catch(() => undefined);
    consume.mockRejectedValueOnce(new TooManyAttempts(60));
    await run().catch(() => undefined);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    for (const secret of [TOKEN, TOKEN_HASH, EMAIL]) {
      expect(logged).not.toContain(secret);
    }
  });
});
