import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { coursesService } from './coursesService';

type Course = components['schemas']['Course'];

const courses: Course[] = [
  {
    id: '0192f5a0-0000-7000-8000-0000000000d1',
    name: '1º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    classes: [
      { id: '0192f5a0-0000-7000-8000-0000000000e1', name: 'A', tutor: null },
      { id: '0192f5a0-0000-7000-8000-0000000000e2', name: 'B', tutor: null },
    ],
  },
];
const course = courses[0] as Course;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, details?: unknown) {
  return { success: false, error: { code, message: 'mensaje técnico', details } };
}

/** Cliente autenticado simulado que responde con `response` o falla con `error`. */
function clientReturning(response: Response | Error) {
  return vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('coursesService.list', () => {
  it('asks for GET /api/courses through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { courses } }));

    await coursesService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/courses');
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('returns the courses with a 200', async () => {
    const outcome = await coursesService.list(
      clientReturning(jsonResponse(200, { success: true, data: { courses } })),
    );

    expect(outcome).toEqual({ status: 'loaded', courses });
  });

  it('returns an empty list with a 200 and no courses', async () => {
    const outcome = await coursesService.list(
      clientReturning(jsonResponse(200, { success: true, data: { courses: [] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', courses: [] });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await coursesService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without the courses', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a course without classes',
      jsonResponse(200, { success: true, data: { courses: [{ id: 'x', name: 'y' }] } }),
    ],
    [
      'a 200 with a class with a tutor',
      jsonResponse(200, {
        success: true,
        data: {
          courses: [{ id: 'x', name: 'y', classes: [{ id: 'z', name: 'A', tutor: 'Ana' }] }],
        },
      }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(coursesService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

/** Un curso con una fecha de creación que no cumple el contrato. */
const COURSES_WITH_A_BAD_DATE: [string, Record<string, unknown>][] = [
  ['without createdAt', { id: 'x', name: 'y', classes: [] }],
  ['with a createdAt that is not text', { id: 'x', name: 'y', createdAt: 5, classes: [] }],
  ['with a createdAt that is not a date', { id: 'x', name: 'y', createdAt: 'ayer', classes: [] }],
];

describe('coursesService.list: creation date of every course', () => {
  it.each(COURSES_WITH_A_BAD_DATE)('returns unavailable with a course %s', async (_name, bad) => {
    const outcome = await coursesService.list(
      clientReturning(jsonResponse(200, { success: true, data: { courses: [bad] } })),
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('keeps the creation date of every course it returns', async () => {
    const outcome = await coursesService.list(
      clientReturning(jsonResponse(200, { success: true, data: { courses } })),
    );

    expect(outcome.status === 'loaded' && outcome.courses[0]?.createdAt).toBe(
      '2026-10-19T09:30:00.000Z',
    );
  });
});

describe('coursesService.create: creation date of the course', () => {
  it.each(COURSES_WITH_A_BAD_DATE)('returns unavailable with a 201 %s', async (_name, bad) => {
    const outcome = await coursesService.create(
      clientReturning(jsonResponse(201, { success: true, data: { course: bad } })),
      { name: 'y', classNames: ['A'] },
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('keeps the creation date of the created course', async () => {
    const outcome = await coursesService.create(
      clientReturning(jsonResponse(201, { success: true, data: { course } })),
      { name: '1º Primaria', classNames: ['A', 'B'] },
    );

    expect(outcome.status === 'created' && outcome.course.createdAt).toBe(
      '2026-10-19T09:30:00.000Z',
    );
  });
});

describe('coursesService.create', () => {
  const input = { name: '1º Primaria', classNames: ['A', 'B'] };

  it('sends POST /api/courses with the name and the classes as JSON through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { course } }));

    await coursesService.create(client, input);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/courses');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({
      name: '1º Primaria',
      classes: [{ name: 'A' }, { name: 'B' }],
    });
  });

  it('returns created with the course with a 201', async () => {
    const outcome = await coursesService.create(
      clientReturning(jsonResponse(201, { success: true, data: { course } })),
      input,
    );

    expect(outcome).toEqual({ status: 'created', course });
  });

  it('returns validationError with the fields of a 400 VALIDATION_ERROR', async () => {
    const details = [
      { field: 'name', code: 'REQUIRED' },
      { field: 'classes[1].name', code: 'DUPLICATE' },
    ];

    const outcome = await coursesService.create(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it('returns unavailable with a 400 whose details are missing or malformed', async () => {
    for (const details of [undefined, 'x', [{ field: 5 }]]) {
      const outcome = await coursesService.create(
        clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
        input,
      );

      expect(outcome).toEqual({ status: 'unavailable' });
    }
  });

  it('returns alreadyExists with a 409 COURSE_ALREADY_EXISTS', async () => {
    const outcome = await coursesService.create(
      clientReturning(jsonResponse(409, errorBody('COURSE_ALREADY_EXISTS'))),
      input,
    );

    expect(outcome).toEqual({ status: 'alreadyExists' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await coursesService.create(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      input,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 409 with another code', jsonResponse(409, errorBody('USER_NOT_ACTIVE'))],
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 201 without the course', jsonResponse(201, { success: true, data: {} })],
    ['a 201 that is not JSON', new Response('<html>', { status: 201 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(coursesService.create(clientReturning(response), input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('coursesService.get', () => {
  const id = course.id;

  it('asks for GET /api/courses/{id} through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { course } }));

    await coursesService.get(client, id);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/courses/${id}`);
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('encodes an id that comes from the address bar', async () => {
    const client = clientReturning(jsonResponse(404, errorBody('NOT_FOUND')));

    await coursesService.get(client, '../users?x=1');

    expect(client.mock.calls[0]?.[0]).toBe('/api/courses/..%2Fusers%3Fx%3D1');
  });

  it('returns the course with a 200', async () => {
    const outcome = await coursesService.get(
      clientReturning(jsonResponse(200, { success: true, data: { course } })),
      id,
    );

    expect(outcome).toEqual({ status: 'loaded', course });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await coursesService.get(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      id,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await coursesService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      id,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without the course', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a course without creation date',
      jsonResponse(200, { success: true, data: { course: { ...course, createdAt: undefined } } }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(coursesService.get(clientReturning(response), id)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('coursesService.update', () => {
  const id = course.id;
  const classA = course.classes[0]?.id ?? '';
  const input = {
    name: '1º Primaria Tarde',
    classes: [{ id: classA, name: 'Grupo A' }, { name: 'C' }],
  };

  it('sends PUT /api/courses/{id} with the name and the classes as JSON, with the id only where there is one', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { course } }));

    await coursesService.update(client, id, input);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/courses/${id}`);
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({
      name: '1º Primaria Tarde',
      classes: [{ id: classA, name: 'Grupo A' }, { name: 'C' }],
    });
  });

  it('returns updated with the course with a 200', async () => {
    const outcome = await coursesService.update(
      clientReturning(jsonResponse(200, { success: true, data: { course } })),
      id,
      input,
    );

    expect(outcome).toEqual({ status: 'updated', course });
  });

  it('returns validationError with the fields of a 400 VALIDATION_ERROR', async () => {
    const details = [
      { field: 'name', code: 'REQUIRED' },
      { field: 'classes[1].name', code: 'DUPLICATE' },
    ];

    const outcome = await coursesService.update(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
      id,
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it('returns unavailable with a 400 whose details are missing or malformed', async () => {
    for (const details of [undefined, 'x', [{ field: 5 }]]) {
      const outcome = await coursesService.update(
        clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
        id,
        input,
      );

      expect(outcome).toEqual({ status: 'unavailable' });
    }
  });

  it('returns alreadyExists with a 409 COURSE_ALREADY_EXISTS', async () => {
    const outcome = await coursesService.update(
      clientReturning(jsonResponse(409, errorBody('COURSE_ALREADY_EXISTS'))),
      id,
      input,
    );

    expect(outcome).toEqual({ status: 'alreadyExists' });
  });

  it('returns courseChanged with a 409 COURSE_CHANGED', async () => {
    const outcome = await coursesService.update(
      clientReturning(jsonResponse(409, errorBody('COURSE_CHANGED'))),
      id,
      input,
    );

    expect(outcome).toEqual({ status: 'courseChanged' });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await coursesService.update(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      id,
      input,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await coursesService.update(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      id,
      input,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 409 with another code', jsonResponse(409, errorBody('USER_NOT_ACTIVE'))],
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without the course', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(coursesService.update(clientReturning(response), id, input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('coursesService.getImpact', () => {
  const id = course.id;
  const impact = { classCount: 3, studentCount: 0 };

  it('asks for GET /api/courses/{id}/impact through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { impact } }));

    await coursesService.getImpact(client, id);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/courses/${id}/impact`);
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('encodes an id that comes from the page', async () => {
    const client = clientReturning(jsonResponse(404, errorBody('NOT_FOUND')));

    await coursesService.getImpact(client, '../users?x=1');

    expect(client.mock.calls[0]?.[0]).toBe('/api/courses/..%2Fusers%3Fx%3D1/impact');
  });

  it('returns the impact with a 200', async () => {
    const outcome = await coursesService.getImpact(
      clientReturning(jsonResponse(200, { success: true, data: { impact } })),
      id,
    );

    expect(outcome).toEqual({ status: 'loaded', impact });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await coursesService.getImpact(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      id,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await coursesService.getImpact(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      id,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without the impact', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a negative count',
      jsonResponse(200, {
        success: true,
        data: { impact: { classCount: -1, studentCount: 0 } },
      }),
    ],
    [
      'a 200 with a count that is not an integer',
      jsonResponse(200, {
        success: true,
        data: { impact: { classCount: 1.5, studentCount: 0 } },
      }),
    ],
    [
      'a 200 without the student count',
      jsonResponse(200, { success: true, data: { impact: { classCount: 3 } } }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(coursesService.getImpact(clientReturning(response), id)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('coursesService.delete', () => {
  const id = course.id;
  const deleted = { classCount: 2, studentCount: 5 };

  it('sends DELETE /api/courses/{id} through the authenticated client, with no body', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { deleted } }));

    await coursesService.delete(client, id);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe(`/api/courses/${id}`);
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });

  it('encodes an id that comes from the page', async () => {
    const client = clientReturning(jsonResponse(404, errorBody('NOT_FOUND')));

    await coursesService.delete(client, '../users?x=1');

    expect(client.mock.calls[0]?.[0]).toBe('/api/courses/..%2Fusers%3Fx%3D1');
  });

  it('returns what was deleted with a 200', async () => {
    const outcome = await coursesService.delete(
      clientReturning(jsonResponse(200, { success: true, data: { deleted } })),
      id,
    );

    expect(outcome).toEqual({ status: 'deleted', deleted });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await coursesService.delete(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      id,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await coursesService.delete(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      id,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without what was deleted', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a malformed count',
      jsonResponse(200, {
        success: true,
        data: { deleted: { classCount: '2', studentCount: 0 } },
      }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(coursesService.delete(clientReturning(response), id)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
