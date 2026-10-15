import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';

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

/** Par `refresh_token=<valor>` de la cookie que fija una respuesta. */
function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio y devuelve la cookie de la sesión del alta y el id del usuario. */
async function register(app: App) {
  const response = await request(app).post('/api/auth/register').send(registerBody);
  expect(response.status).toBe(201);
  return {
    cookie: cookieOf(response),
    userId: (response.body as { data: { user: { id: string } } }).data.user.id,
  };
}

/** Inicia otra sesión del mismo usuario (otro navegador) y devuelve su cookie. */
async function loginAgain(app: App): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', TEST_APP_ORIGIN)
    .send(loginBody);
  expect(response.status).toBe(204);
  return cookieOf(response);
}

function logout(app: App, cookie?: string) {
  const pending = request(app).post('/api/auth/logout').set('Origin', TEST_APP_ORIGIN);
  return cookie ? pending.set('Cookie', cookie) : pending;
}

function refresh(app: App, cookie: string) {
  return request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookie);
}

describe('POST /api/auth/logout against the test database', () => {
  it('revokes the session so that refresh no longer works with its cookie', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);
    expect((await refresh(app, cookie)).status).toBe(200);

    const response = await logout(app, cookie);

    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']).toEqual([
      'refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax',
    ]);
    const stored = await testPrisma.refreshToken.findFirstOrThrow({ where: { userId } });
    expect(stored.revokedAt).not.toBeNull();
    const afterwards = await refresh(app, cookie);
    expect(afterwards.status).toBe(401);
    expect((afterwards.body as { error: { code: string } }).error.code).toBe('INVALID_SESSION');
  });

  it('revokes only the session of the cookie and leaves the others valid', async () => {
    const { app } = realApp();
    const { cookie: firstCookie, userId } = await register(app);
    const secondCookie = await loginAgain(app);

    await logout(app, firstCookie);

    expect((await refresh(app, firstCookie)).status).toBe(401);
    expect((await refresh(app, secondCookie)).status).toBe(200);
    expect(await testPrisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);
  });

  it('is idempotent: a second logout answers 204 and keeps the first revocation instant', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);
    await logout(app, cookie);
    const first = await testPrisma.refreshToken.findFirstOrThrow({ where: { userId } });

    const second = await logout(app, cookie);

    expect(second.status).toBe(204);
    const after = await testPrisma.refreshToken.findFirstOrThrow({ where: { userId } });
    expect(after.revokedAt).toEqual(first.revokedAt);
  });

  it.each([
    ['without a cookie', undefined],
    ['with an unknown token', 'refresh_token=not-a-known-token'],
  ])('answers 204 and changes nothing %s', async (_case, cookie) => {
    const { app } = realApp();
    const { userId } = await register(app);

    const response = await logout(app, cookie);

    expect(response.status).toBe(204);
    expect(await testPrisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);
  });

  it('lets a suspended user close their session', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);
    await testPrisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    const response = await logout(app, cookie);

    expect(response.status).toBe(204);
    expect(await testPrisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('logs the closing without the token or its hash', async () => {
    const { app, logOutput } = realApp();
    const { cookie } = await register(app);

    await logout(app, cookie);
    await logout(app, cookie);

    const output = logOutput();
    expect(output).toContain('USER_LOGOUT');
    expect(output).toContain('USER_LOGOUT_WITHOUT_SESSION');
    expect(output).toContain('"reason":"REVOKED"');
    expect(output).not.toContain(cookie.split('=')[1]);
  });

  it('does not touch the session when the origin is not allowed', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://malicioso.example')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(await testPrisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);
  });
});
