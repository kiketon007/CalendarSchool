import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type {
  AccessLinkRepository,
  CompletedPasswordReset,
} from '../../domain/accessLink/accessLinkRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { PasswordHasher } from '../credentials/passwordHasher.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { ValidationError } from '../validationError.js';
import { ConfirmPasswordReset } from './confirmPasswordReset.js';

const NOW = new Date('2026-10-18T10:00:00Z');
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const TOKEN = 'token-del-enlace';
const TOKEN_HASH = 'a'.repeat(64);
const PASSWORD = 'Secreta123!';
const PASSWORD_HASH = '$2b$12$'.padEnd(60, 'h');
const validBody = { token: TOKEN, password: PASSWORD };
const COMPLETED: CompletedPasswordReset = {
  userId: 'user-1',
  schoolId: 'school-1',
  revokedSessions: 2,
};

describe('ConfirmPasswordReset', () => {
  let calls: string[];
  let consume: Mock<AttemptLimiter['consume']>;
  let release: Mock<AttemptLimiter['release']>;
  let hashToken: Mock<SecretTokenGenerator['hash']>;
  let findPendingPasswordReset: Mock<AccessLinkRepository['findPendingPasswordReset']>;
  let resetPassword: Mock<AccessLinkRepository['resetPassword']>;
  let hashPassword: Mock<PasswordHasher['hash']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let confirm: ConfirmPasswordReset;

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
    hashToken = vi.fn<SecretTokenGenerator['hash']>().mockReturnValue(TOKEN_HASH);
    findPendingPasswordReset = vi
      .fn<AccessLinkRepository['findPendingPasswordReset']>()
      .mockImplementation(() => {
        calls.push('find');
        return Promise.resolve({ schoolName: 'CEIP Lluís Vives', email: 'ana@example.com' });
      });
    resetPassword = vi.fn<AccessLinkRepository['resetPassword']>().mockImplementation(() => {
      calls.push('reset');
      return Promise.resolve(COMPLETED);
    });
    hashPassword = vi.fn<PasswordHasher['hash']>().mockImplementation(() => {
      calls.push('hash-password');
      return Promise.resolve(PASSWORD_HASH);
    });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    confirm = new ConfirmPasswordReset({
      attemptLimiter: { consume, release },
      accessLinkRepository: { findPendingPasswordReset, resetPassword },
      secretTokenGenerator: { hash: hashToken },
      passwordHasher: { hash: hashPassword },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  const run = (body: unknown = validBody) => confirm.execute({ body, context: CONTEXT });

  it('follows the order limit, link, password rules, password hash and change', async () => {
    await run();

    expect(calls).toEqual(['consume', 'find', 'hash-password', 'reset', 'release']);
  });

  it('changes the password with the hash of the password and the hash of the token, never the clear values', async () => {
    await run();

    expect(resetPassword).toHaveBeenCalledExactlyOnceWith({
      tokenHash: TOKEN_HASH,
      now: NOW,
      passwordHash: PASSWORD_HASH,
    });
    expect(hashPassword).toHaveBeenCalledWith(PASSWORD);
    expect(JSON.stringify(resetPassword.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(resetPassword.mock.calls)).not.toContain(PASSWORD);
  });

  it('counts the attempt under the password-reset key of the client ip', async () => {
    await run();

    expect(consume).toHaveBeenCalledWith('password-reset:203.0.113.7');
  });

  it('releases the attempt after a change, because only invalid links count', async () => {
    await run();

    expect(release).toHaveBeenCalledExactlyOnceWith('attempt-1');
  });

  it('logs PASSWORD_RESET_COMPLETED with the school, the user and the revoked sessions', async () => {
    await run();

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PASSWORD_RESET_COMPLETED',
        school_id: 'school-1',
        user_id: 'user-1',
        revoked_sessions: 2,
      },
      expect.any(String),
    );
  });

  it('ignores any account data in the body: the account comes from the link', async () => {
    await run({ ...validBody, userId: 'other', email: 'x@example.com', role: 'ADMIN' });

    expect(resetPassword).toHaveBeenCalledExactlyOnceWith({
      tokenHash: TOKEN_HASH,
      now: NOW,
      passwordHash: PASSWORD_HASH,
    });
  });

  describe('when the link is not valid', () => {
    it('throws AccessLinkInvalid before validating the password or hashing it', async () => {
      findPendingPasswordReset.mockResolvedValueOnce(null);

      await expect(run({ token: TOKEN, password: '' })).rejects.toBeInstanceOf(AccessLinkInvalid);

      expect(hashPassword).not.toHaveBeenCalled();
      expect(resetPassword).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });

    it.each([
      ['no token', { password: PASSWORD }],
      ['an empty token', { token: '', password: PASSWORD }],
      ['a token that is not a string', { token: 42, password: PASSWORD }],
      ['no body', null],
    ])('throws AccessLinkInvalid without looking anything up for %s', async (_name, body) => {
      await expect(run(body)).rejects.toBeInstanceOf(AccessLinkInvalid);

      expect(findPendingPasswordReset).not.toHaveBeenCalled();
      expect(hashPassword).not.toHaveBeenCalled();
    });

    it('logs PASSWORD_RESET_REJECTED with LINK_INVALID and the ip, and keeps the attempt counted', async () => {
      findPendingPasswordReset.mockResolvedValueOnce(null);

      await run().catch(() => undefined);

      expect(warn).toHaveBeenCalledWith(
        { event: 'PASSWORD_RESET_REJECTED', reason: 'LINK_INVALID', ip: CONTEXT.ip },
        expect.any(String),
      );
      expect(release).not.toHaveBeenCalled();
    });

    it('throws AccessLinkInvalid when the link stops being pending before the change', async () => {
      resetPassword.mockResolvedValueOnce(null);

      await expect(run()).rejects.toBeInstanceOf(AccessLinkInvalid);

      expect(release).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'PASSWORD_RESET_REJECTED', reason: 'LINK_INVALID' }),
        expect.any(String),
      );
    });
  });

  describe('when the password is not valid', () => {
    it.each([
      ['missing', undefined, 'REQUIRED'],
      ['empty', '', 'REQUIRED'],
      ['too short', 'Ab1!', 'INVALID_LENGTH'],
      ['without variety', 'solominusculas', 'WEAK_PASSWORD'],
      ['longer than 72 bytes', `Aa1!${'ñ'.repeat(40)}`, 'INVALID_LENGTH'],
    ])(
      'throws ValidationError on the password field when it is %s, and releases the attempt',
      async (_name, password, code) => {
        await expect(run({ token: TOKEN, password })).rejects.toMatchObject({
          constructor: ValidationError,
          details: [{ field: 'password', code }],
        });

        expect(hashPassword).not.toHaveBeenCalled();
        expect(resetPassword).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledExactlyOnceWith('attempt-1');
      },
    );

    it('does not trim or normalize the password: it is hashed as it arrives', async () => {
      await run({ token: TOKEN, password: ' Secreta123! ' });

      expect(hashPassword).toHaveBeenCalledWith(' Secreta123! ');
    });
  });

  describe('failures of the infrastructure', () => {
    it('propagates TooManyAttempts without looking the link up, and logs the rate limit', async () => {
      consume.mockRejectedValueOnce(new TooManyAttempts(300));

      await expect(run()).rejects.toBeInstanceOf(TooManyAttempts);

      expect(findPendingPasswordReset).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'PASSWORD_RESET_RATE_LIMITED', retry_after: 300 }),
        expect.any(String),
      );
    });

    it('propagates DatabaseUnavailable from the lookup and from the change', async () => {
      findPendingPasswordReset.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
      await expect(run()).rejects.toBeInstanceOf(DatabaseUnavailable);

      resetPassword.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
      await expect(run()).rejects.toBeInstanceOf(DatabaseUnavailable);
    });

    it('still answers when releasing the attempt fails, and logs it', async () => {
      release.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));

      await expect(run()).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'PASSWORD_RESET_ATTEMPT_RELEASE_FAILED' }),
        expect.any(String),
      );
    });
  });

  it('never logs the token, its hash, the password or its hash', async () => {
    await run();
    findPendingPasswordReset.mockResolvedValueOnce(null);
    await run().catch(() => undefined);
    resetPassword.mockResolvedValueOnce(null);
    await run().catch(() => undefined);
    await run({ token: TOKEN, password: 'corta' }).catch(() => undefined);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    for (const secret of [TOKEN, TOKEN_HASH, PASSWORD, PASSWORD_HASH, 'corta']) {
      expect(logged).not.toContain(secret);
    }
  });
});
