import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { passwordResetService } from './passwordResetService';

const TOKEN = 'token-del-enlace';
const PASSWORD = 'Secreta123!';

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

describe('passwordResetService', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const respondWith = (response: Response | Error) =>
    fetchSpy.mockImplementation(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
    );

  describe('lookup', () => {
    it('sends the token in the body of POST /api/password-resets/lookup, without Authorization or credentials', async () => {
      respondWith(
        jsonResponse(200, {
          success: true,
          data: { school: { name: 'CEIP Lluís Vives' }, email: 'a***@example.com' },
        }),
      );

      await passwordResetService.lookup(TOKEN);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [path, init] = fetchSpy.mock.calls[0] ?? [];
      expect(path).toBe('/api/password-resets/lookup');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init?.body as string)).toEqual({ token: TOKEN });
      expect(path).toBe('/api/password-resets/lookup');
      expect(JSON.stringify([path])).not.toContain(TOKEN);
    });

    it('returns found with the school name and the masked email with a 200', async () => {
      respondWith(
        jsonResponse(200, {
          success: true,
          data: { school: { name: 'CEIP Lluís Vives' }, email: 'a***@example.com' },
        }),
      );

      expect(await passwordResetService.lookup(TOKEN)).toEqual({
        status: 'found',
        schoolName: 'CEIP Lluís Vives',
        email: 'a***@example.com',
      });
    });

    it.each([
      ['no school', { email: 'a***@example.com' }],
      ['no email', { school: { name: 'x' } }],
      ['an email that is not text', { school: { name: 'x' }, email: 3 }],
    ])('returns unavailable with a 200 and %s', async (_name, data) => {
      respondWith(jsonResponse(200, { success: true, data }));

      expect(await passwordResetService.lookup(TOKEN)).toEqual({ status: 'unavailable' });
    });

    it('returns invalid with a 410 ACCESS_LINK_INVALID', async () => {
      respondWith(jsonResponse(410, errorBody('ACCESS_LINK_INVALID')));

      expect(await passwordResetService.lookup(TOKEN)).toEqual({ status: 'invalid' });
    });

    it('returns tooManyAttempts with the minutes rounded up from Retry-After', async () => {
      respondWith(jsonResponse(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '61' }));

      expect(await passwordResetService.lookup(TOKEN)).toEqual({
        status: 'tooManyAttempts',
        retryAfterMinutes: 2,
      });
    });

    it('returns tooManyAttempts without minutes when Retry-After is missing', async () => {
      respondWith(jsonResponse(429, errorBody('TOO_MANY_REQUESTS')));

      expect(await passwordResetService.lookup(TOKEN)).toEqual({
        status: 'tooManyAttempts',
        retryAfterMinutes: undefined,
      });
    });

    it.each([
      ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
      ['a 410 with another code', jsonResponse(410, errorBody('NOT_FOUND'))],
      ['a body that is not JSON', new Response('<html>', { status: 502 })],
      ['a network failure', new TypeError('Failed to fetch')],
    ])('returns unavailable on %s, without throwing', async (_name, response) => {
      respondWith(response);

      expect(await passwordResetService.lookup(TOKEN)).toEqual({ status: 'unavailable' });
    });
  });

  describe('confirm', () => {
    it('sends the token and the password in the body of POST /api/password-resets/confirm', async () => {
      respondWith(new Response(null, { status: 204 }));

      await passwordResetService.confirm(TOKEN, PASSWORD);

      const [path, init] = fetchSpy.mock.calls[0] ?? [];
      expect(path).toBe('/api/password-resets/confirm');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init?.body as string)).toEqual({ token: TOKEN, password: PASSWORD });
    });

    it('returns confirmed with a 204', async () => {
      respondWith(new Response(null, { status: 204 }));

      expect(await passwordResetService.confirm(TOKEN, PASSWORD)).toEqual({ status: 'confirmed' });
    });

    it('returns validationError with the details of a 400 VALIDATION_ERROR', async () => {
      const details = [{ field: 'password', code: 'WEAK_PASSWORD' }];
      respondWith(jsonResponse(400, errorBody('VALIDATION_ERROR', { details })));

      expect(await passwordResetService.confirm(TOKEN, 'x')).toEqual({
        status: 'validationError',
        details,
      });
    });

    it('returns unavailable with a 400 without details', async () => {
      respondWith(jsonResponse(400, errorBody('VALIDATION_ERROR')));

      expect(await passwordResetService.confirm(TOKEN, 'x')).toEqual({ status: 'unavailable' });
    });

    it('returns invalid with a 410 ACCESS_LINK_INVALID', async () => {
      respondWith(jsonResponse(410, errorBody('ACCESS_LINK_INVALID')));

      expect(await passwordResetService.confirm(TOKEN, PASSWORD)).toEqual({ status: 'invalid' });
    });

    it('returns tooManyAttempts with the minutes from Retry-After', async () => {
      respondWith(jsonResponse(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '900' }));

      expect(await passwordResetService.confirm(TOKEN, PASSWORD)).toEqual({
        status: 'tooManyAttempts',
        retryAfterMinutes: 15,
      });
    });

    it.each([
      ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
      ['a network failure', new TypeError('Failed to fetch')],
    ])('returns unavailable on %s, without throwing', async (_name, response) => {
      respondWith(response);

      expect(await passwordResetService.confirm(TOKEN, PASSWORD)).toEqual({
        status: 'unavailable',
      });
    });
  });
});
