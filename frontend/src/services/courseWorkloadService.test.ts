import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { courseWorkloadService } from './courseWorkloadService';

type CourseWorkload = components['schemas']['CourseWorkload'];

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';

const workload: CourseWorkload = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  calendar: {
    id: '0192f5a0-0000-7000-8000-0000000000c1',
    name: 'Jornada',
    sessionsPerDay: 6,
    maxConsecutiveSessions: 3,
    sessionGroups: [3, 3],
  },
  subjects: [
    {
      id: SUBJECT_ID,
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
      maxPerDay: 2,
      blockSize: 2,
      constraintCount: 2,
      assignmentCount: 3,
      forbiddenSlots: [
        { dayOfWeek: 1, sessionNumber: 1 },
        { dayOfWeek: 3, sessionNumber: 2 },
      ],
      preferredSlotCount: 4,
      warnings: [],
    },
    {
      id: '0192f5a0-0000-7000-8000-0000000000e2',
      name: 'Música',
      code: null,
      color: 'pink',
      status: 'INACTIVE',
      sessionsPerWeek: null,
      maxPerDay: null,
      blockSize: null,
      constraintCount: 0,
      assignmentCount: 0,
      forbiddenSlots: [],
      preferredSlotCount: 0,
      warnings: [],
    },
  ],
  assignedSessions: 3,
  availableSessions: 30,
  warnings: [],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okBody = (data: CourseWorkload = workload) => ({ success: true, data: { workload: data } });
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

