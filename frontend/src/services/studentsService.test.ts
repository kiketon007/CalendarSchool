import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { studentsService, type CreateStudentInput } from './studentsService';

type Student = components['schemas']['Student'];
type StudentSummary = components['schemas']['StudentSummary'];

const summaries: StudentSummary[] = [
  {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    firstName: 'Juan',
    lastName: 'García',
    course: { id: '0192f5a0-0000-7000-8000-0000000000d1', name: '1º Primaria' },
    class: { id: '0192f5a0-0000-7000-8000-0000000000e1', name: 'A' },
    cafeteria: true,
    scholarship: false,
  },
  {
    id: '0192f5a0-0000-7000-8000-0000000000a2',
    firstName: 'Ana',
    lastName: 'Álvarez',
    course: null,
    class: null,
    cafeteria: false,
    scholarship: null,
  },
];

const student: Student = {
  ...(summaries[0] as StudentSummary),
  foodType: 'Vegetariana',
  observations: 'Necesita apoyo',
};

const input: CreateStudentInput = {
  firstName: 'Juan',
  lastName: 'García',
  courseId: '0192f5a0-0000-7000-8000-0000000000d1',
  classId: '0192f5a0-0000-7000-8000-0000000000e1',
  cafeteria: true,
  scholarship: false,
  foodType: 'Vegetariana',
  observations: 'Necesita apoyo',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, details?: unknown) {
  return { success: false, error: { code, message: 'mensaje técnico', details } };
}

function clientReturning(response: Response | Error) {
  return vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

/** El cuerpo JSON que se envió en la petición. */
function sentBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
}

describe('studentsService.list', () => {
  it('asks for GET /api/students through the authenticated client', async () => {
    const client = clientReturning(
      jsonResponse(200, { success: true, data: { students: summaries } }),
    );

    await studentsService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/students');
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('returns the students with their course and class, which may be null', async () => {
    const outcome = await studentsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { students: summaries } })),
    );

    expect(outcome).toEqual({ status: 'loaded', students: summaries });
  });

  it('returns an empty list', async () => {
    const outcome = await studentsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { students: [] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', students: [] });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await studentsService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['403', jsonResponse(403, errorBody('FORBIDDEN'))],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(studentsService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it.each([
    ['without data', { success: true }],
    ['with something that is not a list', { success: true, data: { students: 'x' } }],
    ['with a student without id', { success: true, data: { students: [{ firstName: 'Ana' }] } }],
    [
      'with a course that is not null or { id, name }',
      { success: true, data: { students: [{ ...summaries[0], course: { id: 'c1' } }] } },
    ],
    [
      'with a class that is not null or { id, name }',
      { success: true, data: { students: [{ ...summaries[0], class: 'A' }] } },
    ],
    [
      'with a cafeteria that is not a boolean',
      { success: true, data: { students: [{ ...summaries[0], cafeteria: 'sí' }] } },
    ],
    [
      'with a scholarship that is not null or a boolean',
      { success: true, data: { students: [{ ...summaries[0], scholarship: 1 }] } },
    ],
  ])('is unavailable when the 200 body comes %s', async (_name, body) => {
    await expect(studentsService.list(clientReturning(jsonResponse(200, body)))).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('is unavailable when the body is not JSON', async () => {
    const response = new Response('<html>', { status: 200 });

    await expect(studentsService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('studentsService.create', () => {
  it('sends POST /api/students with a JSON body through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { student } }));

    await studentsService.create(client, input);

    expect(client).toHaveBeenCalledOnce();
    const [url, init] = client.mock.calls[0] ?? [];
    expect(url).toBe('/api/students');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(sentBody(init)).toEqual({
      firstName: 'Juan',
      lastName: 'García',
      courseId: '0192f5a0-0000-7000-8000-0000000000d1',
      classId: '0192f5a0-0000-7000-8000-0000000000e1',
      cafeteria: true,
      scholarship: false,
      foodType: 'Vegetariana',
      observations: 'Necesita apoyo',
    });
  });

  it('leaves out the class, the food type and the observations when they are empty', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { student } }));

    await studentsService.create(client, {
      ...input,
      classId: '',
      foodType: '',
      observations: '',
    });

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({
      firstName: 'Juan',
      lastName: 'García',
      courseId: '0192f5a0-0000-7000-8000-0000000000d1',
      cafeteria: true,
      scholarship: false,
    });
  });

  it('sends neither the scholarship nor the food type without cafeteria, even if they carry values', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { student } }));

    await studentsService.create(client, {
      ...input,
      cafeteria: false,
      scholarship: true,
      foodType: 'Sin gluten',
    });

    const body = sentBody(client.mock.calls[0]?.[1]) as Record<string, unknown>;
    expect(body.cafeteria).toBe(false);
    expect(body).not.toHaveProperty('scholarship');
    expect(body).not.toHaveProperty('foodType');
  });

  it('returns the created student, with its sensitive data', async () => {
    const outcome = await studentsService.create(
      clientReturning(jsonResponse(201, { success: true, data: { student } })),
      input,
    );

    expect(outcome).toEqual({ status: 'created', student });
  });

  it('returns the invalid fields of a 400 VALIDATION_ERROR, also NOT_FOUND and NOT_ALLOWED', async () => {
    const details = [
      { field: 'firstName', code: 'REQUIRED' },
      { field: 'courseId', code: 'NOT_FOUND' },
      { field: 'scholarship', code: 'NOT_ALLOWED' },
    ];

    const outcome = await studentsService.create(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it.each([
    ['without details', errorBody('VALIDATION_ERROR')],
    ['with an unknown field code', errorBody('VALIDATION_ERROR', [{ field: 'a', code: 'X' }])],
    ['with details that are not a list', errorBody('VALIDATION_ERROR', 'x')],
  ])('is unavailable on a 400 %s', async (_name, body) => {
    await expect(
      studentsService.create(clientReturning(jsonResponse(400, body)), input),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await studentsService.create(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      input,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 400 that is not a validation error', jsonResponse(400, errorBody('INVALID_JSON'))],
    ['a 201 without student', jsonResponse(201, { success: true, data: {} })],
    [
      'a 201 with a student without the sensitive fields',
      jsonResponse(201, { success: true, data: { student: summaries[0] } }),
    ],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(studentsService.create(clientReturning(response), input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
