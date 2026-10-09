import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { sessionService } from './sessionService';

const sessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 as const },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN' as const,
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string) {
  return { success: false, error: { code, message: 'mensaje técnico' } };
}

describe('sessionService', () => {
  let fetchMock: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('refresh', () => {
    it('posts to /api/auth/refresh sending the cookies of the same origin', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: sessionData }));

      await sessionService.refresh();

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
    });

    it('returns the session, the user and the school on 200', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: sessionData }));

      await expect(sessionService.refresh()).resolves.toEqual({
        status: 'authenticated',
        data: sessionData,
      });
    });

    it('returns invalidSession on 401 INVALID_SESSION', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, errorBody('INVALID_SESSION')));

      await expect(sessionService.refresh()).resolves.toEqual({ status: 'invalidSession' });
    });

    it.each([
      ['a 401 with another code', jsonResponse(401, errorBody('SOMETHING_ELSE'))],
      ['a 403 ORIGIN_NOT_ALLOWED', jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED'))],
      ['a 503 DATABASE_UNAVAILABLE', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a 500 INTERNAL_ERROR', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
      ['a 200 without data', jsonResponse(200, { success: true })],
      ['a response that is not JSON', new Response('<html>', { status: 502 })],
    ])('returns unexpected on %s', async (_case, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(sessionService.refresh()).resolves.toEqual({ status: 'unexpected' });
    });

    it('returns unexpected, without throwing, when there is no connection', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(sessionService.refresh()).resolves.toEqual({ status: 'unexpected' });
    });
  });
});
