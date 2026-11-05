import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { scheduleService } from './scheduleService';

type Summary = components['schemas']['ScheduleSummary'];

const ID = '0192f5a0-0000-7000-8000-0000000000a2';

const draft: Summary = {
  id: '0192f5a0-0000-7000-8000-0000000000a3',
  status: 'DRAFT',
  generatedAt: '2026-11-05T09:00:00.000Z',
  placedSessions: 300,
  confirmedAt: null,
  confirmedBy: null,
  replacedAt: null,
};
const official: Summary = {
  id: ID,
  status: 'OFFICIAL',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 290,
  confirmedAt: '2026-11-04T10:30:00.000Z',
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: null,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

const overviewAnswer = (data: unknown) => jsonResponse(200, { success: true, data });

describe('scheduleService.overview', () => {
  it('asks for GET /api/schedule/overview through the authenticated client', async () => {
    const client = clientReturning(
      overviewAnswer({ draft: null, official: null, previousCount: 0 }),
    );

    await scheduleService.overview(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/overview');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the draft, the official and how many were replaced', async () => {
    const data = { draft, official, previousCount: 2 };

    expect(await scheduleService.overview(clientReturning(overviewAnswer(data)))).toEqual({
      status: 'loaded',
      overview: data,
    });
  });

  it('accepts a school with no schedule at all', async () => {
    const data = { draft: null, official: null, previousCount: 0 };

    expect(await scheduleService.overview(clientReturning(overviewAnswer(data)))).toEqual({
      status: 'loaded',
      overview: data,
    });
  });

  it('is unauthenticated on 401', async () => {
    expect(
      await scheduleService.overview(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      ),
    ).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 200 without data', jsonResponse(200, { success: true })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a missing count', overviewAnswer({ draft: null, official: null })],
    ['a negative count', overviewAnswer({ draft: null, official: null, previousCount: -1 })],
    [
      'a count that is not an integer',
      overviewAnswer({ draft: null, official: null, previousCount: 1.5 }),
    ],
    [
      'an official with the status of a draft',
      overviewAnswer({ draft: null, official: draft, previousCount: 0 }),
    ],
    [
      'a draft with the status of an official',
      overviewAnswer({ draft: official, official: null, previousCount: 0 }),
    ],
    [
      'an official without who confirmed it',
      overviewAnswer({
        draft: null,
        official: { ...official, confirmedBy: null },
        previousCount: 0,
      }),
    ],
    [
      'a draft with a confirmation',
      overviewAnswer({
        draft: { ...draft, confirmedAt: official.confirmedAt },
        official: null,
        previousCount: 0,
      }),
    ],
    [
      'a header with a date that is not a date',
      overviewAnswer({
        draft: { ...draft, generatedAt: 'ayer' },
        official: null,
        previousCount: 0,
      }),
    ],
    [
      'a header with negative sessions',
      overviewAnswer({ draft: { ...draft, placedSessions: -1 }, official: null, previousCount: 0 }),
    ],
  ])('is unavailable for %s', async (_name, response) => {
    expect(await scheduleService.overview(clientReturning(response))).toEqual({
      status: 'unavailable',
    });
  });

  it('is unavailable when the request fails', async () => {
    expect(await scheduleService.overview(clientReturning(new Error('offline')))).toEqual({
      status: 'unavailable',
    });
  });
});

describe('scheduleService.confirm', () => {
  it('sends POST /api/schedule/{id}/confirm through the authenticated client', async () => {
    const client = clientReturning(
      jsonResponse(200, { success: true, data: { schedule: official } }),
    );

    await scheduleService.confirm(client, ID);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/schedule/${ID}/confirm`);
    expect(client.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('encodes the id in the address', async () => {
    const client = clientReturning(jsonResponse(404, errorBody('NOT_FOUND')));

    await scheduleService.confirm(client, 'a/b?c');

    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/a%2Fb%3Fc/confirm');
  });

  it('returns the confirmed schedule', async () => {
    const outcome = await scheduleService.confirm(
      clientReturning(jsonResponse(200, { success: true, data: { schedule: official } })),
      ID,
    );

    expect(outcome).toEqual({ status: 'confirmed', schedule: official });
  });

  it.each([
    [401, 'INVALID_SESSION', 'unauthenticated'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'notFound'],
    [409, 'SCHEDULE_NOT_DRAFT', 'notDraft'],
    [503, 'DATABASE_UNAVAILABLE', 'unavailable'],
    [500, 'INTERNAL_ERROR', 'unavailable'],
    [409, 'SOMETHING_ELSE', 'unavailable'],
  ])('maps %i %s to %s', async (status, code, expected) => {
    const outcome = await scheduleService.confirm(
      clientReturning(jsonResponse(status, errorBody(code))),
      ID,
    );

    expect(outcome).toEqual({ status: expected });
  });

  it.each([
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a 200 without the schedule', jsonResponse(200, { success: true, data: {} })],
    [
      'a schedule that is still a draft',
      jsonResponse(200, { success: true, data: { schedule: draft } }),
    ],
  ])('is unavailable for %s', async (_name, response) => {
    expect(await scheduleService.confirm(clientReturning(response), ID)).toEqual({
      status: 'unavailable',
    });
  });

  it('is unavailable when the request fails', async () => {
    expect(await scheduleService.confirm(clientReturning(new Error('offline')), ID)).toEqual({
      status: 'unavailable',
    });
  });
});

describe('scheduleService.discard', () => {
  it('sends DELETE /api/schedule/{id} through the authenticated client', async () => {
    const client = clientReturning(new Response(null, { status: 204 }));

    await scheduleService.discard(client, ID);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/schedule/${ID}`);
    expect(client.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('is discarded on 204', async () => {
    expect(
      await scheduleService.discard(clientReturning(new Response(null, { status: 204 })), ID),
    ).toEqual({ status: 'discarded' });
  });

  it.each([
    [401, 'INVALID_SESSION', 'unauthenticated'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'notFound'],
    [409, 'SCHEDULE_NOT_DRAFT', 'notDraft'],
    [503, 'DATABASE_UNAVAILABLE', 'unavailable'],
    [409, 'SOMETHING_ELSE', 'unavailable'],
  ])('maps %i %s to %s', async (status, code, expected) => {
    const outcome = await scheduleService.discard(
      clientReturning(jsonResponse(status, errorBody(code))),
      ID,
    );

    expect(outcome).toEqual({ status: expected });
  });

  it('does not take a 200 for a discard', async () => {
    expect(
      await scheduleService.discard(clientReturning(jsonResponse(200, { success: true })), ID),
    ).toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the request fails', async () => {
    expect(await scheduleService.discard(clientReturning(new Error('offline')), ID)).toEqual({
      status: 'unavailable',
    });
  });
});
