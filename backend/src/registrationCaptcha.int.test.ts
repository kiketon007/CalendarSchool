import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { CaptchaFailed } from './application/registration/captchaVerifier.js';

type App = ReturnType<typeof realApp>['app'];

/** Cuerpo de registro válido; `captcha` se sustituye por completo si se indica. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    schoolName: 'Colegio Captcha',
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
    email: 'captcha@example.com',
    password: 'Secreta123!',
    captcha: { version: 'v3', token: 'e2e' },
    ...overrides,
  };
}

const register = (app: App, payload: unknown) =>
  request(app)
    .post('/api/auth/register')
    .send(payload as object);

async function created() {
  return {
    schools: await testPrisma.school.count(),
    users: await testPrisma.user.count(),
    refreshTokens: await testPrisma.refreshToken.count(),
  };
}

const NOTHING = { schools: 0, users: 0, refreshTokens: 0 };

function logLine(output: string, event: string): Record<string, unknown> {
  const line = output.split('\n').find((entry) => entry.includes(event));
  expect(line, `evento ${event} en el log`).toBeDefined();
  return JSON.parse(line as string) as Record<string, unknown>;
}

describe('captcha verification against the test database (fake verifier)', () => {
  it('registers with any token', async () => {
    const { app } = realApp();

    const response = await register(app, body());

    expect(response.status).toBe(201);
    expect(response.headers['set-cookie']).toBeDefined();
    expect(await created()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
  });

  it('asks for the v2 challenge with fake-low-score without validating or creating anything', async () => {
    const { app, logOutput } = realApp();

    const response = await register(
      app,
      body({ captcha: { version: 'v3', token: 'fake-low-score' } }),
    );

    expect(response.status).toBe(422);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'CAPTCHA_CHALLENGE_REQUIRED',
    );
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await created()).toEqual(NOTHING);
    expect(logLine(logOutput(), 'USER_REGISTER_CAPTCHA_CHALLENGE')).toMatchObject({
      level: 'info',
      score: 0.3,
    });
  });

  it('answers 422 CAPTCHA_FAILED with fake-fail and logs the reason, without the token or the email', async () => {
    const { app, logOutput } = realApp();

    const response = await register(app, body({ captcha: { version: 'v2', token: 'fake-fail' } }));

    expect(response.status).toBe(422);
    expect((response.body as { error: { code: string } }).error.code).toBe('CAPTCHA_FAILED');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await created()).toEqual(NOTHING);
    const event = logLine(logOutput(), 'USER_REGISTER_CAPTCHA_FAILED');
    expect(event).toMatchObject({ level: 'warn', reason: 'INVALID', version: 'v2' });
    expect(logOutput()).not.toContain('fake-fail');
    expect(logOutput()).not.toContain('captcha@example.com');
  });

  it('answers 503 CAPTCHA_UNAVAILABLE with fake-unavailable, failing closed, and logs it as an error', async () => {
    const { app, logOutput } = realApp();

    const response = await register(
      app,
      body({ captcha: { version: 'v3', token: 'fake-unavailable' } }),
    );

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('CAPTCHA_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await created()).toEqual(NOTHING);
    expect(logLine(logOutput(), 'No se ha podido verificar el captcha')).toMatchObject({
      level: 'error',
    });
  });

  it.each([
    ['no captcha', body({ captcha: undefined })],
    ['a captcha with an unknown version', body({ captcha: { version: 'v1', token: 'e2e' } })],
    ['an empty token', body({ captcha: { version: 'v3', token: '' } })],
  ])('answers 422 CAPTCHA_FAILED, not 400, with %s', async (_case, payload) => {
    const { app, logOutput } = realApp();

    const response = await register(app, payload);

    expect(response.status).toBe(422);
    expect((response.body as { error: { code: string } }).error.code).toBe('CAPTCHA_FAILED');
    expect(logLine(logOutput(), 'USER_REGISTER_CAPTCHA_FAILED')).toMatchObject({
      reason: 'MISSING',
    });
  });

  it('verifies the captcha before validating the payload', async () => {
    const { app } = realApp();

    const response = await register(
      app,
      body({ email: 'sin-arroba', captcha: { version: 'v3', token: 'fake-fail' } }),
    );

    expect(response.status).toBe(422);
  });

  it('goes on to validate the payload when the captcha is accepted', async () => {
    const { app } = realApp();

    const response = await register(app, body({ email: 'sin-arroba' }));

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('registers with the v2 token after the challenge was requested', async () => {
    const { app } = realApp();

    const challenge = await register(
      app,
      body({ captcha: { version: 'v3', token: 'fake-low-score' } }),
    );
    const afterChallenge = await register(
      app,
      body({ captcha: { version: 'v2', token: 'fake-v2-token' } }),
    );

    expect(challenge.status).toBe(422);
    expect(afterChallenge.status).toBe(201);
    expect(await created()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
  });

  it('counts both attempts of a user who goes through the challenge, as the attempt limit does', async () => {
    const { app } = realApp();

    await register(app, body({ captcha: { version: 'v3', token: 'fake-low-score' } }));
    await register(app, body({ captcha: { version: 'v2', token: 'fake-v2-token' } }));

    expect(await testPrisma.rateLimitAttempt.count()).toBe(2);
  });

  it('answers 429 before verifying the captcha when the attempt limit is exhausted', async () => {
    const verify = vi.fn(() => Promise.reject(new CaptchaFailed('INVALID')));
    const { app } = realApp({ registrationAttemptsMax: 1, captchaVerifier: { verify } });

    const first = await register(app, body());
    const second = await register(app, body());

    expect(first.status).toBe(422);
    expect(second.status).toBe(429);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
