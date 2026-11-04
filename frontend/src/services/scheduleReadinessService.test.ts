import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { scheduleReadinessService } from './scheduleReadinessService';

type Readiness = components['schemas']['ScheduleReadiness'];
type Issue = components['schemas']['ReadinessIssue'];

const ref = (name: string) => ({ id: `id-${name}`, name });
const professor = { id: 'p-eva', firstName: 'Eva', lastName: 'García' };

/** Un problema de cada código bloqueante, con lo que lleva cada uno. */
const blocking: Issue[] = [
  { code: 'SCHOOL_WITHOUT_COURSES' },
  { code: 'COURSE_WITHOUT_CALENDAR', course: ref('6º Primaria') },
  { code: 'WORKLOAD_EXCEEDS_SLOTS', course: ref('1º Primaria'), assigned: 31, available: 30 },
  { code: 'BLOCK_LARGER_THAN_LOAD', course: ref('1º Primaria'), subject: ref('Plástica') },
  { code: 'SUBJECT_DOES_NOT_FIT', course: ref('1º Primaria'), subject: ref('Música') },
  {
    code: 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
    course: ref('1º Primaria'),
    subject: ref('Inglés'),
    schoolClass: ref('A'),
    professor,
  },
  {
    code: 'CLASSES_WITHOUT_PROFESSOR',
    course: ref('1º Primaria'),
    subject: ref('Lengua'),
    classes: [ref('B'), ref('C')],
    missingCount: 2,
  },
  { code: 'EXCEEDS_MAX_HOURS', professor },
  {
    code: 'AVAILABILITY_INSUFFICIENT',
    professor,
    calendar: ref('Primaria'),
    sessions: 22,
    available: 20,
  },
];

/** Un problema de cada código de aviso. */
const warnings: Issue[] = [
  { code: 'SUBJECT_INACTIVE', subject: ref('Francés'), courses: [ref('5º Primaria')] },
  { code: 'COURSE_WITHOUT_CLASSES', course: ref('2 años') },
  { code: 'COURSE_WITHOUT_SUBJECTS', course: ref('3 años') },
  { code: 'WORKLOAD_BELOW_SLOTS', course: ref('4º Primaria'), assigned: 25, available: 30 },
  { code: 'MAY_EXCEED_MAX_HOURS', professor },
  { code: 'SEVERAL_CALENDARS', professor, count: 2 },
  { code: 'SLOTS_OUTSIDE_CALENDAR', course: ref('1º Primaria'), subject: ref('Música'), count: 2 },
  {
    code: 'PREFERRED_SLOTS_FORBIDDEN',
    course: ref('1º Primaria'),
    subject: ref('Música'),
    count: 1,
  },
];

const readiness: Readiness = { ready: false, blocking, warnings };

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

const answer = (data: unknown) => jsonResponse(200, { success: true, data: { readiness: data } });
const withBlocking = (...issues: unknown[]) =>
  answer({ ready: issues.length === 0, blocking: issues, warnings: [] });
const withWarning = (...issues: unknown[]) =>
  answer({ ready: true, blocking: [], warnings: issues });

