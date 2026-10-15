import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { AccountSuspended, InvalidCredentials } from '../../domain/login/loginErrors.js';
import type { RefreshToken } from '../../domain/session/refreshToken.js';
import type { RefreshTokenRepository } from '../../domain/session/refreshTokenRepository.js';
import type { UserCredentialsRepository } from '../../domain/user/userCredentialsRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { RequestContext } from '../requestContext.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { PasswordHasher } from '../credentials/passwordHasher.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
  type CaptchaVerifier,
} from '../registration/captchaVerifier.js';
import type { CreateSession, NewSession } from '../session/createSession.js';
import { ValidationError } from '../validationError.js';
import { LogIn } from './logIn.js';

const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const PASSWORD = 'Secreta123!';
const PLAIN_REFRESH_TOKEN = 'plain-refresh-token';
const REFRESH_TOKEN: RefreshToken = {
  id: 'refresh-token-id',
  userId: 'user-1',
  tokenHash: 'f'.repeat(64),
  expiresAt: new Date('2026-10-15T10:00:00Z'),
  revokedAt: null,
};
const NEW_SESSION: NewSession = { token: PLAIN_REFRESH_TOKEN, refreshToken: REFRESH_TOKEN };
const validBody = {
  email: '  Jose.Garcia@Example.COM ',
  password: PASSWORD,
  captcha: { version: 'v3', token: 'token' },
};

