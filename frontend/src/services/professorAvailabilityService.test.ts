import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { professorAvailabilityService } from './professorAvailabilityService';

type Availability = components['schemas']['ProfessorAvailability'];

const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

const availability: Availability = {
  professorId: PROFESSOR_ID,
  unavailable: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:30' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '14:00' },
  ],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ok = (value: unknown) => jsonResponse(200, { success: true, data: { availability: value } });
const errorBody = (code: string, details?: unknown) => ({
  success: false,
  error: { code, message: 'x', details },
});

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('professorAvailabilityService.get', () => {
  it('asks for GET /api/professors/{id}/availability through the authenticated client', async () => {
    const client = clientReturning(ok(availability));

    await professorAvailabilityService.get(client, PROFESSOR_ID);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/professors/${PROFESSOR_ID}/availability`);
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('encodes the id', async () => {
    const client = clientReturning(ok(availability));

    await professorAvailabilityService.get(client, 'a/b?c');

    expect(client.mock.calls[0]?.[0]).toBe('/api/professors/a%2Fb%3Fc/availability');
  });

  it('returns the availability as it comes', async () => {
    const outcome = await professorAvailabilityService.get(
      clientReturning(ok(availability)),
      PROFESSOR_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', availability });
  });

  it('returns an empty list', async () => {
    const empty = { professorId: PROFESSOR_ID, unavailable: [] };

    expect(
      await professorAvailabilityService.get(clientReturning(ok(empty)), PROFESSOR_ID),
    ).toEqual({ status: 'loaded', availability: empty });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await professorAvailabilityService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      PROFESSOR_ID,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it('is notFound on 404', async () => {
    const outcome = await professorAvailabilityService.get(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      PROFESSOR_ID,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  const withInterval = (changes: Record<string, unknown>) =>
    ok({
      professorId: PROFESSOR_ID,
      unavailable: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00', ...changes }],
    });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without availability', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['an availability without professorId', ok({ unavailable: [] })],
    ['an availability without a list', ok({ professorId: PROFESSOR_ID })],
    ['an interval with day 6', withInterval({ dayOfWeek: 6 })],
    ['an interval with day 0', withInterval({ dayOfWeek: 0 })],
    ['an interval with a fractional day', withInterval({ dayOfWeek: 1.5 })],
    ['an interval with an hour that is not HH:MM', withInterval({ startTime: '9:00' })],
    ['an interval with an hour out of range', withInterval({ endTime: '24:00' })],
    ['an interval with an hour that is not text', withInterval({ startTime: 900 })],
    ['an interval without end', withInterval({ endTime: undefined })],
  ])('is unavailable on %s', async (_name, response) => {
    expect(await professorAvailabilityService.get(clientReturning(response), PROFESSOR_ID)).toEqual(
      {
        status: 'unavailable',
      },
    );
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await professorAvailabilityService.get(
      clientReturning(new Error('network')),
      PROFESSOR_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('professorAvailabilityService.update', () => {
  const intervals = availability.unavailable;

  it('sends PUT with the final state and nothing else', async () => {
    const client = clientReturning(ok(availability));

    await professorAvailabilityService.update(client, PROFESSOR_ID, [
      { ...intervals[0], extra: 'x' } as unknown as (typeof intervals)[number],
    ]);

    const [url, init] = client.mock.calls[0] ?? [];
    expect(url).toBe(`/api/professors/${PROFESSOR_ID}/availability`);
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({
      unavailable: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:30' }],
    });
  });

  it('sends an empty list to leave the professor available always', async () => {
    const client = clientReturning(ok({ professorId: PROFESSOR_ID, unavailable: [] }));

    await professorAvailabilityService.update(client, PROFESSOR_ID, []);

    expect(JSON.parse(client.mock.calls[0]?.[1]?.body as string)).toEqual({ unavailable: [] });
  });

  it('returns what the server stored', async () => {
    const outcome = await professorAvailabilityService.update(
      clientReturning(ok(availability)),
      PROFESSOR_ID,
      intervals,
    );

    expect(outcome).toEqual({ status: 'updated', availability });
  });

  it('returns the wrong fields of a 400', async () => {
    const details = [{ field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' }];

    const outcome = await professorAvailabilityService.update(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
      PROFESSOR_ID,
      intervals,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it.each([
    [
      'a 400 with details that are not fields',
      jsonResponse(400, errorBody('VALIDATION_ERROR', 'x')),
    ],
    ['a 400 of another code', jsonResponse(400, errorBody('OTHER'))],
    ['a 200 with a wrong shape', ok({ professorId: PROFESSOR_ID })],
    ['a 403', jsonResponse(403, errorBody('FORBIDDEN'))],
    ['a 409', jsonResponse(409, errorBody('CONFLICT'))],
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
  ])('is unavailable on %s', async (_name, response) => {
    expect(
      await professorAvailabilityService.update(clientReturning(response), PROFESSOR_ID, intervals),
    ).toEqual({ status: 'unavailable' });
  });

  it('is notFound on 404 and unauthenticated on 401', async () => {
    expect(
      await professorAvailabilityService.update(
        clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
        PROFESSOR_ID,
        intervals,
      ),
    ).toEqual({ status: 'notFound' });
    expect(
      await professorAvailabilityService.update(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
        PROFESSOR_ID,
        intervals,
      ),
    ).toEqual({ status: 'unauthenticated' });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await professorAvailabilityService.update(
      clientReturning(new Error('network')),
      PROFESSOR_ID,
      intervals,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});
