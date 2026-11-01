import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { professorsSummaryService } from './professorsSummaryService';

type Summary = components['schemas']['ProfessorsSummary'];
type Load = components['schemas']['ProfessorLoad'];

const load: Load = {
  id: '0192f5a0-0000-7000-8000-0000000000f1',
  firstName: 'Ana',
  lastName: 'García',
  subjects: [
    {
      subjectId: '0192f5a0-0000-7000-8000-0000000000e1',
      subjectName: 'Inglés',
      courseId: '0192f5a0-0000-7000-8000-0000000000d1',
      courseName: '1º Primaria',
      classId: '0192f5a0-0000-7000-8000-0000000000c1',
      className: 'A',
      sessionsPerWeek: 5,
    },
  ],
  courses: [{ id: '0192f5a0-0000-7000-8000-0000000000d1', name: '1º Primaria' }],
  sessionsPerWeek: 5,
  minMinutes: 225,
  maxMinutes: 300,
  status: 'FITS',
  warnings: [],
};

const summary: Summary = {
  maxTeachingMinutes: 1380,
  professors: [load],
  unassigned: [
    {
      courseId: '0192f5a0-0000-7000-8000-0000000000d1',
      courseName: '1º Primaria',
      missingCount: 2,
    },
  ],
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

const answer = (data: unknown) => jsonResponse(200, { success: true, data: { summary: data } });
const withLoad = (changes: Record<string, unknown>) =>
  answer({ ...summary, professors: [{ ...load, ...changes }] });

describe('professorsSummaryService.get', () => {
  it('asks for GET /api/professors/summary through the authenticated client', async () => {
    const client = clientReturning(answer(summary));

    await professorsSummaryService.get(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/professors/summary');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the summary as it comes', async () => {
    const outcome = await professorsSummaryService.get(clientReturning(answer(summary)));

    expect(outcome).toEqual({ status: 'loaded', summary });
  });

  it('returns an empty summary', async () => {
    const empty: Summary = { maxTeachingMinutes: 1380, professors: [], unassigned: [] };

    expect(await professorsSummaryService.get(clientReturning(answer(empty)))).toEqual({
      status: 'loaded',
      summary: empty,
    });
  });

  it('accepts every status and every warning with its own data', async () => {
    const professors: Load[] = [
      { ...load, id: 'p-0', status: 'NO_LOAD', sessionsPerWeek: 0, minMinutes: 0, maxMinutes: 0 },
      {
        ...load,
        id: 'p-1',
        status: 'MAY_EXCEED',
        warnings: [{ code: 'MAY_EXCEED_MAX_HOURS' }],
      },
      {
        ...load,
        id: 'p-2',
        status: 'EXCEEDS',
        minMinutes: 1400,
        maxMinutes: 1500,
        warnings: [
          { code: 'EXCEEDS_MAX_HOURS' },
          {
            code: 'AVAILABILITY_INSUFFICIENT',
            calendar: { id: 'cal-1', name: 'Primaria' },
            sessions: 22,
            available: 20,
          },
          {
            code: 'COURSE_WITHOUT_CALENDAR',
            course: { id: 'c-6', name: '6º Primaria' },
            assignmentCount: 3,
          },
          { code: 'SEVERAL_CALENDARS', calendarCount: 2 },
        ],
      },
    ];
    const rich: Summary = { ...summary, professors };

    const outcome = await professorsSummaryService.get(clientReturning(answer(rich)));

    expect(outcome).toEqual({ status: 'loaded', summary: rich });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await professorsSummaryService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await professorsSummaryService.get(clientReturning(new Error('offline')));

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without summary', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a summary with another maximum', answer({ ...summary, maxTeachingMinutes: 1500 })],
    ['a summary without professors', answer({ ...summary, professors: undefined })],
    ['a summary without unassigned', answer({ ...summary, unassigned: undefined })],
    ['a professor without id', withLoad({ id: undefined })],
    ['a professor without last name', withLoad({ lastName: 5 })],
    ['a professor without subjects', withLoad({ subjects: undefined })],
    ['a subject that is not valid', withLoad({ subjects: [{ subjectId: 'x' }] })],
    ['a course without name', withLoad({ courses: [{ id: 'x' }] })],
    ['a professor with a status that does not exist', withLoad({ status: 'BUSY' })],
    ['negative sessions', withLoad({ sessionsPerWeek: -1 })],
    ['a minimum that is not an integer', withLoad({ minMinutes: 10.5 })],
    ['a minimum above the maximum', withLoad({ minMinutes: 400, maxMinutes: 300 })],
    ['professor without warnings', withLoad({ warnings: undefined })],
    ['a warning with a code that does not exist', withLoad({ warnings: [{ code: 'OTHER' }] })],
    [
      'an availability warning without calendar',
      withLoad({ warnings: [{ code: 'AVAILABILITY_INSUFFICIENT', sessions: 2, available: 1 }] }),
    ],
    [
      'an availability warning without numbers',
      withLoad({
        warnings: [{ code: 'AVAILABILITY_INSUFFICIENT', calendar: { id: 'c', name: 'P' } }],
      }),
    ],
    [
      'a course-without-calendar warning without course',
      withLoad({ warnings: [{ code: 'COURSE_WITHOUT_CALENDAR', assignmentCount: 1 }] }),
    ],
    [
      'a course-without-calendar warning with no assignments',
      withLoad({
        warnings: [
          {
            code: 'COURSE_WITHOUT_CALENDAR',
            course: { id: 'c', name: 'P' },
            assignmentCount: 0,
          },
        ],
      }),
    ],
    [
      'a several-calendars warning with one calendar',
      withLoad({ warnings: [{ code: 'SEVERAL_CALENDARS', calendarCount: 1 }] }),
    ],
    [
      'an unassigned course without name',
      answer({ ...summary, unassigned: [{ courseId: 'c', missingCount: 1 }] }),
    ],
    [
      'an unassigned course with nothing missing',
      answer({
        ...summary,
        unassigned: [{ courseId: 'c', courseName: 'x', missingCount: 0 }],
      }),
    ],
  ])('is unavailable on %s', async (_name, response) => {
    expect(await professorsSummaryService.get(clientReturning(response))).toEqual({
      status: 'unavailable',
    });
  });
});