describe('scheduleReadinessService.get', () => {
  it('asks for GET /api/schedule/readiness through the authenticated client', async () => {
    const client = clientReturning(answer(readiness));

    await scheduleReadinessService.get(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/readiness');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the readiness as it comes, with a problem of every code', async () => {
    const outcome = await scheduleReadinessService.get(clientReturning(answer(readiness)));

    expect(outcome).toEqual({ status: 'loaded', readiness });
  });

  it('returns a school that is ready', async () => {
    const ready: Readiness = { ready: true, blocking: [], warnings: [] };

    expect(await scheduleReadinessService.get(clientReturning(answer(ready)))).toEqual({
      status: 'loaded',
      readiness: ready,
    });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await scheduleReadinessService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await scheduleReadinessService.get(clientReturning(new Error('offline')));

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without readiness', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a readiness without the lists', answer({ ready: true })],
    ['a ready school with blocking issues', answer({ ready: true, blocking, warnings: [] })],
    [
      'a school that is not ready without blocking issues',
      answer({ ready: false, blocking: [], warnings: [] }),
    ],
    ['a code that does not exist', withBlocking({ code: 'OTHER' })],
    [
      'a warning among the blocking issues',
      withBlocking({ code: 'SUBJECT_INACTIVE', subject: ref('x'), courses: [ref('y')] }),
    ],
    [
      'a blocking issue among the warnings',
      withWarning({ code: 'COURSE_WITHOUT_CALENDAR', course: ref('x') }),
    ],
    [
      'a course-without-calendar issue without course',
      withBlocking({ code: 'COURSE_WITHOUT_CALENDAR' }),
    ],
    [
      'a reference without name',
      withBlocking({ code: 'COURSE_WITHOUT_CALENDAR', course: { id: 'x' } }),
    ],
    [
      'a workload issue without numbers',
      withBlocking({ code: 'WORKLOAD_EXCEEDS_SLOTS', course: ref('x') }),
    ],
    [
      'a free slots warning without numbers',
      withWarning({ code: 'WORKLOAD_BELOW_SLOTS', course: ref('x') }),
    ],
    [
      'a free slots warning among the blocking problems',
      withBlocking({ code: 'WORKLOAD_BELOW_SLOTS', course: ref('x'), assigned: 1, available: 2 }),
    ],
    [
      'a subject issue without subject',
      withBlocking({ code: 'SUBJECT_DOES_NOT_FIT', course: ref('x') }),
    ],
    [
      'a professor issue without class',
      withBlocking({
        code: 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
        course: ref('x'),
        subject: ref('y'),
        professor,
      }),
    ],
    [
      'a classes issue without classes',
      withBlocking({
        code: 'CLASSES_WITHOUT_PROFESSOR',
        course: ref('x'),
        subject: ref('y'),
        missingCount: 1,
      }),
    ],
    [
      'a classes issue with an empty list',
      withBlocking({
        code: 'CLASSES_WITHOUT_PROFESSOR',
        course: ref('x'),
        subject: ref('y'),
        classes: [],
        missingCount: 1,
      }),
    ],
    [
      'a classes issue with nothing missing',
      withBlocking({
        code: 'CLASSES_WITHOUT_PROFESSOR',
        course: ref('x'),
        subject: ref('y'),
        classes: [ref('B')],
        missingCount: 0,
      }),
    ],
    [
      'a professor issue with a professor that is not valid',
      withBlocking({ code: 'EXCEEDS_MAX_HOURS', professor: { id: 'x' } }),
    ],
    ['a professor issue without professor', withBlocking({ code: 'EXCEEDS_MAX_HOURS' })],
    [
      'an availability issue without calendar',
      withBlocking({ code: 'AVAILABILITY_INSUFFICIENT', professor, sessions: 2, available: 1 }),
    ],
    [
      'an availability issue without numbers',
      withBlocking({ code: 'AVAILABILITY_INSUFFICIENT', professor, calendar: ref('x') }),
    ],
    [
      'an inactive issue without courses',
      withWarning({ code: 'SUBJECT_INACTIVE', subject: ref('x') }),
    ],
    [
      'an inactive issue with an empty list of courses',
      withWarning({ code: 'SUBJECT_INACTIVE', subject: ref('x'), courses: [] }),
    ],
    [
      'a several-calendars issue with one calendar',
      withWarning({ code: 'SEVERAL_CALENDARS', professor, count: 1 }),
    ],
    [
      'a slots issue without count',
      withWarning({ code: 'SLOTS_OUTSIDE_CALENDAR', course: ref('x'), subject: ref('y') }),
    ],
    [
      'a slots issue with zero cells',
      withWarning({
        code: 'PREFERRED_SLOTS_FORBIDDEN',
        course: ref('x'),
        subject: ref('y'),
        count: 0,
      }),
    ],
  ])('is unavailable on %s', async (_name, response) => {
    expect(await scheduleReadinessService.get(clientReturning(response))).toEqual({
      status: 'unavailable',
    });
  });
});
