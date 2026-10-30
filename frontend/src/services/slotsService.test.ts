import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { slotsService } from './slotsService';

type SlotRule = components['schemas']['SubjectSlotRule'];

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';

const rule: SlotRule = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  subject: {
    id: SUBJECT_ID,
    name: 'Religión',
    code: 'REL',
    color: 'purple',
    sessionsPerWeek: 2,
    maxPerDay: null,
    blockSize: 2,
  },
  calendar: {
    id: '0192f5a0-0000-7000-8000-0000000000c1',
    name: 'Jornada',
    periods: [
      { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
      { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
      { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
    ],
  },
  slots: [
    { dayOfWeek: 1, sessionNumber: 1 },
    { dayOfWeek: 3, sessionNumber: 2 },
  ],
  outsideCalendarCount: 1,
  warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 1 }],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okBody = (data: SlotRule = rule) => ({ success: true, data: { slotRule: data } });
const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });

function sentBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
}

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

/** Variaciones de la regla que el contrato no admite: el servicio no debe fiarse de ellas. */
const BROKEN_RULES: [string, unknown][] = [
  ['without the course', { ...rule, course: undefined }],
  [
    'with a subject of an unknown color',
    { ...rule, subject: { ...rule.subject, color: 'magenta' } },
  ],
  [
    'with a subject without sessions',
    { ...rule, subject: { ...rule.subject, sessionsPerWeek: 6 } },
  ],
  ['with a maximum per day of 1', { ...rule, subject: { ...rule.subject, maxPerDay: 1 } }],
  ['with a block of 4', { ...rule, subject: { ...rule.subject, blockSize: 4 } }],
  [
    'with a subject without a code property',
    { ...rule, subject: { ...rule.subject, code: undefined } },
  ],
  ['with a calendar that is not an object', { ...rule, calendar: 'x' }],
  ['with a calendar without periods', { ...rule, calendar: { id: 'c', name: 'J' } }],
  [
    'with a period of an unknown type',
    {
      ...rule,
      calendar: {
        ...rule.calendar,
        periods: [{ type: 'LUNCH', startTime: '09:00', endTime: '10:00' }],
      },
    },
  ],
  [
    'with a period without an end',
    { ...rule, calendar: { ...rule.calendar, periods: [{ type: 'SESSION', startTime: '09:00' }] } },
  ],
  ['with slots that are not a list', { ...rule, slots: {} }],
  ['with a cell on day 6', { ...rule, slots: [{ dayOfWeek: 6, sessionNumber: 1 }] }],
  ['with a cell on session 0', { ...rule, slots: [{ dayOfWeek: 1, sessionNumber: 0 }] }],
  ['with a cell on session 9', { ...rule, slots: [{ dayOfWeek: 1, sessionNumber: 9 }] }],
  [
    'with a cell that is not an integer',
    { ...rule, slots: [{ dayOfWeek: 1.5, sessionNumber: 1 }] },
  ],
  ['with a negative outside count', { ...rule, outsideCalendarCount: -1 }],
  ['without the outside count', { ...rule, outsideCalendarCount: undefined }],
  ['with warnings that are not a list', { ...rule, warnings: 'x' }],
  ['with an unknown warning', { ...rule, warnings: [{ code: 'WHATEVER' }] }],
  [
    'with a warning of cells outside without its count',
    { ...rule, warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR' }] },
  ],
];

describe('slotsService.get', () => {
  it('asks for GET .../forbidden-slots through the authenticated client, encoding both ids', async () => {
    const client = clientReturning(jsonResponse(200, okBody()));

    await slotsService.get(client, 'a/b c', 'd e/f');

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(
      '/api/courses/a%2Fb%20c/subjects/d%20e%2Ff/forbidden-slots',
    );
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the rule with its calendar, cells and warnings', async () => {
    const outcome = await slotsService.get(
      clientReturning(jsonResponse(200, okBody())),
      COURSE_ID,
      SUBJECT_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', slotRule: rule });
  });

  it('returns a course without a calendar', async () => {
    const withoutCalendar: SlotRule = {
      ...rule,
      calendar: null,
      slots: [],
      outsideCalendarCount: 2,
    };

    const outcome = await slotsService.get(
      clientReturning(jsonResponse(200, okBody(withoutCalendar))),
      COURSE_ID,
      SUBJECT_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', slotRule: withoutCalendar });
  });

  it('is notFound on 404 and unauthenticated on 401', async () => {
    await expect(
      slotsService.get(
        clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
        COURSE_ID,
        SUBJECT_ID,
      ),
    ).resolves.toEqual({ status: 'notFound' });
    await expect(
      slotsService.get(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
        COURSE_ID,
        SUBJECT_ID,
      ),
    ).resolves.toEqual({ status: 'unauthenticated' });
  });

  it.each([500, 503])('is unavailable on %s', async (status) => {
    await expect(
      slotsService.get(
        clientReturning(jsonResponse(status, errorBody('X'))),
        COURSE_ID,
        SUBJECT_ID,
      ),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the request fails and never rejects', async () => {
    await expect(
      slotsService.get(clientReturning(new TypeError('fetch failed')), COURSE_ID, SUBJECT_ID),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the body of a 200 is not JSON', async () => {
    await expect(
      slotsService.get(
        clientReturning(new Response('<html>', { status: 200 })),
        COURSE_ID,
        SUBJECT_ID,
      ),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it.each(BROKEN_RULES)('is unavailable when the rule comes %s', async (_name, broken) => {
    const outcome = await slotsService.get(
      clientReturning(jsonResponse(200, { success: true, data: { slotRule: broken } })),
      COURSE_ID,
      SUBJECT_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('slotsService.update', () => {
  const slots = [
    { dayOfWeek: 1, sessionNumber: 1 },
    { dayOfWeek: 3, sessionNumber: 2 },
  ];

  it('sends PUT .../forbidden-slots with a JSON body through the authenticated client, encoding the ids', async () => {
    const client = clientReturning(jsonResponse(200, okBody()));

    await slotsService.update(client, 'a/b c', 'd e/f', slots);

    expect(client).toHaveBeenCalledOnce();
    const [url, init] = client.mock.calls[0] ?? [];
    expect(url).toBe('/api/courses/a%2Fb%20c/subjects/d%20e%2Ff/forbidden-slots');
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual({ slots });
  });

  it('sends only the day and the session of each cell, whatever else the input carries', async () => {
    const client = clientReturning(jsonResponse(200, okBody()));
    const carrying = [{ dayOfWeek: 2, sessionNumber: 3, schoolId: 'other', label: 'x' }];

    await slotsService.update(client, COURSE_ID, SUBJECT_ID, carrying);

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({
      slots: [{ dayOfWeek: 2, sessionNumber: 3 }],
    });
  });

  it('sends an empty list to remove the rule', async () => {
    const client = clientReturning(jsonResponse(200, okBody({ ...rule, slots: [] })));

    await slotsService.update(client, COURSE_ID, SUBJECT_ID, []);

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({ slots: [] });
  });

  it('returns the rule as it ended', async () => {
    const outcome = await slotsService.update(
      clientReturning(jsonResponse(200, okBody())),
      COURSE_ID,
      SUBJECT_ID,
      slots,
    );

    expect(outcome).toEqual({ status: 'updated', slotRule: rule });
  });

  it('returns the invalid fields of a 400 VALIDATION_ERROR', async () => {
    const details = [{ field: 'slots[0].sessionNumber', code: 'OUT_OF_RANGE' }];

    const outcome = await slotsService.update(
      clientReturning(
        jsonResponse(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'x', details },
        }),
      ),
      COURSE_ID,
      SUBJECT_ID,
      slots,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it('is unavailable on a 400 whose fields do not come as the contract says', async () => {
    const outcome = await slotsService.update(
      clientReturning(
        jsonResponse(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 3 }] },
        }),
      ),
      COURSE_ID,
      SUBJECT_ID,
      slots,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each([
    [404, 'NOT_FOUND', { status: 'notFound' }],
    [409, 'COURSE_HAS_NO_CALENDAR', { status: 'noCalendar' }],
    [403, 'FORBIDDEN', { status: 'forbidden' }],
    [401, 'INVALID_SESSION', { status: 'unauthenticated' }],
  ])('interprets %i %s as %j', async (status, code, expected) => {
    const outcome = await slotsService.update(
      clientReturning(jsonResponse(status, errorBody(code))),
      COURSE_ID,
      SUBJECT_ID,
      slots,
    );

    expect(outcome).toEqual(expected);
  });

  it('does not take a 409 with another code for a course without a calendar', async () => {
    const outcome = await slotsService.update(
      clientReturning(jsonResponse(409, errorBody('COURSE_CHANGED'))),
      COURSE_ID,
      SUBJECT_ID,
      slots,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each([500, 503])('is unavailable on %s', async (status) => {
    await expect(
      slotsService.update(
        clientReturning(jsonResponse(status, errorBody('X'))),
        COURSE_ID,
        SUBJECT_ID,
        slots,
      ),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the request fails, and when a 200 is not a rule, and never rejects', async () => {
    await expect(
      slotsService.update(
        clientReturning(new TypeError('fetch failed')),
        COURSE_ID,
        SUBJECT_ID,
        slots,
      ),
    ).resolves.toEqual({ status: 'unavailable' });
    await expect(
      slotsService.update(
        clientReturning(jsonResponse(200, { success: true, data: { slotRule: {} } })),
        COURSE_ID,
        SUBJECT_ID,
        slots,
      ),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
