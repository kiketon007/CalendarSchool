import { describe, expect, it, vi } from 'vitest';
import { usersService, type SchoolUser } from './usersService';

const USER_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const URL = 'http://localhost:5173/restablecer#secret-token';
const passwordReset = {
  userId: USER_ID,
  createdAt: '2026-10-17T10:00:00.000Z',
  expiresAt: '2026-10-20T10:00:00.000Z',
};

const user: SchoolUser = {
  id: USER_ID,
  firstName: 'José',
  lastName: 'García',
  email: 'jose@example.com',
  role: 'MEMBER',
  status: 'ACTIVE',
  passwordResetPending: true,
  createdAt: '2026-10-07T09:30:00.000Z',
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

/** Cliente autenticado simulado que responde con `response` o falla con `error`. */
function clientReturning(response: Response | Error) {
  return vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('usersService.generatePasswordReset', () => {
  it('sends POST /api/users/{id}/password-reset without a body through the authenticated client', async () => {
    const client = clientReturning(
      jsonResponse(201, { success: true, data: { passwordReset, url: URL } }),
    );

    await usersService.generatePasswordReset(client, USER_ID);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/users/${USER_ID}/password-reset`);
    expect(client.mock.calls[0]?.[1]).toEqual({ method: 'POST' });
  });

  it('returns created with the reset and the url with a 201', async () => {
    const outcome = await usersService.generatePasswordReset(
      clientReturning(jsonResponse(201, { success: true, data: { passwordReset, url: URL } })),
      USER_ID,
    );

    expect(outcome).toEqual({ status: 'created', passwordReset, url: URL });
  });

  it.each([
    ['a body without the url', { success: true, data: { passwordReset } }],
    ['a body without the reset', { success: true, data: { url: URL } }],
    [
      'a reset without dates',
      { success: true, data: { passwordReset: { userId: 'x' }, url: URL } },
    ],
  ])('returns unavailable with a 201 and %s', async (_name, body) => {
    const outcome = await usersService.generatePasswordReset(
      clientReturning(jsonResponse(201, body)),
      USER_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each([
    [404, 'NOT_FOUND', 'notFound'],
    [409, 'USER_NOT_ACTIVE', 'userNotActive'],
    [403, 'FORBIDDEN', 'forbidden'],
  ])('returns %s %s as %s', async (status, code, expected) => {
    const outcome = await usersService.generatePasswordReset(
      clientReturning(jsonResponse(status, errorBody(code))),
      USER_ID,
    );

    expect(outcome).toEqual({ status: expected });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await usersService.generatePasswordReset(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      USER_ID,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 409 with another code', jsonResponse(409, errorBody('LAST_ADMIN_REQUIRED'))],
    ['a 403 with another code', jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED'))],
    ['a body that is not JSON', new Response('<html>', { status: 502 })],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('returns unavailable on %s, without throwing', async (_name, response) => {
    const outcome = await usersService.generatePasswordReset(clientReturning(response), USER_ID);

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('usersService.revokePasswordReset', () => {
  it('sends POST /api/users/{id}/password-reset/revoke through the authenticated client', async () => {
    const client = clientReturning(new Response(null, { status: 204 }));

    await usersService.revokePasswordReset(client, USER_ID);

    expect(client.mock.calls[0]?.[0]).toBe(`/api/users/${USER_ID}/password-reset/revoke`);
    expect(client.mock.calls[0]?.[1]).toEqual({ method: 'POST' });
  });

  it('returns revoked with a 204', async () => {
    const outcome = await usersService.revokePasswordReset(
      clientReturning(new Response(null, { status: 204 })),
      USER_ID,
    );

    expect(outcome).toEqual({ status: 'revoked' });
  });

  it.each([
    [404, 'NOT_FOUND', 'notFound'],
    [403, 'FORBIDDEN', 'forbidden'],
  ])('returns %s %s as %s', async (status, code, expected) => {
    const outcome = await usersService.revokePasswordReset(
      clientReturning(jsonResponse(status, errorBody(code))),
      USER_ID,
    );

    expect(outcome).toEqual({ status: expected });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await usersService.revokePasswordReset(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      USER_ID,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('returns unavailable on %s, without throwing', async (_name, response) => {
    const outcome = await usersService.revokePasswordReset(clientReturning(response), USER_ID);

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('usersService.list with passwordResetPending', () => {
  it('returns the users with the flag', async () => {
    const outcome = await usersService.list(
      clientReturning(jsonResponse(200, { success: true, data: [user] })),
    );

    expect(outcome).toEqual({ status: 'loaded', users: [user] });
  });

  it('returns unavailable when a user does not carry the flag', async () => {
    const { passwordResetPending: _flag, ...withoutFlag } = user;

    const outcome = await usersService.list(
      clientReturning(jsonResponse(200, { success: true, data: [withoutFlag] })),
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});
