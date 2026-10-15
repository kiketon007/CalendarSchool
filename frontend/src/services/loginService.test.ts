import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { components } from '../api/generated/schema';
import { loginService } from './loginService';

type LoginRequest = components['schemas']['LoginRequest'];

const request: LoginRequest = {
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
  captcha: { version: 'v3', token: 'token' },
};

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function errorBody(code: string, extra: Record<string, unknown> = {}) {
  return { success: false, error: { code, message: 'mensaje técnico', ...extra } };
}

describe('loginService', () => {
  let fetchMock: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('login', () => {
    it('posts the credentials and the captcha as JSON to /api/auth/login', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await loginService.login(request);

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    });

    it('returns loggedIn on 204, which has no body', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'loggedIn' });
    });

    it('returns invalidCredentials on 401 INVALID_CREDENTIALS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, errorBody('INVALID_CREDENTIALS')));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'invalidCredentials' });
    });

    it('returns accountSuspended on 403 ACCOUNT_SUSPENDED', async () => {
      fetchMock.mockResolvedValue(jsonResponse(403, errorBody('ACCOUNT_SUSPENDED')));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'accountSuspended' });
    });

    it('returns captchaChallengeRequired on 422 CAPTCHA_CHALLENGE_REQUIRED', async () => {
      fetchMock.mockResolvedValue(jsonResponse(422, errorBody('CAPTCHA_CHALLENGE_REQUIRED')));

      await expect(loginService.login(request)).resolves.toEqual({
        status: 'captchaChallengeRequired',
      });
    });

    it('returns captchaFailed on 422 CAPTCHA_FAILED', async () => {
      fetchMock.mockResolvedValue(jsonResponse(422, errorBody('CAPTCHA_FAILED')));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'captchaFailed' });
    });

    it('returns the wait of Retry-After on 429 TOO_MANY_REQUESTS', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '840' }),
      );

      await expect(loginService.login(request)).resolves.toEqual({
        status: 'tooManyRequests',
        retryAfterSeconds: 840,
      });
    });

    it.each([
      ['is missing', {}],
      ['is not a whole number of seconds', { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }],
    ])('returns tooManyRequests without a wait when Retry-After %s', async (_case, headers) => {
      fetchMock.mockResolvedValue(jsonResponse(429, errorBody('TOO_MANY_REQUESTS'), headers));

      await expect(loginService.login(request)).resolves.toEqual({
        status: 'tooManyRequests',
        retryAfterSeconds: undefined,
      });
    });

    it.each([
      ['503 CAPTCHA_UNAVAILABLE', 503, 'CAPTCHA_UNAVAILABLE'],
      ['503 DATABASE_UNAVAILABLE', 503, 'DATABASE_UNAVAILABLE'],
      ['503 REQUEST_TIMEOUT', 503, 'REQUEST_TIMEOUT'],
      ['500 INTERNAL_ERROR', 500, 'INTERNAL_ERROR'],
      ['403 ORIGIN_NOT_ALLOWED', 403, 'ORIGIN_NOT_ALLOWED'],
      ['400 VALIDATION_ERROR, which the form already prevents', 400, 'VALIDATION_ERROR'],
    ])('returns unavailable on %s', async (_case, status, code) => {
      fetchMock.mockResolvedValue(jsonResponse(status, errorBody(code)));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'unavailable' });
    });

    it('decides by the code, never by the message', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, {
          success: false,
          error: { code: 'OTRO', message: 'INVALID_CREDENTIALS' },
        }),
      );

      await expect(loginService.login(request)).resolves.toEqual({ status: 'unavailable' });
    });

    it('does not mix up a status with the code of another one', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, errorBody('INVALID_CREDENTIALS')));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'unavailable' });
    });

    it.each([
      ['a body that is not JSON', new Response('<html>', { status: 502 })],
      ['an empty error body', new Response(null, { status: 500 })],
    ])('returns unavailable for %s', async (_case, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(loginService.login(request)).resolves.toEqual({ status: 'unavailable' });
    });

    it('returns unavailable, and never throws, when there is no connection', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(loginService.login(request)).resolves.toEqual({ status: 'unavailable' });
    });

    it('does not put the password in the result', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, errorBody('INVALID_CREDENTIALS')));

      const outcome = await loginService.login(request);

      expect(JSON.stringify(outcome)).not.toContain(request.password);
    });
  });
});
