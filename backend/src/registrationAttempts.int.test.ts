import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { CaptchaFailed } from './application/registration/captchaVerifier.js';
import { realApp } from '../test/support/realApp.js';
import { testDatabaseUrl, testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const T0 = new Date('2026-10-10T09:00:00.000Z');
const WINDOW_MS = 15 * 60 * 1000;
const IP = '203.0.113.7';

/** Reloj que el test mueve a su antojo; lo comparten el limitador y los casos de uso. */
function clock(start = T0) {
  let current = start;
  return {
    now: () => current,
    advance: (milliseconds: number) => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

/** Cuerpo de registro válido y distinto en cada llamada (`n`). */
function body(n: number, overrides: Record<string, unknown> = {}) {
  return {
    schoolName: `Colegio Límite ${n}`,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
    email: `limite.${n}@example.com`,
    password: 'Secreta123!',
    captcha: { version: 'v3', token: 'token-provisional' },
    ...overrides,
  };
}

type App = ReturnType<typeof realApp>['app'];

function register(app: App, payload: unknown, forwardedFor?: string) {
  const pending = request(app).post('/api/auth/register');
  return (forwardedFor ? pending.set('X-Forwarded-For', forwardedFor) : pending).send(
    payload as object,
  );
}

async function counts() {
  return {
    schools: await testPrisma.school.count(),
    users: await testPrisma.user.count(),
    refreshTokens: await testPrisma.refreshToken.count(),
    attempts: await testPrisma.rateLimitAttempt.count(),
  };
}

/** Cinco intentos de la misma IP con resultados distintos: 201, 400, 409, 201 y 400. */
async function fiveMixedAttempts(app: App, forwardedFor?: string) {
  const statuses = [
    (await register(app, body(1), forwardedFor)).status,
    (await register(app, body(2, { email: 'sin-arroba' }), forwardedFor)).status,
    (await register(app, body(3, { email: body(1).email }), forwardedFor)).status,
    (await register(app, body(4), forwardedFor)).status,
    (await register(app, body(5, { password: 'corta' }), forwardedFor)).status,
  ];
  expect(statuses).toEqual([201, 400, 409, 201, 400]);
}

describe('registration attempt limit against the test database', () => {
  it('answers 429 with Retry-After to the sixth attempt from the same IP, whatever the five before', async () => {
    const time = clock();
    const { app } = realApp({ now: time.now, registrationAttemptsMax: 5 });
    await fiveMixedAttempts(app);
    const before = await counts();

    const sixth = await register(app, body(6));

    expect(sixth.status).toBe(429);
    expect(sixth.headers['retry-after']).toBe('900');
    expect(sixth.body).toEqual({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: expect.any(String) as string },
    });
    expect(sixth.headers['set-cookie']).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it('does not check the email or the school before answering 429', async () => {
    const time = clock();
    const { app, logOutput } = realApp({ now: time.now, registrationAttemptsMax: 5 });
    await fiveMixedAttempts(app);

    const withTakenEmail = await register(app, body(7, { email: body(1).email }));

    expect(withTakenEmail.status).toBe(429);
    expect(logOutput().match(/USER_REGISTER_DUPLICATE/g)).toHaveLength(1);
  });

  it('does not validate the payload or verify the captcha before answering 429', async () => {
    const time = clock();
    const { app, logOutput } = realApp({ now: time.now, registrationAttemptsMax: 5 });
    await fiveMixedAttempts(app);
    const failedBefore = logOutput().match(/USER_REGISTER_FAILED/g)?.length ?? 0;

    const invalid = await register(app, body(8, { email: 'sin-arroba', captcha: undefined }));

    expect(invalid.status).toBe(429);
    expect(logOutput().match(/USER_REGISTER_FAILED/g)?.length ?? 0).toBe(failedBefore);
  });

  it('counts the attempts rejected by the captcha and answers 429 without verifying it again', async () => {
    const verify = vi.fn(() => Promise.reject(new CaptchaFailed()));
    const { app } = realApp({
      registrationAttemptsMax: 5,
      captchaVerifier: { verify },
    });

    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      statuses.push((await register(app, body(attempt))).status);
    }
    const sixth = await register(app, body(6));

    expect(statuses).toEqual([422, 422, 422, 422, 422]);
    expect(sixth.status).toBe(429);
    expect(verify).toHaveBeenCalledTimes(5);
    expect(await testPrisma.user.count()).toBe(0);
  });

  it('counts a request without a body as an attempt and answers 400 VALIDATION_ERROR', async () => {
    const { app } = realApp({ registrationAttemptsMax: 5 });

    const response = await request(app).post('/api/auth/register');

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    expect(await testPrisma.rateLimitAttempt.count()).toBe(1);
  });

  it('lets the same IP try again once the oldest attempt leaves the 15 minute window', async () => {
    const time = clock();
    const { app } = realApp({ now: time.now, registrationAttemptsMax: 5 });
    await fiveMixedAttempts(app);
    time.advance(WINDOW_MS - 1);
    expect((await register(app, body(6))).status).toBe(429);

    time.advance(1);
    const afterWindow = await register(app, body(6));

    expect(afterWindow.status).toBe(201);
  });

  it('does not extend the block with the attempts rejected during it', async () => {
    const time = clock();
    const { app } = realApp({ now: time.now, registrationAttemptsMax: 5 });
    await fiveMixedAttempts(app);

    for (const minutes of [1, 2, 3, 10]) {
      time.advance(minutes * 60 * 1000 - (time.now().getTime() - T0.getTime()));
      expect((await register(app, body(6))).status).toBe(429);
    }
    expect(await testPrisma.rateLimitAttempt.count()).toBe(5);
    time.advance(WINDOW_MS - (time.now().getTime() - T0.getTime()));

    expect((await register(app, body(6))).status).toBe(201);
  });

  it('applies the configured maximum', async () => {
    const { app } = realApp({ registrationAttemptsMax: 2 });

    const statuses = [
      (await register(app, body(1))).status,
      (await register(app, body(2))).status,
      (await register(app, body(3))).status,
    ];

    expect(statuses).toEqual([201, 201, 429]);
  });

  it('does not count a body that is not valid JSON', async () => {
    const { app } = realApp({ registrationAttemptsMax: 5 });

    for (let attempt = 0; attempt < 8; attempt++) {
      const broken = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"schoolName":');
      expect(broken.status).toBe(400);
    }

    expect(await testPrisma.rateLimitAttempt.count()).toBe(0);
    expect((await register(app, body(1))).status).toBe(201);
  });

  it('logs USER_REGISTER_RATE_LIMITED with the ip and the wait, without email or password', async () => {
    const time = clock();
    const { app, logOutput } = realApp({ now: time.now, registrationAttemptsMax: 5 });
    await fiveMixedAttempts(app);

    await request(app)
      .post('/api/auth/register')
      .set('User-Agent', 'agente-de-prueba')
      .send(body(6, { email: 'secreto.limite@example.com' }));

    const line = logOutput()
      .split('\n')
      .find((entry) => entry.includes('USER_REGISTER_RATE_LIMITED'));
    expect(line).toBeDefined();
    const event = JSON.parse(line as string) as Record<string, unknown>;
    expect(event).toMatchObject({
      level: 'warn',
      event: 'USER_REGISTER_RATE_LIMITED',
      user_agent: 'agente-de-prueba',
      retry_after: 900,
    });
    expect(line).not.toContain('secreto.limite');
    expect(line).not.toContain('Secreta123!');
  });

  describe('behind a trusted proxy', () => {
    it('limits each client ip separately', async () => {
      const time = clock();
      const { app } = realApp({
        now: time.now,
        registrationAttemptsMax: 5,
        trustProxyHops: 1,
      });
      await fiveMixedAttempts(app, IP);

      const blocked = await register(app, body(6), IP);
      const otherClient = await register(app, body(6), '198.51.100.9');

      expect(blocked.status).toBe(429);
      expect(otherClient.status).toBe(201);
    });

    it('does not let the client choose its ip by writing X-Forwarded-For', async () => {
      const time = clock();
      const { app } = realApp({
        now: time.now,
        registrationAttemptsMax: 5,
        trustProxyHops: 1,
      });
      await fiveMixedAttempts(app, IP);

      const forged = await register(app, body(6), `192.0.2.55, ${IP}`);
      const anotherForged = await register(app, body(6), `192.0.2.99, ${IP}`);

      expect(forged.status).toBe(429);
      expect(anotherForged.status).toBe(429);
    });

    it('ignores X-Forwarded-For without trusted proxies, so every request shares the connection ip', async () => {
      const { app } = realApp({ registrationAttemptsMax: 2, trustProxyHops: 0 });

      const statuses = [
        (await register(app, body(1), '198.51.100.1')).status,
        (await register(app, body(2), '198.51.100.2')).status,
        (await register(app, body(3), '198.51.100.3')).status,
      ];

      expect(statuses).toEqual([201, 201, 429]);
    });
  });

  it('answers 503 DATABASE_UNAVAILABLE, without registering anything, when the limit cannot be checked', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const unreachable = createPrismaClient({ connectionString: wrongCredentials.toString() });
    const { app } = realApp({ prisma: unreachable });

    const response = await register(app, body(1));

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await counts()).toEqual({ schools: 0, users: 0, refreshTokens: 0, attempts: 0 });

    await unreachable.$disconnect();
  });
});