/** Variaciones de la carga que el contrato no admite: el servicio no debe fiarse de ellas. */
const BROKEN_WORKLOADS: [string, unknown][] = [
  ['without the course', { ...workload, course: undefined }],
  ['with a course without a name', { ...workload, course: { id: COURSE_ID } }],
  ['with a calendar that is not an object', { ...workload, calendar: 'x' }],
  [
    'with a calendar without sessions per day',
    { ...workload, calendar: { id: 'c', name: 'Jornada' } },
  ],
  ['with subjects that are not a list', { ...workload, subjects: {} }],
  [
    'with a negative count of preferred slots',
    { ...workload, subjects: [{ ...workload.subjects[0], preferredSlotCount: -1 }] },
  ],
  [
    'with a warning of preferred slots forbidden without its count',
    {
      ...workload,
      subjects: [{ ...workload.subjects[0], warnings: [{ code: 'PREFERRED_SLOTS_FORBIDDEN' }] }],
    },
  ],
  [
    'with a subject of an unknown color',
    { ...workload, subjects: [{ ...workload.subjects[0], color: 'magenta' }] },
  ],
  [
    'with a subject of an unknown status',
    { ...workload, subjects: [{ ...workload.subjects[0], status: 'DELETED' }] },
  ],
  [
    'with a subject with 6 sessions',
    { ...workload, subjects: [{ ...workload.subjects[0], sessionsPerWeek: 6 }] },
  ],
  [
    'with a subject with sessions that are not an integer',
    { ...workload, subjects: [{ ...workload.subjects[0], sessionsPerWeek: 2.5 }] },
  ],
  [
    'with a subject without sessions at all',
    { ...workload, subjects: [{ ...workload.subjects[0], sessionsPerWeek: undefined }] },
  ],
  [
    'with a calendar without the longest stretch',
    { ...workload, calendar: { ...workload.calendar, maxConsecutiveSessions: undefined } },
  ],
  [
    'with a calendar with a stretch of 0 sessions',
    { ...workload, calendar: { ...workload.calendar, maxConsecutiveSessions: 0 } },
  ],
  [
    'with a calendar without the groups of sessions',
    { ...workload, calendar: { ...workload.calendar, sessionGroups: undefined } },
  ],
  [
    'with an empty list of groups of sessions',
    { ...workload, calendar: { ...workload.calendar, sessionGroups: [] } },
  ],
  [
    'with more than three groups of sessions',
    { ...workload, calendar: { ...workload.calendar, sessionGroups: [1, 1, 1, 1] } },
  ],
  [
    'with a group of 9 sessions',
    { ...workload, calendar: { ...workload.calendar, sessionGroups: [9] } },
  ],
  [
    'with a forbidden slot on day 6',
    {
      ...workload,
      subjects: [{ ...workload.subjects[0], forbiddenSlots: [{ dayOfWeek: 6, sessionNumber: 1 }] }],
    },
  ],
  [
    'with a forbidden slot on session 0',
    {
      ...workload,
      subjects: [{ ...workload.subjects[0], forbiddenSlots: [{ dayOfWeek: 1, sessionNumber: 0 }] }],
    },
  ],
  [
    'with a warning of cells outside the calendar without its count',
    {
      ...workload,
      subjects: [{ ...workload.subjects[0], warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR' }] }],
    },
  ],
  ...(
    [
      'maxPerDay',
      'blockSize',
      'constraintCount',
      'assignmentCount',
      'forbiddenSlots',
      'preferredSlotCount',
      'warnings',
    ] as const
  ).map((field): [string, unknown] => [
    `with a subject without ${field}`,
    { ...workload, subjects: [{ ...workload.subjects[0], [field]: undefined }] },
  ]),
  [
    'with a maximum per day of 1',
    { ...workload, subjects: [{ ...workload.subjects[0], maxPerDay: 1 }] },
  ],
  [
    'with a maximum per day of 6',
    { ...workload, subjects: [{ ...workload.subjects[0], maxPerDay: 6 }] },
  ],
  ['with a block of 4', { ...workload, subjects: [{ ...workload.subjects[0], blockSize: 4 }] }],
  [
    'with a block of half a session',
    { ...workload, subjects: [{ ...workload.subjects[0], blockSize: 2.5 }] },
  ],
  [
    'with a negative count of rules',
    { ...workload, subjects: [{ ...workload.subjects[0], constraintCount: -1 }] },
  ],
  [
    'with a negative count of assignments',
    { ...workload, subjects: [{ ...workload.subjects[0], assignmentCount: -1 }] },
  ],
  [
    'with a count of assignments that is not an integer',
    { ...workload, subjects: [{ ...workload.subjects[0], assignmentCount: 1.5 }] },
  ],
  [
    'with an unknown warning in a subject',
    { ...workload, subjects: [{ ...workload.subjects[0], warnings: [{ code: 'WHATEVER' }] }] },
  ],
  ['with assigned sessions as text', { ...workload, assignedSessions: '3' }],
  ['with negative assigned sessions', { ...workload, assignedSessions: -1 }],
  ['without the available sessions', { ...workload, availableSessions: undefined }],
  ['with warnings that are not a list', { ...workload, warnings: 'x' }],
  ['with an unknown warning', { ...workload, warnings: [{ code: 'WHATEVER' }] }],
  [
    'with an excess warning without its numbers',
    { ...workload, warnings: [{ code: 'WORKLOAD_EXCEEDS_SLOTS' }] },
  ],
];

describe('courseWorkloadService.get', () => {
  it('asks for GET /api/courses/{id}/workload through the authenticated client, encoding the id', async () => {
    const client = clientReturning(jsonResponse(200, okBody()));

    await courseWorkloadService.get(client, 'a/b c');

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/courses/a%2Fb%20c/workload');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the workload with its calendar, subjects and balance', async () => {
    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody())),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload });
  });

  it('returns a course without a calendar, with its available sessions as null', async () => {
    const withoutCalendar: CourseWorkload = {
      ...workload,
      calendar: null,
      availableSessions: null,
      warnings: [{ code: 'COURSE_WITHOUT_CALENDAR' }],
    };

    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody(withoutCalendar))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload: withoutCalendar });
  });

  it('returns the numbers of the warning that the load exceeds the sessions', async () => {
    const exceeding: CourseWorkload = {
      ...workload,
      assignedSessions: 31,
      warnings: [{ code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 31, available: 30 }],
    };

    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody(exceeding))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload: exceeding });
  });

  it('returns the warnings of each subject with the new codes', async () => {
    const warned: CourseWorkload = {
      ...workload,
      subjects: [
        {
          ...workload.subjects[0]!,
          warnings: [{ code: 'BLOCK_LARGER_THAN_LOAD' }, { code: 'SUBJECT_DOES_NOT_FIT' }],
        },
        workload.subjects[1]!,
      ],
    };

    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody(warned))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload: warned });
  });

  it('returns the warning of cells outside the calendar with its count', async () => {
    const warned: CourseWorkload = {
      ...workload,
      subjects: [
        { ...workload.subjects[0]!, warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }] },
        workload.subjects[1]!,
      ],
    };

    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody(warned))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload: warned });
  });

  it('returns the count of preferred slots and the warning that some are forbidden, with its count', async () => {
    const warned: CourseWorkload = {
      ...workload,
      subjects: [
        {
          ...workload.subjects[0]!,
          preferredSlotCount: 10,
          warnings: [{ code: 'PREFERRED_SLOTS_FORBIDDEN', count: 2 }],
        },
        workload.subjects[1]!,
      ],
    };

    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody(warned))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload: warned });
  });

  it('returns a school without subjects', async () => {
    const empty: CourseWorkload = { ...workload, subjects: [], assignedSessions: 0 };

    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, okBody(empty))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', workload: empty });
  });

  it('is notFound on 404', async () => {
    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([500, 503])('is unavailable on %s', async (status) => {
    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(status, errorBody('DATABASE_UNAVAILABLE'))),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the request fails and never rejects', async () => {
    await expect(
      courseWorkloadService.get(clientReturning(new TypeError('fetch failed')), COURSE_ID),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the body of a 200 is not JSON', async () => {
    const outcome = await courseWorkloadService.get(
      clientReturning(new Response('<html>', { status: 200 })),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each(BROKEN_WORKLOADS)('is unavailable when the workload comes %s', async (_name, broken) => {
    const outcome = await courseWorkloadService.get(
      clientReturning(jsonResponse(200, { success: true, data: { workload: broken } })),
      COURSE_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('courseWorkloadService.update', () => {
  const changes = [
    { subjectId: SUBJECT_ID, sessionsPerWeek: 4, maxPerDay: 2, blockSize: null },
    {
      subjectId: '0192f5a0-0000-7000-8000-0000000000e2',
      sessionsPerWeek: null,
      maxPerDay: null,
      blockSize: null,
    },
  ];

  it('sends PATCH /api/courses/{id}/workload with a JSON body through the authenticated client, encoding the id', async () => {
    const client = clientReturning(jsonResponse(200, okBody()));

    await courseWorkloadService.update(client, 'a/b c', changes);

    expect(client).toHaveBeenCalledOnce();
    const [url, init] = client.mock.calls[0] ?? [];
    expect(url).toBe('/api/courses/a%2Fb%20c/workload');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual({ changes });
  });

  it('sends only the four fields of each change, whatever else the input carries', async () => {
    const client = clientReturning(jsonResponse(200, okBody()));
    const carrying = [
      {
        subjectId: SUBJECT_ID,
        sessionsPerWeek: 2,
        maxPerDay: 3,
        blockSize: 2,
        schoolId: 'other',
        name: 'x',
      },
    ];

    await courseWorkloadService.update(client, COURSE_ID, carrying);

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({
      changes: [{ subjectId: SUBJECT_ID, sessionsPerWeek: 2, maxPerDay: 3, blockSize: 2 }],
    });
  });

  it('returns the workload as it ended', async () => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(200, okBody())),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'updated', workload });
  });

  it('returns the invalid fields of a 400 VALIDATION_ERROR, also OUT_OF_RANGE and NOT_FOUND', async () => {
    const details = [
      { field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
      { field: 'changes[1].subjectId', code: 'NOT_FOUND' },
    ];

    const outcome = await courseWorkloadService.update(
      clientReturning(
        jsonResponse(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'x', details },
        }),
      ),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it.each([
    ['without details', { success: false, error: { code: 'VALIDATION_ERROR', message: 'x' } }],
    [
      'with an unknown field code',
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'x',
          details: [{ field: 'changes', code: 'WHATEVER' }],
        },
      },
    ],
  ])('is unavailable on a 400 %s', async (_name, body) => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(400, body)),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('returns notFound on a 404', async () => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns forbidden on a 403 FORBIDDEN', async () => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('is unavailable on a 403 that is not FORBIDDEN', async () => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED'))),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([500, 503])('is unavailable on %s', async (status) => {
    const outcome = await courseWorkloadService.update(
      clientReturning(jsonResponse(status, errorBody('DATABASE_UNAVAILABLE'))),
      COURSE_ID,
      changes,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the request fails and never rejects', async () => {
    await expect(
      courseWorkloadService.update(
        clientReturning(new TypeError('fetch failed')),
        COURSE_ID,
        changes,
      ),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it.each(BROKEN_WORKLOADS)(
    'is unavailable when the workload of a 200 comes %s',
    async (_name, broken) => {
      const outcome = await courseWorkloadService.update(
        clientReturning(jsonResponse(200, { success: true, data: { workload: broken } })),
        COURSE_ID,
        changes,
      );

      expect(outcome).toEqual({ status: 'unavailable' });
    },
  );
});
