import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { courseAssignmentsService } from './courseAssignmentsService';

type Matrix = components['schemas']['CourseAssignments'];

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';

const matrix: Matrix = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  subjects: [
    {
      id: 's1',
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
    },
    {
      id: 's2',
      name: 'Lengua',
      code: null,
      color: 'green',
      status: 'INACTIVE',
      sessionsPerWeek: 5,
    },
  ],
  classes: [
    { id: 'c1', name: 'A', tutor: { id: 'p1', firstName: 'Ana', lastName: 'García' } },
    { id: 'c2', name: 'B', tutor: null },
  ],
  assignments: [{ subjectId: 's1', classId: 'c1', professorId: 'p1' }],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ok = (value: unknown) => jsonResponse(200, { success: true, data: { assignments: value } });
const errorBody = (code: string, details?: unknown) => ({
  success: false,
  error: { code, message: 'x', details },
});

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('courseAssignmentsService.get', () => {
  it('asks for GET /api/courses/{id}/assignments through the authenticated client', async () => {
    const client = clientReturning(ok(matrix));

    await courseAssignmentsService.get(client, COURSE_ID);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/courses/${COURSE_ID}/assignments`);
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('encodes the id', async () => {
    const client = clientReturning(ok(matrix));

    await courseAssignmentsService.get(client, 'a/b?c');

    expect(client.mock.calls[0]?.[0]).toBe('/api/courses/a%2Fb%3Fc/assignments');
  });

  it('returns the matrix as it comes', async () => {
    expect(await courseAssignmentsService.get(clientReturning(ok(matrix)), COURSE_ID)).toEqual({
      status: 'loaded',
      assignments: matrix,
    });
  });

  it('returns a course without subjects, classes or assignments', async () => {
    const empty = { ...matrix, subjects: [], classes: [], assignments: [] };

    expect(await courseAssignmentsService.get(clientReturning(ok(empty)), COURSE_ID)).toEqual({
      status: 'loaded',
      assignments: empty,
    });
  });

  it('is unauthenticated on 401 and notFound on 404', async () => {
    expect(
      await courseAssignmentsService.get(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
        COURSE_ID,
      ),
    ).toEqual({ status: 'unauthenticated' });
    expect(
      await courseAssignmentsService.get(
        clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
        COURSE_ID,
      ),
    ).toEqual({ status: 'notFound' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without assignments', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a matrix without course', ok({ ...matrix, course: undefined })],
    ['a course without name', ok({ ...matrix, course: { id: 'x' } })],
    ['a matrix without subjects', ok({ ...matrix, subjects: undefined })],
    [
      'a subject with a color outside the palette',
      ok({ ...matrix, subjects: [{ ...matrix.subjects[0], color: 'magenta' }] }),
    ],
    [
      'a subject with a status that does not exist',
      ok({ ...matrix, subjects: [{ ...matrix.subjects[0], status: 'ARCHIVED' }] }),
    ],
    [
      'a subject with sessions out of range',
      ok({ ...matrix, subjects: [{ ...matrix.subjects[0], sessionsPerWeek: 0 }] }),
    ],
    [
      'a subject whose code is not text or null',
      ok({ ...matrix, subjects: [{ ...matrix.subjects[0], code: 5 }] }),
    ],
    ['a class without name', ok({ ...matrix, classes: [{ id: 'c1', tutor: null }] })],
    [
      'a class whose tutor is not an object or null',
      ok({ ...matrix, classes: [{ id: 'c1', name: 'A', tutor: 'Ana' }] }),
    ],
    [
      'a tutor without last name',
      ok({ ...matrix, classes: [{ id: 'c1', name: 'A', tutor: { id: 'p', firstName: 'Ana' } }] }),
    ],
    ['a class without tutor property', ok({ ...matrix, classes: [{ id: 'c1', name: 'A' }] })],
    ['a matrix without assignments', ok({ ...matrix, assignments: undefined })],
    [
      'an assignment without professor',
      ok({ ...matrix, assignments: [{ subjectId: 's1', classId: 'c1' }] }),
    ],
    ['an assignment that is not an object', ok({ ...matrix, assignments: ['x'] })],
  ])('is unavailable on %s', async (_name, response) => {
    expect(await courseAssignmentsService.get(clientReturning(response), COURSE_ID)).toEqual({
      status: 'unavailable',
    });
  });

  it('is unavailable when the request fails', async () => {
    expect(
      await courseAssignmentsService.get(clientReturning(new Error('network')), COURSE_ID),
    ).toEqual({ status: 'unavailable' });
  });
});

describe('courseAssignmentsService.update', () => {
  const assignments = matrix.assignments;

  it('sends PUT with the final state and nothing else', async () => {
    const client = clientReturning(ok(matrix));

    await courseAssignmentsService.update(client, COURSE_ID, [
      {
        subjectId: 's1',
        classId: 'c1',
        professorId: 'p1',
        extra: 'x',
      } as unknown as (typeof assignments)[number],
    ]);

    const [url, init] = client.mock.calls[0] ?? [];
    expect(url).toBe(`/api/courses/${COURSE_ID}/assignments`);
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({
      assignments: [{ subjectId: 's1', classId: 'c1', professorId: 'p1' }],
    });
  });

  it('sends an empty list to leave everything unassigned', async () => {
    const client = clientReturning(ok(matrix));

    await courseAssignmentsService.update(client, COURSE_ID, []);

    expect(JSON.parse(client.mock.calls[0]?.[1]?.body as string)).toEqual({ assignments: [] });
  });

  it('returns what the server stored', async () => {
    expect(
      await courseAssignmentsService.update(clientReturning(ok(matrix)), COURSE_ID, assignments),
    ).toEqual({ status: 'updated', assignments: matrix });
  });

  it('returns the wrong fields of a 400', async () => {
    const details = [{ field: 'assignments[0].professorId', code: 'NOT_FOUND' }];

    expect(
      await courseAssignmentsService.update(
        clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
        COURSE_ID,
        assignments,
      ),
    ).toEqual({ status: 'validationError', details });
  });

  it.each([
    [
      'a 400 with details that are not fields',
      jsonResponse(400, errorBody('VALIDATION_ERROR', 'x')),
    ],
    ['a 400 of another code', jsonResponse(400, errorBody('OTHER'))],
    ['a 200 with a wrong shape', ok({ course: matrix.course })],
    ['a 403', jsonResponse(403, errorBody('FORBIDDEN'))],
    ['a 409', jsonResponse(409, errorBody('CONFLICT'))],
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
  ])('is unavailable on %s', async (_name, response) => {
    expect(
      await courseAssignmentsService.update(clientReturning(response), COURSE_ID, assignments),
    ).toEqual({ status: 'unavailable' });
  });

  it('is notFound on 404 and unauthenticated on 401', async () => {
    expect(
      await courseAssignmentsService.update(
        clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
        COURSE_ID,
        assignments,
      ),
    ).toEqual({ status: 'notFound' });
    expect(
      await courseAssignmentsService.update(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
        COURSE_ID,
        assignments,
      ),
    ).toEqual({ status: 'unauthenticated' });
  });

  it('is unavailable when the request fails', async () => {
    expect(
      await courseAssignmentsService.update(
        clientReturning(new Error('network')),
        COURSE_ID,
        assignments,
      ),
    ).toEqual({ status: 'unavailable' });
  });
});
