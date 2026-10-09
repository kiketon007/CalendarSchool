import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';

const validBody = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
  captcha: { version: 'v3', token: 'token-provisional' },
};

type App = ReturnType<typeof realApp>['app'];

/** Registra un colegio y devuelve el par `refresh_token=<valor>` de la cookie y el id del usuario. */
async function register(app: App, cookie?: string) {
  const pending = request(app).post('/api/auth/register');
  const response = await (cookie ? pending.set('Cookie', cookie) : pending).send(validBody);
  expect(response.status).toBe(201);
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  const [pair] = (setCookie ?? '').split(';');
  return {
    cookie: pair ?? '',
    userId: (response.body as { data: { user: { id: string } } }).data.user.id,
  };
}

function refresh(app: App, cookie: string) {
  return request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookie);
}

describe('session against the test database', () => {
  it('starts a session on registration that refresh turns into a valid access token', async () => {
    const { app, tokenIssuer } = realApp();
    const { cookie, userId } = await register(app);

    const response = await refresh(app, cookie);

    expect(response.status).toBe(200);
    const { data } = response.body as {
      data: {
        session: { accessToken: string; expiresIn: number };
        user: { id: string };
        school: { id: string; name: string };
      };
    };
    expect(data.session.expiresIn).toBe(900);
    expect(data.user.id).toBe(userId);
    expect(data.school.name).toBe('CEIP Lluís Vives');
    await expect(tokenIssuer.verifyAccessToken(data.session.accessToken)).resolves.toEqual({
      userId,
      schoolId: data.school.id,
      role: 'ADMIN',
    });
  });

  it('keeps the same refresh token and expiration after refreshing twice', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);
    const before = await testPrisma.refreshToken.findFirstOrThrow({ where: { userId } });

    expect((await refresh(app, cookie)).status).toBe(200);
    expect((await refresh(app, cookie)).status).toBe(200);

    const after = await testPrisma.refreshToken.findMany({ where: { userId } });
    expect(after).toEqual([before]);
  });

  it('ignores a session cookie fixed by the client before registering', async () => {
    const { app } = realApp();
    const { cookie } = await register(app, 'refresh_token=fixed-by-attacker');

    expect(cookie).not.toBe('refresh_token=fixed-by-attacker');
    expect((await refresh(app, 'refresh_token=fixed-by-attacker')).status).toBe(401);
    expect((await refresh(app, cookie)).status).toBe(200);
  });

  it('creates no refresh token when the registration is rejected', async () => {
    const { app } = realApp();
    await register(app);

    const duplicate = await request(app).post('/api/auth/register').send(validBody);

    expect(duplicate.status).toBe(409);
    expect(duplicate.headers['set-cookie']).toBeUndefined();
    expect(await testPrisma.refreshToken.count()).toBe(1);
  });

  it('rejects a revoked refresh token', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);
    await testPrisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    const response = await refresh(app, cookie);

    expect(response.status).toBe(401);
    expect((response.body as { error: { code: string } }).error.code).toBe('INVALID_SESSION');
  });

  it('rejects the refresh token once its 24 hours have passed', async () => {
    const { app: registering } = realApp();
    const { cookie } = await register(registering);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000 + 1000);
    const { app: later } = realApp({ now: () => tomorrow });

    const response = await refresh(later, cookie);

    expect(response.status).toBe(401);
    expect((response.body as { error: { code: string } }).error.code).toBe('INVALID_SESSION');
  });

  it('rejects the refresh token of a suspended user', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app);
    await testPrisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    const response = await refresh(app, cookie);

    expect(response.status).toBe(401);
  });

  it('logs the refresh events without the tokens', async () => {
    const { app, logOutput } = realApp();
    const { cookie } = await register(app);

    const accepted = await refresh(app, cookie);
    await refresh(app, 'refresh_token=unknown-token');

    const output = logOutput();
    expect(output).toContain('SESSION_REFRESHED');
    expect(output).toContain('SESSION_REFRESH_FAILED');
    expect(output).toContain('"reason":"UNKNOWN"');
    expect(output).not.toContain(cookie.split('=')[1]);
    expect(output).not.toContain(
      (accepted.body as { data: { session: { accessToken: string } } }).data.session.accessToken,
    );
  });
});
