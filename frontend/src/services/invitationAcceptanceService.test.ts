import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { invitationAcceptanceService } from './invitationAcceptanceService';

const TOKEN = 'token-del-enlace';
const FIELDS = {
  firstName: 'Ana',
  lastName: 'Pérez-Gil',
  email: 'ana.perez@example.com',
  password: 'Secreta123!',
  privacyPolicyAccepted: true as const,
};

const accepted = {
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    firstName: 'Ana',
    lastName: 'Pérez-Gil',
    email: 'ana.perez@example.com',
    role: 'MEMBER',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
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

describe('invitationAcceptanceService', () => {
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
    it('sends POST /api/invitations/lookup with the token in the body and no Authorization header', async () => {
      respondWith(
        jsonResponse(200, { success: true, data: { school: { name: 'X' }, role: 'MEMBER' } }),
      );

      await invitationAcceptanceService.lookup(TOKEN);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('/api/invitations/lookup');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init?.body as string)).toEqual({ token: TOKEN });
    });

    it('never puts the token in the URL', async () => {
      respondWith(
        jsonResponse(200, { success: true, data: { school: { name: 'X' }, role: 'MEMBER' } }),
      );

      await invitationAcceptanceService.lookup(TOKEN);

      expect(fetchSpy.mock.calls[0]![0]).toBe('/api/invitations/lookup');
    });

    it('returns found with the school name and the role with a 200', async () => {
      respondWith(
        jsonResponse(200, {
          success: true,
          data: { school: { name: 'CEIP Lluís Vives' }, role: 'ADMIN' },
        }),
      );

      expect(await invitationAcceptanceService.lookup(TOKEN)).toEqual({
        status: 'found',
        schoolName: 'CEIP Lluís Vives',
        role: 'ADMIN',
      });
    });

    it('returns invalid with a 410 ACCESS_LINK_INVALID', async () => {
      respondWith(jsonResponse(410, errorBody('ACCESS_LINK_INVALID')));

      expect(await invitationAcceptanceService.lookup(TOKEN)).toEqual({ status: 'invalid' });
    });

    it.each([
      ['90 seconds', '90', 2],
      ['1 second', '1', 1],
      ['exactly 2 minutes', '120', 2],
    ])(
      'returns tooManyAttempts with the minutes rounded up (%s)',
      async (_name, header, minutes) => {
        respondWith(jsonResponse(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': header }));

        expect(await invitationAcceptanceService.lookup(TOKEN)).toEqual({
          status: 'tooManyAttempts',
          retryAfterMinutes: minutes,
        });
      },
    );

    it('returns tooManyAttempts without minutes when Retry-After is missing', async () => {
      respondWith(jsonResponse(429, errorBody('TOO_MANY_REQUESTS')));

      expect(await invitationAcceptanceService.lookup(TOKEN)).toEqual({
        status: 'tooManyAttempts',
        retryAfterMinutes: undefined,
      });
    });

    it.each([
      ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
      ['a 410 with another code', jsonResponse(410, errorBody('SOMETHING_ELSE'))],
      ['a 200 without data', jsonResponse(200, { success: true })],
      [
        'a 200 with an unknown role',
        jsonResponse(200, { success: true, data: { school: { name: 'X' }, role: 'OWNER' } }),
      ],
      ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ])('returns unavailable with %s', async (_name, response) => {
      respondWith(response);

      expect(await invitationAcceptanceService.lookup(TOKEN)).toEqual({ status: 'unavailable' });
    });

    it('returns unavailable, without throwing, on a network error', async () => {
      respondWith(new TypeError('Failed to fetch'));

      expect(await invitationAcceptanceService.lookup(TOKEN)).toEqual({ status: 'unavailable' });
    });
  });

  describe('accept', () => {
    it('sends POST /api/invitations/accept with the token and the fields in the body', async () => {
      respondWith(jsonResponse(201, { success: true, data: accepted }));

      await invitationAcceptanceService.accept(TOKEN, FIELDS);

      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('/api/invitations/accept');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init?.body as string)).toEqual({ token: TOKEN, ...FIELDS });
    });

    it('returns accepted with the user and the school with a 201', async () => {
      respondWith(jsonResponse(201, { success: true, data: accepted }));

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'accepted',
        user: accepted.user,
        school: accepted.school,
      });
    });

    it('returns emailAlreadyRegistered with a 409 EMAIL_ALREADY_REGISTERED', async () => {
      respondWith(jsonResponse(409, errorBody('EMAIL_ALREADY_REGISTERED')));

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'emailAlreadyRegistered',
      });
    });

    it('returns invalid with a 410 ACCESS_LINK_INVALID', async () => {
      respondWith(jsonResponse(410, errorBody('ACCESS_LINK_INVALID')));

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'invalid',
      });
    });

    it('returns validationError with the details of a 400 VALIDATION_ERROR', async () => {
      const details = [
        { field: 'password', code: 'WEAK_PASSWORD' },
        { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
      ];
      respondWith(jsonResponse(400, errorBody('VALIDATION_ERROR', { details })));

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'validationError',
        details,
      });
    });

    it('returns tooManyAttempts with the minutes rounded up with a 429', async () => {
      respondWith(jsonResponse(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '301' }));

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'tooManyAttempts',
        retryAfterMinutes: 6,
      });
    });

    it.each([
      ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
      ['a 400 without details', jsonResponse(400, errorBody('VALIDATION_ERROR'))],
      ['a 400 with another code', jsonResponse(400, errorBody('INVALID_JSON'))],
      ['a 201 without data', jsonResponse(201, { success: true })],
      ['a body that is not JSON', new Response('<html>', { status: 201 })],
    ])('returns unavailable with %s', async (_name, response) => {
      respondWith(response);

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'unavailable',
      });
    });

    it('returns unavailable, without throwing, on a network error', async () => {
      respondWith(new TypeError('Failed to fetch'));

      expect(await invitationAcceptanceService.accept(TOKEN, FIELDS)).toEqual({
        status: 'unavailable',
      });
    });
  });
});
