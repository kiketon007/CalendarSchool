import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma, testSchema } from '../test/support/testPrisma.js';

const EMAIL = 'jose.garcia@example.com';
const PASSWORD = 'Secreta123!';
const registerBody = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: EMAIL,
  password: PASSWORD,
  privacyPolicyAccepted: true,
  captcha: { version: 'v3', token: 'token-provisional' },
};
const loginBody = { email: EMAIL, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } };

type App = ReturnType<typeof realApp>['app'];

/** Registra un colegio y devuelve el id de su usuario. */
async function register(app: App): Promise<string> {
  const response = await request(app).post('/api/auth/register').send(registerBody);
  expect(response.status).toBe(201);
  return (response.body as { data: { user: { id: string } } }).data.user.id;
}

function login(app: App, body: unknown = loginBody, cookie?: string) {
  const pending = request(app).post('/api/auth/login').set('Origin', TEST_APP_ORIGIN);
  return (cookie ? pending.set('Cookie', cookie) : pending).send(body as object);
}

function refresh(app: App, cookie: string) {
  return request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookie);
}

/** Par `refresh_token=<valor>` de la cookie que fija una respuesta. */
function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

const code = (response: request.Response) =>
  (response.body as { error: { code: string } }).error.code;

const loginAttempts = () =>
  testPrisma.rateLimitAttempt.count({ where: { key: { startsWith: 'login:' } } });

