import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { usersService } from './usersService';

type SchoolUser = components['schemas']['SchoolUser'];

const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';

const user: SchoolUser = {
  id: USER_ID,
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  passwordResetPending: false,
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

const actions = [
  {
    name: 'changeRole',
    run: (client: ReturnType<typeof clientReturning>) =>
      usersService.changeRole(client, USER_ID, 'ADMIN'),
  },
  {
    name: 'suspend',
    run: (client: ReturnType<typeof clientReturning>) => usersService.suspend(client, USER_ID),
  },
  {
    name: 'reactivate',
    run: (client: ReturnType<typeof clientReturning>) => usersService.reactivate(client, USER_ID),
  },
] as const;

describe('usersService requests', () => {
  it('changeRole sends PUT /api/users/{id}/role with the role as JSON', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: user }));

    await usersService.changeRole(client, USER_ID, 'MEMBER');

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/users/${USER_ID}/role`);
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({ role: 'MEMBER' });
  });

  it('suspend sends POST /api/users/{id}/suspend without a body', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: user }));

    await usersService.suspend(client, USER_ID);

    expect(client.mock.calls[0]?.[0]).toBe(`/api/users/${USER_ID}/suspend`);
    expect(client.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(client.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('reactivate sends POST /api/users/{id}/reactivate without a body', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: user }));

    await usersService.reactivate(client, USER_ID);

    expect(client.mock.calls[0]?.[0]).toBe(`/api/users/${USER_ID}/reactivate`);
    expect(client.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(client.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
});

describe.each(actions)('usersService.$name outcomes', ({ run }) => {
  it('returns the updated user with a 200', async () => {
    const outcome = await run(clientReturning(jsonResponse(200, { success: true, data: user })));

    expect(outcome).toEqual({ status: 'updated', user });
  });

  it.each([
    ['LAST_ADMIN_REQUIRED', 'lastAdminRequired'],
    ['CANNOT_SUSPEND_SELF', 'cannotSuspendSelf'],
    ['USER_NOT_ACTIVE', 'userNotActive'],
  ] as const)('maps a 409 %s to %s', async (code, status) => {
    const outcome = await run(clientReturning(jsonResponse(409, errorBody(code))));

    expect(outcome).toEqual({ status });
  });

  it('maps a 409 with an unknown code to unavailable', async () => {
    const outcome = await run(clientReturning(jsonResponse(409, errorBody('OTHER'))));

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('maps a 404 NOT_FOUND to notFound', async () => {
    const outcome = await run(clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))));

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('maps a 403 FORBIDDEN to forbidden', async () => {
    const outcome = await run(clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))));

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('maps a 401 to unauthenticated', async () => {
    const outcome = await run(clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))));

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 403 with another code', jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED'))],
    ['a 200 with an unexpected body', jsonResponse(200, { success: true, data: { id: 1 } })],
    ['a 200 with a list instead of a user', jsonResponse(200, { success: true, data: [user] })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
  ])('maps %s to unavailable', async (_name, response) => {
    expect(await run(clientReturning(response))).toEqual({ status: 'unavailable' });
  });

  it('maps a network error to unavailable without throwing', async () => {
    const outcome = await run(clientReturning(new TypeError('Failed to fetch')));

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});
