import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { CaptchaVerifier } from './application/registration/captchaVerifier.js';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';

const T0 = new Date('2026-10-10T09:00:00.000Z');
const WINDOW_MS = 15 * 60 * 1000;
const MAX = 3;
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
const correct = { email: EMAIL, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } };
const wrong = { ...correct, password: 'Otra123456!' };

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

type App = ReturnType<typeof realApp>['app'];

async function register(app: App): Promise<void> {
  const response = await request(app).post('/api/auth/register').send(registerBody);
  expect(response.status).toBe(201);
}

function login(app: App, body: unknown, forwardedFor?: string) {
  const pending = request(app).post('/api/auth/login').set('Origin', TEST_APP_ORIGIN);
  return (forwardedFor ? pending.set('X-Forwarded-For', forwardedFor) : pending).send(
    body as object,
  );
}

const loginAttempts = () =>
  testPrisma.rateLimitAttempt.count({ where: { key: { startsWith: 'login:' } } });

/** Hace `count` logins fallidos seguidos y comprueba que cada uno responde 401. */
async function failTimes(app: App, count: number, forwardedFor?: string) {
  for (let attempt = 0; attempt < count; attempt++) {
    expect((await login(app, wrong, forwardedFor)).status).toBe(401);
  }
}

describe('failed login attempt limit against the test database', () => {
  it('answers 429 with Retry-After to the next login once the failed ones reach the maximum', async () => {
    const { app } = realApp({ loginAttemptsMax: MAX });
    await register(app);
    await failTimes(app, MAX);

    const blocked = await login(app, wrong);

    expect(blocked.status).toBe(429);
    expect((blocked.body as { error: { code: string } }).error.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers['retry-after']).toBe(String(WINDOW_MS / 1000));
  });

  it('also blocks a correct login while the IP is blocked, and creates no session', async () => {
    const { app } = realApp({ loginAttemptsMax: MAX });
    await register(app);
    await failTimes(app, MAX);

    const blocked = await login(app, correct);

    expect(blocked.status).toBe(429);
    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect(await testPrisma.refreshToken.count()).toBe(1);
  });

  it('does not call Google or look the user up for a blocked IP', async () => {
    const verify = vi.fn<CaptchaVerifier['verify']>().mockResolvedValue(undefined);
    const { app } = realApp({ loginAttemptsMax: MAX, captchaVerifier: { verify } });
    await register(app);
    await failTimes(app, MAX);
    verify.mockClear();

    await login(app, correct);

    expect(verify).not.toHaveBeenCalled();
  });

  it('counts only the failed ones: more correct logins in a row than the maximum never block', async () => {
    const { app } = realApp({ loginAttemptsMax: MAX });
    await register(app);

    for (let attempt = 0; attempt < MAX * 2; attempt++) {
      expect((await login(app, correct)).status).toBe(204);
    }

    expect(await loginAttempts()).toBe(0);
  });

  it('counts a failure between correct logins and releases the correct ones', async () => {
    const { app } = realApp({ loginAttemptsMax: MAX });
    await register(app);

    await login(app, correct);
    await login(app, wrong);
    await login(app, correct);
    await login(app, wrong);

    expect(await loginAttempts()).toBe(2);
    expect((await login(app, wrong)).status).toBe(401);
    expect((await login(app, correct)).status).toBe(429);
  });

  describe('the sliding window of 15 minutes', () => {
    it('reports the seconds until the oldest failed attempt leaves the window', async () => {
      const time = clock();
      const { app } = realApp({ loginAttemptsMax: MAX, now: time.now });
      await register(app);
      await login(app, wrong);
      time.advance(60_000);
      await login(app, wrong);
      time.advance(60_000);
      await login(app, wrong);
      time.advance(60_000);

      const blocked = await login(app, correct);

      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBe(String((WINDOW_MS - 180_000) / 1000));
    });

    it('lets a login in once the oldest failed attempt is 15 minutes old', async () => {
      const time = clock();
      const { app } = realApp({ loginAttemptsMax: MAX, now: time.now });
      await register(app);
      await failTimes(app, MAX);
      time.advance(WINDOW_MS - 1);
      expect((await login(app, correct)).status).toBe(429);
      time.advance(1);

      const response = await login(app, correct);

      expect(response.status).toBe(204);
    });

    it('does not extend the block with the attempts rejected during it', async () => {
      const time = clock();
      const { app } = realApp({ loginAttemptsMax: MAX, now: time.now });
      await register(app);
      await failTimes(app, MAX);
      time.advance(60_000);
      await login(app, correct);
      await login(app, wrong);

      expect(await loginAttempts()).toBe(MAX);
    });
  });

  it('keeps a separate counter for each IP', async () => {
    const { app } = realApp({ loginAttemptsMax: MAX, trustProxyHops: 1 });
    await register(app);
    await failTimes(app, MAX, '198.51.100.1');

    const blocked = await login(app, correct, '198.51.100.1');
    const otherIp = await login(app, correct, '198.51.100.2');

    expect(blocked.status).toBe(429);
    expect(otherIp.status).toBe(204);
  });

  it('keeps the counter of the login apart from the one of the registration', async () => {
    const { app } = realApp({ loginAttemptsMax: MAX, registrationAttemptsMax: 1 });
    await register(app);

    expect((await login(app, correct)).status).toBe(204);
    expect(
      await testPrisma.rateLimitAttempt.count({ where: { key: { startsWith: 'register:' } } }),
    ).toBe(1);
  });

  describe('under concurrency', () => {
    it('lets only the maximum of simultaneous failed logins reach the password check', async () => {
      const { app } = realApp({ loginAttemptsMax: MAX });
      await register(app);

      const responses = await Promise.all(Array.from({ length: MAX * 2 }, () => login(app, wrong)));

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([401, 401, 401, 429, 429, 429]);
      expect(await loginAttempts()).toBe(MAX);
    });

    it('counts the logins in flight, but never fails a correct one with anything but a 429', async () => {
      const { app } = realApp({ loginAttemptsMax: MAX });
      await register(app);

      const responses = await Promise.all(
        Array.from({ length: MAX * 2 }, () => login(app, correct)),
      );

      const statuses = responses.map((response) => response.status);
      expect(statuses.every((status) => status === 204 || status === 429)).toBe(true);
      expect(statuses.filter((status) => status === 204).length).toBeGreaterThanOrEqual(MAX);
      expect(await loginAttempts()).toBe(0);
    });
  });
});