describe('POST /api/auth/login against the test database', () => {
  describe('a correct login', () => {
    it('answers 204 with a session cookie that refresh turns into the user and the school', async () => {
      const { app } = realApp();
      const userId = await register(app);

      const response = await login(app);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      const cookie = cookieOf(response);
      expect(cookie).toMatch(/^refresh_token=.+/);
      const refreshed = await refresh(app, cookie);
      expect(refreshed.status).toBe(200);
      const { data } = refreshed.body as {
        data: { user: { id: string; email: string }; school: { name: string } };
      };
      expect(data.user).toMatchObject({ id: userId, email: EMAIL });
      expect(data.school.name).toBe('CEIP Lluís Vives');
    });

    it('stores only the hash of the new refresh token, and nothing about the client', async () => {
      const { app } = realApp();
      const userId = await register(app);
      const before = await testPrisma.refreshToken.findFirstOrThrow({ where: { userId } });

      const response = await login(app).set('User-Agent', 'Mozilla/5.0 (login)');

      const token = cookieOf(response).replace('refresh_token=', '');
      const rows = await testPrisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${testSchema}".refresh_tokens WHERE user_id = $1::uuid AND id <> $2::uuid`,
        userId,
        before.id,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]?.token_hash).not.toBe(token);
      expect(rows[0]?.revoked_at).toBeNull();
      // Ninguna columna lleva la IP de la petición ni su user agent.
      expect(JSON.stringify(rows[0])).not.toMatch(/127\.0\.0\.1|::1|Mozilla/);
    });

    it('leaves no attempt behind, because only the failed ones count', async () => {
      const { app } = realApp();
      await register(app);

      await login(app);

      expect(await loginAttempts()).toBe(0);
    });

    it('accepts the email in capitals and with spaces', async () => {
      const { app } = realApp();
      await register(app);

      const response = await login(app, { ...loginBody, email: `  ${EMAIL.toUpperCase()}  ` });

      expect(response.status).toBe(204);
    });

    it('does not revoke the other sessions of the user: both keep working', async () => {
      const { app } = realApp();
      const registration = await request(app).post('/api/auth/register').send(registerBody);
      const registrationCookie = cookieOf(registration);

      const loginCookie = cookieOf(await login(app));

      expect(loginCookie).not.toBe(registrationCookie);
      expect((await refresh(app, registrationCookie)).status).toBe(200);
      expect((await refresh(app, loginCookie)).status).toBe(200);
      expect(await testPrisma.refreshToken.count()).toBe(2);
    });

    it('ignores a session cookie fixed by the client and replaces it', async () => {
      const { app } = realApp();
      await register(app);

      const response = await login(app, loginBody, 'refresh_token=fixed-by-attacker');

      expect(response.status).toBe(204);
      expect(cookieOf(response)).not.toBe('refresh_token=fixed-by-attacker');
      expect((await refresh(app, 'refresh_token=fixed-by-attacker')).status).toBe(401);
      expect((await refresh(app, cookieOf(response))).status).toBe(200);
    });
  });

  describe('credentials that are not valid', () => {
    it('answers the same 401 for a wrong password and for an email that is not registered', async () => {
      const { app } = realApp();
      await register(app);

      const wrongPassword = await login(app, { ...loginBody, password: 'Otra123456!' });
      const unknownEmail = await login(app, { ...loginBody, email: 'nadie@example.com' });

      expect(wrongPassword.status).toBe(401);
      expect(code(wrongPassword)).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
      expect(unknownEmail.headers['set-cookie']).toBeUndefined();
    });

    it('keeps every failed attempt counted, whether the email exists or not', async () => {
      const { app } = realApp();
      await register(app);

      await login(app, { ...loginBody, password: 'Otra123456!' });
      await login(app, { ...loginBody, email: 'nadie@example.com' });

      expect(await loginAttempts()).toBe(2);
    });

    it('creates no session when the credentials fail', async () => {
      const { app } = realApp();
      await register(app);

      await login(app, { ...loginBody, password: 'Otra123456!' });

      expect(await testPrisma.refreshToken.count()).toBe(1);
    });

    it('treats a deleted user as an unknown email, even with the right password', async () => {
      const { app } = realApp();
      const userId = await register(app);
      await testPrisma.user.update({ where: { id: userId }, data: { status: 'DELETED' } });

      const response = await login(app);

      expect(response.status).toBe(401);
      expect(code(response)).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('a suspended user', () => {
    async function suspendedApp() {
      const created = realApp();
      const userId = await register(created.app);
      await testPrisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
      return created;
    }

    it('with the right password gets 403 ACCOUNT_SUSPENDED, no session and no attempt counted', async () => {
      const { app } = await suspendedApp();

      const response = await login(app);

      expect(response.status).toBe(403);
      expect(code(response)).toBe('ACCOUNT_SUSPENDED');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await testPrisma.refreshToken.count()).toBe(1);
      expect(await loginAttempts()).toBe(0);
    });

    it('with a wrong password gets the generic 401, not the state of the account', async () => {
      const { app } = await suspendedApp();

      const response = await login(app, { ...loginBody, password: 'Otra123456!' });

      expect(response.status).toBe(401);
      expect(code(response)).toBe('INVALID_CREDENTIALS');
      expect(await loginAttempts()).toBe(1);
    });
  });

  describe('the steps before the credentials', () => {
    it('answers 400 for an empty body and counts no attempt', async () => {
      const { app } = realApp();

      const response = await login(app, {});

      expect(response.status).toBe(400);
      expect(code(response)).toBe('VALIDATION_ERROR');
      expect(await testPrisma.rateLimitAttempt.count()).toBe(0);
    });

    it('answers 403 without the Origin of the application and counts no attempt', async () => {
      const { app } = realApp();
      await register(app);

      const response = await request(app).post('/api/auth/login').send(loginBody);

      expect(response.status).toBe(403);
      expect(code(response)).toBe('ORIGIN_NOT_ALLOWED');
      expect(await loginAttempts()).toBe(0);
    });

    it.each([
      ['fake-low-score', 422, 'CAPTCHA_CHALLENGE_REQUIRED'],
      ['fake-fail', 422, 'CAPTCHA_FAILED'],
      ['fake-unavailable', 503, 'CAPTCHA_UNAVAILABLE'],
    ])(
      'with the captcha token %s answers %i %s, leaves the attempt counted and checks no password',
      async (token, status, expectedCode) => {
        const { app, logOutput } = realApp();
        await register(app);

        const response = await login(app, { ...loginBody, captcha: { version: 'v3', token } });

        expect(response.status).toBe(status);
        expect(code(response)).toBe(expectedCode);
        expect(await loginAttempts()).toBe(1);
        expect(logOutput()).not.toContain('USER_LOGIN_SUCCESS');
        expect(await testPrisma.refreshToken.count()).toBe(1);
      },
    );

    it('answers 422 CAPTCHA_FAILED without a captcha', async () => {
      const { app } = realApp();

      const response = await login(app, { email: EMAIL, password: PASSWORD });

      expect(response.status).toBe(422);
      expect(code(response)).toBe('CAPTCHA_FAILED');
    });
  });

  describe('the log', () => {
    it('records the events with the masked email and never the password or the tokens', async () => {
      const { app, logOutput } = realApp();
      await register(app);

      const success = await login(app).set('User-Agent', 'Mozilla/5.0 (login)');
      await login(app, { ...loginBody, password: 'Otra123456!' });

      const output = logOutput();
      expect(output).toContain('USER_LOGIN_SUCCESS');
      expect(output).toContain('USER_LOGIN_FAILED');
      expect(output).toContain('j***@example.com');
      expect(output).not.toContain(EMAIL);
      expect(output).not.toContain(PASSWORD);
      expect(output).not.toContain('Otra123456!');
      expect(output).not.toContain(cookieOf(success).replace('refresh_token=', ''));
    });
  });
});
