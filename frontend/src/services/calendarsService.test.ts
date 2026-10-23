import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { calendarsService, type CreateCalendarInput } from './calendarsService';

type Calendar = components['schemas']['Calendar'];

const calendar: Calendar = {
  id: '0192f5a0-0000-7000-8000-0000000000c1',
  name: 'Primaria',
  createdAt: '2026-10-23T09:30:00.000Z',
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
    { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
  ],
  courses: [{ id: '0192f5a0-0000-7000-8000-0000000000d1', name: '1º Primaria' }],
};

const input: CreateCalendarInput = {
  name: 'Primaria',
  periods: calendar.periods,
  courseIds: ['0192f5a0-0000-7000-8000-0000000000d1'],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });

/** El cuerpo JSON que se envió. */
function sentBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
}

/** Cliente autenticado simulado que responde `response` (o rechaza si es un error). */
function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('calendarsService.list', () => {
  it('asks for GET /api/calendars through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { calendars: [] } }));

    await calendarsService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/calendars');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the calendars with their periods and courses', async () => {
    const outcome = await calendarsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { calendars: [calendar] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', calendars: [calendar] });
  });

  it('returns an empty list', async () => {
    const outcome = await calendarsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { calendars: [] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', calendars: [] });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await calendarsService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without calendars', jsonResponse(200, { success: true, data: {} })],
    [
      'a calendar without periods',
      jsonResponse(200, {
        success: true,
        data: { calendars: [{ ...calendar, periods: undefined }] },
      }),
    ],
    [
      'a period of an unknown type',
      jsonResponse(200, {
        success: true,
        data: {
          calendars: [
            { ...calendar, periods: [{ type: 'CLASS', startTime: '09:00', endTime: '09:45' }] },
          ],
        },
      }),
    ],
    [
      'a period with a badly written time',
      jsonResponse(200, {
        success: true,
        data: {
          calendars: [
            { ...calendar, periods: [{ type: 'SESSION', startTime: '9:00', endTime: '09:45' }] },
          ],
        },
      }),
    ],
    [
      'a course without name',
      jsonResponse(200, {
        success: true,
        data: { calendars: [{ ...calendar, courses: [{ id: 'x' }] }] },
      }),
    ],
    [
      'a creation date that is not a date',
      jsonResponse(200, {
        success: true,
        data: { calendars: [{ ...calendar, createdAt: 'ayer' }] },
      }),
    ],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(calendarsService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('calendarsService.create', () => {
  it('sends POST /api/calendars with a JSON body through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { calendar } }));

    await calendarsService.create(client, input);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/calendars');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual(input);
  });

  it('sends exactly the name, the periods and the courses, whatever else the input carries', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { calendar } }));

    await calendarsService.create(client, { ...input, schoolId: 'otro' } as CreateCalendarInput);

    expect(Object.keys(sentBody(client.mock.calls[0]?.[1]) as object).sort()).toEqual([
      'courseIds',
      'name',
      'periods',
    ]);
  });

  it('returns the created calendar', async () => {
    const outcome = await calendarsService.create(
      clientReturning(jsonResponse(201, { success: true, data: { calendar } })),
      input,
    );

    expect(outcome).toEqual({ status: 'created', calendar });
  });

  it('returns the invalid fields of a 400 VALIDATION_ERROR, also the new codes and NOT_FOUND', async () => {
    const details = [
      { field: 'name', code: 'REQUIRED' },
      { field: 'periods[0].endTime', code: 'TOO_LONG' },
      { field: 'periods[1].startTime', code: 'OVERLAP' },
      { field: 'periods[2].endTime', code: 'INVALID_RANGE' },
      { field: 'periods[3].type', code: 'NOT_ALLOWED' },
      { field: 'courseIds[0]', code: 'NOT_FOUND' },
    ];

    const outcome = await calendarsService.create(
      clientReturning(
        jsonResponse(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'x', details },
        }),
      ),
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it('returns alreadyExists on a 409 CALENDAR_ALREADY_EXISTS', async () => {
    const outcome = await calendarsService.create(
      clientReturning(jsonResponse(409, errorBody('CALENDAR_ALREADY_EXISTS'))),
      input,
    );

    expect(outcome).toEqual({ status: 'alreadyExists' });
  });

  it('returns forbidden on a 403 FORBIDDEN', async () => {
    const outcome = await calendarsService.create(
      clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
      input,
    );

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await calendarsService.create(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      input,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 400 that is not a validation error', jsonResponse(400, errorBody('INVALID_JSON'))],
    [
      'a 400 with details that are not field errors',
      jsonResponse(400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'x',
          details: [{ field: 'name', code: 'OTRO' }],
        },
      }),
    ],
    ['a 409 with another code', jsonResponse(409, errorBody('COURSE_ALREADY_EXISTS'))],
    ['a 201 without calendar', jsonResponse(201, { success: true, data: {} })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(calendarsService.create(clientReturning(response), input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
