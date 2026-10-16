import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { usersService } from './usersService';

type SchoolUser = components['schemas']['SchoolUser'];

const users: SchoolUser[] = [
  {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    firstName: 'José María',
    lastName: 'García-López',
    email: 'jose.garcia@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-10-07T09:30:00.000Z',
  },
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string) {
  return { success: false, error: { code, message: 'mensaje técnico' } };
}

/** Cliente autenticado simulado que responde con `response` o falla con `error`. */
function clientReturning(response: Response | Error) {
  return vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('usersService.list', () => {
  it('asks for GET /api/users through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: users }));

    await usersService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/users');
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('returns the users with a 200', async () => {
    const outcome = await usersService.list(
      clientReturning(jsonResponse(200, { success: true, data: users })),
    );

    expect(outcome).toEqual({ status: 'loaded', users });
  });

  it('returns an empty list with a 200 and no users', async () => {
    const outcome = await usersService.list(
      clientReturning(jsonResponse(200, { success: true, data: [] })),
    );

    expect(outcome).toEqual({ status: 'loaded', users: [] });
  });

  it('returns forbidden with a 403 FORBIDDEN', async () => {
    const outcome = await usersService.list(
      clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
    );

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await usersService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each<[string, Response | Error]>([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 403 with another code', jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED'))],
    ['a 200 with a body that is not a list', jsonResponse(200, { success: true, data: 'x' })],
    ['a 200 with a body that is not JSON', new Response('<html>', { status: 200 })],
    [
      'a 200 with a user that lacks fields',
      jsonResponse(200, { success: true, data: [{ id: 'x' }] }),
    ],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable, without throwing, with %s', async (_case, response) => {
    await expect(usersService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
