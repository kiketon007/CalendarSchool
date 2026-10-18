import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { invitationsService } from './invitationsService';

type Invitation = components['schemas']['Invitation'];

const INVITATION_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const URL = 'http://localhost:5173/invitacion#secret-token';

const invitation: Invitation = {
  id: INVITATION_ID,
  role: 'MEMBER',
  createdBy: { id: '0192f5a0-0000-7000-8000-0000000000a1', firstName: 'José', lastName: 'García' },
  createdAt: '2026-10-17T10:00:00.000Z',
  expiresAt: '2026-10-20T10:00:00.000Z',
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

describe('invitationsService.create', () => {
  it('sends POST /api/invitations with the role as JSON through the authenticated client', async () => {
    const client = clientReturning(
      jsonResponse(201, { success: true, data: { invitation, url: URL } }),
    );

    await invitationsService.create(client, 'ADMIN');

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/invitations');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ role: 'ADMIN' });
  });

  it('returns created with the invitation and the url with a 201', async () => {
    const outcome = await invitationsService.create(
      clientReturning(jsonResponse(201, { success: true, data: { invitation, url: URL } })),
      'MEMBER',
    );

    expect(outcome).toEqual({ status: 'created', invitation, url: URL });
  });

  it('returns forbidden with a 403 FORBIDDEN', async () => {
    const outcome = await invitationsService.create(
      clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
      'MEMBER',
    );

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await invitationsService.create(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      'MEMBER',
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 400', jsonResponse(400, errorBody('VALIDATION_ERROR'))],
    ['a 201 without the url', jsonResponse(201, { success: true, data: { invitation } })],
    ['a 201 with a malformed invitation', jsonResponse(201, { success: true, data: { url: URL } })],
    ['a body that is not JSON', new Response('<html>', { status: 201 })],
  ])('returns unavailable with %s', async (_name, response) => {
    const outcome = await invitationsService.create(clientReturning(response), 'MEMBER');

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('returns unavailable, without throwing, on a network error', async () => {
    const outcome = await invitationsService.create(
      clientReturning(new TypeError('Failed to fetch')),
      'MEMBER',
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('invitationsService.list', () => {
  it('asks for GET /api/invitations through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: [invitation] }));

    await invitationsService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/invitations');
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('returns loaded with the invitations with a 200, also when there are none', async () => {
    const some = await invitationsService.list(
      clientReturning(jsonResponse(200, { success: true, data: [invitation] })),
    );
    const none = await invitationsService.list(
      clientReturning(jsonResponse(200, { success: true, data: [] })),
    );

    expect(some).toEqual({ status: 'loaded', invitations: [invitation] });
    expect(none).toEqual({ status: 'loaded', invitations: [] });
  });

  it('returns forbidden with a 403 FORBIDDEN and unauthenticated with a 401', async () => {
    expect(
      await invitationsService.list(clientReturning(jsonResponse(403, errorBody('FORBIDDEN')))),
    ).toEqual({ status: 'forbidden' });
    expect(
      await invitationsService.list(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      ),
    ).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a list with a malformed invitation', jsonResponse(200, { success: true, data: [{}] })],
    ['a 200 whose data is not a list', jsonResponse(200, { success: true, data: invitation })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
  ])('returns unavailable with %s', async (_name, response) => {
    const outcome = await invitationsService.list(clientReturning(response));

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('returns unavailable, without throwing, on a network error', async () => {
    const outcome = await invitationsService.list(
      clientReturning(new TypeError('Failed to fetch')),
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('invitationsService.revoke', () => {
  it('sends POST /api/invitations/{id}/revoke through the authenticated client', async () => {
    const client = clientReturning(new Response(null, { status: 204 }));

    await invitationsService.revoke(client, INVITATION_ID);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/invitations/${INVITATION_ID}/revoke`);
    expect(client.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('returns revoked with a 204', async () => {
    const outcome = await invitationsService.revoke(
      clientReturning(new Response(null, { status: 204 })),
      INVITATION_ID,
    );

    expect(outcome).toEqual({ status: 'revoked' });
  });

  it('returns notFound with a 404 NOT_FOUND', async () => {
    const outcome = await invitationsService.revoke(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      INVITATION_ID,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns forbidden with a 403 FORBIDDEN and unauthenticated with a 401', async () => {
    expect(
      await invitationsService.revoke(
        clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
        INVITATION_ID,
      ),
    ).toEqual({ status: 'forbidden' });
    expect(
      await invitationsService.revoke(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
        INVITATION_ID,
      ),
    ).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 404 with another code', jsonResponse(404, errorBody('SOMETHING_ELSE'))],
    ['a 200 where a 204 is expected', jsonResponse(200, { success: true })],
  ])('returns unavailable with %s', async (_name, response) => {
    const outcome = await invitationsService.revoke(clientReturning(response), INVITATION_ID);

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('returns unavailable, without throwing, on a network error', async () => {
    const outcome = await invitationsService.revoke(
      clientReturning(new TypeError('Failed to fetch')),
      INVITATION_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});
