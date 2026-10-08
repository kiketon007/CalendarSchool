import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { components } from '../api/generated/schema';
import { registrationService } from './registrationService';

type RegisterRequest = components['schemas']['RegisterRequest'];

const request: RegisterRequest = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
  captcha: { version: 'v3', token: 'token' },
};

const created = {
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
  },
  school: {
    id: '0192f5a0-0000-7000-8000-000000000001',
    name: 'CEIP Lluís Vives',
    municipality: { code: '46250', name: 'València', province: 'Valencia/València' },
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, extra: Record<string, unknown> = {}) {
  return { success: false, error: { code, message: 'mensaje técnico', ...extra } };
}

describe('registrationService', () => {
  let fetchMock: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('register', () => {
    it('posts the request as JSON to /api/auth/register', async () => {
      fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: created }));

      await registrationService.register(request);

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    });

    it('returns the created user and school on 201', async () => {
      fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: created }));

      await expect(registrationService.register(request)).resolves.toEqual({
        status: 'created',
        data: created,
      });
    });

    it('returns the field errors on 400 VALIDATION_ERROR', async () => {
      const details = [
        { field: 'email', code: 'INVALID_FORMAT' },
        { field: 'password', code: 'WEAK_PASSWORD' },
      ];
      fetchMock.mockResolvedValue(jsonResponse(400, errorBody('VALIDATION_ERROR', { details })));

      await expect(registrationService.register(request)).resolves.toEqual({
        status: 'validation',
        details,
      });
    });

    it.each([
      ['EMAIL_ALREADY_REGISTERED', 'emailAlreadyRegistered'],
      ['SCHOOL_ALREADY_REGISTERED', 'schoolAlreadyRegistered'],
    ])('maps 409 %s to the %s status', async (code, status) => {
      fetchMock.mockResolvedValue(jsonResponse(409, errorBody(code)));

      await expect(registrationService.register(request)).resolves.toEqual({ status });
    });

    it.each([
      ['400 INVALID_JSON', jsonResponse(400, errorBody('INVALID_JSON'))],
      ['422 CAPTCHA_FAILED', jsonResponse(422, errorBody('CAPTCHA_FAILED'))],
      ['429 TOO_MANY_REQUESTS', jsonResponse(429, errorBody('TOO_MANY_REQUESTS'))],
      ['500 INTERNAL_ERROR', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
      ['503 DATABASE_UNAVAILABLE', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a 409 with an unknown code', jsonResponse(409, errorBody('OTRO'))],
      ['a 400 without details', jsonResponse(400, errorBody('VALIDATION_ERROR'))],
      ['a response that is not JSON', new Response('<html>', { status: 502 })],
      ['a 201 that is not JSON', new Response('ok', { status: 201 })],
    ])('returns the unexpected status for %s', async (_name, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(registrationService.register(request)).resolves.toEqual({
        status: 'unexpected',
      });
    });

    it('returns the unexpected status when there is no connection', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(registrationService.register(request)).resolves.toEqual({
        status: 'unexpected',
      });
    });
  });

  describe('listMunicipalities', () => {
    const municipalities = [
      { code: '03014', name: 'Alacant/Alicante', province: 'Alicante/Alacant' },
      { code: '46250', name: 'València', province: 'Valencia/València' },
    ];

    it('gets the list from /api/municipalities', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: municipalities }));

      await expect(registrationService.listMunicipalities()).resolves.toEqual(municipalities);
      expect(fetchMock).toHaveBeenCalledWith('/api/municipalities');
    });

    it.each([
      ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
      ['a body that is not JSON', new Response('<html>', { status: 200 })],
      ['a body without data', jsonResponse(200, { success: true })],
    ])('rejects on %s', async (_name, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(registrationService.listMunicipalities()).rejects.toThrow();
    });

    it('rejects when there is no connection', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(registrationService.listMunicipalities()).rejects.toThrow();
    });
  });
});
