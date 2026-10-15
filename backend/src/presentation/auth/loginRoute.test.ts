import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDependencies } from '../../app.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
} from '../../application/registration/captchaVerifier.js';
import { ValidationError } from '../../application/validationError.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { AccountSuspended, InvalidCredentials } from '../../domain/login/loginErrors.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies, TEST_APP_ORIGIN } from '../../../test/support/appDoubles.js';

const PLAIN_REFRESH_TOKEN = 'plain-refresh-token';

const loginBody = {
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
  captcha: { version: 'v3', token: 'token' },
};

describe('POST /api/auth/login', () => {
  let execute: ReturnType<typeof vi.fn<AppDependencies['logIn']['execute']>>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    execute = vi
      .fn<AppDependencies['logIn']['execute']>()
      .mockResolvedValue({ refreshToken: PLAIN_REFRESH_TOKEN });
    app = createApp({
      ...defaultDependencies,
      logIn: { execute },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  /** Petición de login desde el origen de la aplicación. */
  function login(body: unknown = loginBody) {
    return request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_APP_ORIGIN)
      .send(body as object);
  }

  describe('a correct login', () => {
    it('responds 204 without a body and forbids caching', async () => {
      const response = await login();

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('sets the refresh_token cookie with the properties of the session', async () => {
      const response = await login();

      expect(response.headers['set-cookie']).toEqual([
        `refresh_token=${PLAIN_REFRESH_TOKEN}; Max-Age=86400; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`,
      ]);
    });

    it('never puts the refresh token or an access token in the body', async () => {
      const response = await login();

      expect(JSON.stringify(response.body)).not.toContain(PLAIN_REFRESH_TOKEN);
      expect(response.body).toEqual({});
    });

    it('passes the body, the client ip and the user agent to the use case, and nothing else', async () => {
      await login().set('User-Agent', 'Mozilla/5.0');

      expect(execute).toHaveBeenCalledOnce();
      expect(execute).toHaveBeenCalledWith(loginBody, {
        ip: expect.stringMatching(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/) as string,
        userAgent: 'Mozilla/5.0',
      });
    });

    it('ignores a refresh_token cookie that arrives with the request, and replaces it', async () => {
      const response = await login().set('Cookie', 'refresh_token=fixed-by-attacker');

      expect(JSON.stringify(execute.mock.calls)).not.toContain('fixed-by-attacker');
      const setCookie = (response.headers['set-cookie'] as unknown as string[]).join();
      expect(setCookie).toContain(`refresh_token=${PLAIN_REFRESH_TOKEN};`);
      expect(setCookie).not.toContain('fixed-by-attacker');
    });
  });

  describe('the Origin check (step 1)', () => {
    it.each([
      ['another origin', 'https://malicioso.example'],
      ['no origin', undefined],
    ])(
      'responds 403 ORIGIN_NOT_ALLOWED from %s without calling the use case',
      async (_case, origin) => {
        const pending = request(app).post('/api/auth/login').send(loginBody);
        const response = await (origin === undefined ? pending : pending.set('Origin', origin));

        expect(response.status).toBe(403);
        expect((response.body as { error: { code: string } }).error.code).toBe(
          'ORIGIN_NOT_ALLOWED',
        );
        expect(execute).not.toHaveBeenCalled();
        expect(response.headers['set-cookie']).toBeUndefined();
      },
    );

    it('enables no CORS for another origin, neither in the request nor in a preflight', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://malicioso.example')
        .send(loginBody);
      const preflight = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://malicioso.example')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('the errors of the use case', () => {
    it.each([
      ['InvalidCredentials', new InvalidCredentials('PASSWORD'), 401, 'INVALID_CREDENTIALS'],
      ['AccountSuspended', new AccountSuspended(), 403, 'ACCOUNT_SUSPENDED'],
      [
        'ValidationError',
        new ValidationError([{ field: 'email', code: 'REQUIRED' }]),
        400,
        'VALIDATION_ERROR',
      ],
      ['TooManyAttempts', new TooManyAttempts(300), 429, 'TOO_MANY_REQUESTS'],
      ['CaptchaFailed', new CaptchaFailed('INVALID'), 422, 'CAPTCHA_FAILED'],
      [
        'CaptchaChallengeRequired',
        new CaptchaChallengeRequired(0.3),
        422,
        'CAPTCHA_CHALLENGE_REQUIRED',
      ],
      [
        'CaptchaUnavailable',
        new CaptchaUnavailable(new Error('timeout')),
        503,
        'CAPTCHA_UNAVAILABLE',
      ],
      [
        'DatabaseUnavailable',
        new DatabaseUnavailable(new Error('caída')),
        503,
        'DATABASE_UNAVAILABLE',
      ],
    ])('translates %s and sets no cookie', async (_case, error, status, code) => {
      execute.mockRejectedValueOnce(error);

      const response = await login();

      expect(response.status).toBe(status);
      expect((response.body as { error: { code: string } }).error.code).toBe(code);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('adds Retry-After to a 429', async () => {
      execute.mockRejectedValueOnce(new TooManyAttempts(300));

      const response = await login();

      expect(response.headers['retry-after']).toBe('300');
    });

    it('answers the same body for a wrong password and for an email that is not registered', async () => {
      execute.mockRejectedValueOnce(new InvalidCredentials('PASSWORD'));
      const wrongPassword = await login();
      execute.mockRejectedValueOnce(new InvalidCredentials('NOT_FOUND'));
      const unknownEmail = await login();

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });
  });

  it('responds 400 INVALID_JSON for a body that is not JSON, without calling the use case', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_APP_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{ roto');

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('INVALID_JSON');
    expect(execute).not.toHaveBeenCalled();
  });
});