describe('LogIn', () => {
  let calls: string[];
  let consume: Mock<AttemptLimiter['consume']>;
  let release: Mock<AttemptLimiter['release']>;
  let verifyCaptcha: Mock<CaptchaVerifier['verify']>;
  let findByEmail: Mock<UserCredentialsRepository['findByEmail']>;
  let verifyPassword: Mock<PasswordHasher['verify']>;
  let createSession: Mock<CreateSession['create']>;
  let save: Mock<RefreshTokenRepository['save']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let logIn: LogIn;

  beforeEach(() => {
    calls = [];
    /** Mock que anota su nombre en `calls` al ejecutarse y devuelve `value`. */
    const track = <T>(name: string, value: T) =>
      vi.fn(() => {
        calls.push(name);
        return Promise.resolve(value);
      });
    consume = track('consume', 'attempt-1');
    release = track('release', undefined);
    verifyCaptcha = track('verifyCaptcha', undefined);
    findByEmail = track('findByEmail', null);
    verifyPassword = track('verifyPassword', false);
    createSession = vi.fn<CreateSession['create']>(() => {
      calls.push('createSession');
      return NEW_SESSION;
    });
    save = track('save', undefined);
    info = vi.fn();
    warn = vi.fn();
    logIn = new LogIn({
      attemptLimiter: { consume, release },
      captchaVerifier: { verify: verifyCaptcha },
      userCredentialsRepository: { findByEmail },
      passwordHasher: { verify: verifyPassword },
      createSession: { create: createSession },
      refreshTokenRepository: { save },
      logger: { info, warn },
    });
  });

  const rejection = (body: unknown, context: RequestContext = CONTEXT): Promise<unknown> =>
    logIn.execute(body, context).then(
      () => undefined,
      (error: unknown) => error,
    );

  describe('the validation of the body (step 2)', () => {
    it.each([
      ['no email', { ...validBody, email: undefined }, [{ field: 'email', code: 'REQUIRED' }]],
      [
        'a malformed email',
        { ...validBody, email: 'sin-arroba' },
        [{ field: 'email', code: 'INVALID_FORMAT' }],
      ],
      [
        'an empty password',
        { ...validBody, password: '' },
        [{ field: 'password', code: 'REQUIRED' }],
      ],
      [
        'a body that is not an object',
        'texto',
        [
          { field: 'email', code: 'REQUIRED' },
          { field: 'password', code: 'REQUIRED' },
        ],
      ],
    ])('rejects %s with a ValidationError', async (_case, body, details) => {
      const error = await rejection(body);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual(details);
    });

    it('does not count the attempt, verify the captcha or look the user up', async () => {
      await rejection({ ...validBody, email: 'sin-arroba' });

      expect(calls).toEqual([]);
    });
  });

  describe('the attempt limit (step 3)', () => {
    it('counts the attempt against the key of the operation and the IP of the client', async () => {
      await rejection(validBody);

      expect(consume).toHaveBeenCalledOnce();
      expect(consume).toHaveBeenCalledWith('login:203.0.113.7');
    });

    it('shares one counter between the requests whose IP is unknown', async () => {
      await rejection(validBody, { ip: undefined, userAgent: undefined });

      expect(consume).toHaveBeenCalledWith('login:unknown');
    });

    it('counts the attempt before verifying the captcha', async () => {
      await rejection(validBody);

      expect(calls.slice(0, 2)).toEqual(['consume', 'verifyCaptcha']);
    });

    it('propagates TooManyAttempts without verifying the captcha or looking the user up', async () => {
      consume.mockRejectedValueOnce(new TooManyAttempts(300));

      const error = await rejection(validBody);

      expect(error).toBeInstanceOf(TooManyAttempts);
      expect((error as TooManyAttempts).retryAfterSeconds).toBe(300);
      expect(verifyCaptcha).not.toHaveBeenCalled();
      expect(findByEmail).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });

    it('logs USER_LOGIN_RATE_LIMITED with the masked email, the IP and the wait', async () => {
      consume.mockRejectedValueOnce(new TooManyAttempts(300));

      await rejection(validBody);

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        {
          event: 'USER_LOGIN_RATE_LIMITED',
          email: 'j***@example.com',
          ip: CONTEXT.ip,
          user_agent: CONTEXT.userAgent,
          retry_after: 300,
        },
        expect.any(String),
      );
    });

    it('fails closed when the database does not answer: no attempt, no more steps', async () => {
      consume.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

      expect(await rejection(validBody)).toBeInstanceOf(DatabaseUnavailable);
      expect(verifyCaptcha).not.toHaveBeenCalled();
      expect(findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('the captcha (step 4)', () => {
    it('verifies the captcha field of the request with the action login', async () => {
      await rejection(validBody);

      expect(verifyCaptcha).toHaveBeenCalledOnce();
      expect(verifyCaptcha).toHaveBeenCalledWith(validBody.captcha, 'login');
    });

    it.each([
      ['a failed captcha', new CaptchaFailed('INVALID')],
      ['a low score', new CaptchaChallengeRequired(0.3)],
      ['Google unavailable', new CaptchaUnavailable(new Error('timeout'))],
    ])(
      'propagates %s without looking the user up, comparing the password or releasing the attempt',
      async (_case, failure) => {
        verifyCaptcha.mockRejectedValueOnce(failure);

        const error = await rejection(validBody);

        expect(error).toBe(failure);
        expect(findByEmail).not.toHaveBeenCalled();
        expect(verifyPassword).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
      },
    );

    it('logs the challenge as info with the score, and never the token', async () => {
      verifyCaptcha.mockRejectedValueOnce(new CaptchaChallengeRequired(0.3));

      await rejection(validBody);

      expect(info).toHaveBeenCalledWith(
        {
          event: 'USER_LOGIN_CAPTCHA_CHALLENGE',
          email: 'j***@example.com',
          score: 0.3,
          ip: CONTEXT.ip,
          user_agent: CONTEXT.userAgent,
        },
        expect.any(String),
      );
      expect(JSON.stringify([...info.mock.calls, ...warn.mock.calls])).not.toContain('token');
    });

    it('logs a failed captcha as a warning with the reason and the version', async () => {
      verifyCaptcha.mockRejectedValueOnce(new CaptchaFailed('ACTION_MISMATCH'));

      await rejection(validBody);

      expect(warn).toHaveBeenCalledWith(
        {
          event: 'USER_LOGIN_CAPTCHA_FAILED',
          email: 'j***@example.com',
          reason: 'ACTION_MISMATCH',
          version: 'v3',
          ip: CONTEXT.ip,
          user_agent: CONTEXT.userAgent,
        },
        expect.any(String),
      );
    });

    it('does not log the unavailability of Google: the central error handler does', async () => {
      verifyCaptcha.mockRejectedValueOnce(new CaptchaUnavailable(new Error('timeout')));

      await rejection(validBody);

      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('the credentials (step 5)', () => {
    const PASSWORD_HASH = '$2b$12$hash-simulado';
    const USER_ID = 'user-1';

    const userWith = (status: 'ACTIVE' | 'SUSPENDED' | 'DELETED') => ({
      id: USER_ID,
      passwordHash: PASSWORD_HASH,
      status,
    });

    it('looks the user up by the normalized email, only after the captcha', async () => {
      await rejection(validBody);

      expect(findByEmail).toHaveBeenCalledOnce();
      expect(findByEmail).toHaveBeenCalledWith('jose.garcia@example.com');
      expect(calls.indexOf('verifyCaptcha')).toBeLessThan(calls.indexOf('findByEmail'));
    });

    it('compares the password against the stored hash of an existing user', async () => {
      findByEmail.mockResolvedValueOnce(userWith('ACTIVE'));

      await rejection(validBody);

      expect(verifyPassword).toHaveBeenCalledOnce();
      expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, PASSWORD_HASH);
    });

    describe('an email that is not registered', () => {
      it('still compares the password, against no hash, so the work does not reveal the email', async () => {
        findByEmail.mockResolvedValueOnce(null);

        await rejection(validBody);

        expect(verifyPassword).toHaveBeenCalledOnce();
        expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, null);
      });

      it('fails with InvalidCredentials NOT_FOUND and keeps the attempt counted', async () => {
        findByEmail.mockResolvedValueOnce(null);

        const error = await rejection(validBody);

        expect(error).toBeInstanceOf(InvalidCredentials);
        expect((error as InvalidCredentials).reason).toBe('NOT_FOUND');
        expect(release).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it('logs USER_LOGIN_FAILED with the reason NOT_FOUND and the masked email', async () => {
        findByEmail.mockResolvedValueOnce(null);

        await rejection(validBody);

        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(
          {
            event: 'USER_LOGIN_FAILED',
            email: 'j***@example.com',
            reason: 'NOT_FOUND',
            ip: CONTEXT.ip,
            user_agent: CONTEXT.userAgent,
          },
          expect.any(String),
        );
      });
    });

    describe('a wrong password', () => {
      beforeEach(() => {
        findByEmail.mockResolvedValueOnce(userWith('ACTIVE'));
        verifyPassword.mockResolvedValueOnce(false);
      });

      it('fails with InvalidCredentials PASSWORD and keeps the attempt counted', async () => {
        const error = await rejection(validBody);

        expect(error).toBeInstanceOf(InvalidCredentials);
        expect((error as InvalidCredentials).reason).toBe('PASSWORD');
        expect(release).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it('logs USER_LOGIN_FAILED with the reason PASSWORD', async () => {
        await rejection(validBody);

        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'USER_LOGIN_FAILED', reason: 'PASSWORD' }),
          expect.any(String),
        );
      });

      it('is told apart from an unknown email only by the reason that goes to the log', async () => {
        const wrongPassword = await rejection(validBody);
        findByEmail.mockResolvedValueOnce(null);
        const unknownEmail = await rejection(validBody);

        expect((wrongPassword as Error).name).toBe((unknownEmail as Error).name);
        expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
      });
    });

    describe('a deleted user', () => {
      it('is treated as an unknown email, even with the right password', async () => {
        findByEmail.mockResolvedValueOnce(userWith('DELETED'));
        verifyPassword.mockResolvedValue(true);

        const error = await rejection(validBody);

        expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, null);
        expect(error).toBeInstanceOf(InvalidCredentials);
        expect((error as InvalidCredentials).reason).toBe('NOT_FOUND');
        expect(release).not.toHaveBeenCalled();
      });
    });

    describe('a suspended user', () => {
      it('with the right password gets AccountSuspended and the attempt is released', async () => {
        findByEmail.mockResolvedValueOnce(userWith('SUSPENDED'));
        verifyPassword.mockResolvedValueOnce(true);

        const error = await rejection(validBody);

        expect(error).toBeInstanceOf(AccountSuspended);
        expect(release).toHaveBeenCalledOnce();
        expect(release).toHaveBeenCalledWith('attempt-1');
        expect(createSession).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it('logs USER_LOGIN_FAILED with the reason SUSPENDED', async () => {
        findByEmail.mockResolvedValueOnce(userWith('SUSPENDED'));
        verifyPassword.mockResolvedValueOnce(true);

        await rejection(validBody);

        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'USER_LOGIN_FAILED',
            reason: 'SUSPENDED',
            email: 'j***@example.com',
          }),
          expect.any(String),
        );
      });

      it('with a wrong password gets the generic InvalidCredentials, not the state of the account', async () => {
        findByEmail.mockResolvedValueOnce(userWith('SUSPENDED'));
        verifyPassword.mockResolvedValueOnce(false);

        const error = await rejection(validBody);

        expect(error).toBeInstanceOf(InvalidCredentials);
        expect(release).not.toHaveBeenCalled();
      });

      it('still answers AccountSuspended when releasing the attempt fails, and logs it', async () => {
        findByEmail.mockResolvedValueOnce(userWith('SUSPENDED'));
        verifyPassword.mockResolvedValueOnce(true);
        release.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

        const error = await rejection(validBody);

        expect(error).toBeInstanceOf(AccountSuspended);
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'LOGIN_ATTEMPT_RELEASE_FAILED' }),
          expect.any(String),
        );
      });
    });

    it('fails closed when the database does not answer while looking the user up', async () => {
      findByEmail.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

      expect(await rejection(validBody)).toBeInstanceOf(DatabaseUnavailable);
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });

    it('never puts the password, the hash or the captcha token in the logs', async () => {
      findByEmail.mockResolvedValueOnce(userWith('SUSPENDED'));
      verifyPassword.mockResolvedValueOnce(true);
      release.mockRejectedValueOnce(new Error('fallo'));

      await rejection(validBody);
      findByEmail.mockResolvedValueOnce(userWith('ACTIVE'));
      await rejection(validBody);

      const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
      expect(logged).not.toContain(PASSWORD);
      expect(logged).not.toContain(PASSWORD_HASH);
      expect(logged).not.toContain('"token"');
    });
  });

  describe('a correct login (steps 6 and 7)', () => {
    beforeEach(() => {
      // Como `mockResolvedValueOnce` sustituye al doble que anota la llamada, se anota aquí.
      findByEmail.mockImplementationOnce(() => {
        calls.push('findByEmail');
        return Promise.resolve({
          id: 'user-1',
          passwordHash: '$2b$12$hash-simulado',
          status: 'ACTIVE',
        });
      });
      verifyPassword.mockImplementationOnce(() => {
        calls.push('verifyPassword');
        return Promise.resolve(true);
      });
    });

    it('returns the plain refresh token for the cookie, and nothing else', async () => {
      const result = await logIn.execute(validBody, CONTEXT);

      expect(result).toEqual({ refreshToken: PLAIN_REFRESH_TOKEN });
    });

    it('creates a session for the user, with nothing of the request, and saves it', async () => {
      await logIn.execute(validBody, CONTEXT);

      expect(createSession).toHaveBeenCalledOnce();
      expect(createSession).toHaveBeenCalledWith('user-1');
      expect(save).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledWith(REFRESH_TOKEN);
    });

    it('releases the reserved attempt, because only the failed ones count', async () => {
      await logIn.execute(validBody, CONTEXT);

      expect(release).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledWith('attempt-1');
    });

    it('follows the order: attempt, captcha, user, password, release and session', async () => {
      await logIn.execute(validBody, CONTEXT);

      expect(calls).toEqual([
        'consume',
        'verifyCaptcha',
        'findByEmail',
        'verifyPassword',
        'release',
        'createSession',
        'save',
      ]);
    });

    it('logs USER_LOGIN_SUCCESS with the masked email, the IP and the user agent', async () => {
      await logIn.execute(validBody, CONTEXT);

      expect(info).toHaveBeenCalledOnce();
      expect(info).toHaveBeenCalledWith(
        {
          event: 'USER_LOGIN_SUCCESS',
          email: 'j***@example.com',
          user_id: 'user-1',
          ip: CONTEXT.ip,
          user_agent: CONTEXT.userAgent,
        },
        expect.any(String),
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('never puts the password or the refresh token in the logs', async () => {
      await logIn.execute(validBody, CONTEXT);

      const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
      expect(logged).not.toContain(PASSWORD);
      expect(logged).not.toContain(PLAIN_REFRESH_TOKEN);
    });

    it('does not fail when releasing the attempt fails: it logs it and keeps going', async () => {
      release.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

      const result = await logIn.execute(validBody, CONTEXT);

      expect(result).toEqual({ refreshToken: PLAIN_REFRESH_TOKEN });
      expect(save).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'LOGIN_ATTEMPT_RELEASE_FAILED',
          email: 'j***@example.com',
          ip: CONTEXT.ip,
        }),
        expect.any(String),
      );
    });

    it('does not log USER_LOGIN_SUCCESS when the session cannot be saved', async () => {
      save.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

      const error = await rejection(validBody);

      expect(error).toBeInstanceOf(DatabaseUnavailable);
      expect(info).not.toHaveBeenCalled();
    });

    it('keeps the attempt released even if the session cannot be saved: the password was right', async () => {
      save.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

      await rejection(validBody);

      expect(release).toHaveBeenCalledWith('attempt-1');
    });
  });
});
