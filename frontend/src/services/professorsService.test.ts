import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { professorsService } from './professorsService';

type Professor = components['schemas']['Professor'];

const professors: Professor[] = [
  {
    id: '0192f5a0-0000-7000-8000-0000000000f1',
    firstName: 'Ana',
    lastName: 'García',
    position: 'JEFE_ESTUDIOS',
    subjects: [],
    tutoredClass: {
      id: '0192f5a0-0000-7000-8000-0000000000e1',
      name: 'A',
      courseId: '0192f5a0-0000-7000-8000-0000000000d1',
      courseName: '1º Primaria',
    },
  },
  {
    id: '0192f5a0-0000-7000-8000-0000000000f2',
    firstName: 'Luis',
    lastName: 'Pérez',
    position: null,
    subjects: [],
    tutoredClass: null,
  },
];
const professor = professors[0] as Professor;

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

describe('professorsService.list', () => {
  it('asks for GET /api/professors through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { professors } }));

    await professorsService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/professors');
    expect(client.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('returns the professors with their position, no subjects and class', async () => {
    const outcome = await professorsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { professors } })),
    );

    expect(outcome).toEqual({ status: 'loaded', professors });
  });

  it('returns an empty list with a 200 and no professors', async () => {
    const outcome = await professorsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { professors: [] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', professors: [] });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await professorsService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  const BAD_PROFESSORS: [string, Record<string, unknown>][] = [
    ['without id', { ...professor, id: undefined }],
    ['with a first name that is not text', { ...professor, firstName: 5 }],
    ['without last name', { ...professor, lastName: undefined }],
    ['with an unknown position', { ...professor, position: 'PORTERO' }],
    ['without position', { ...professor, position: undefined }],
    ['without subjects', { ...professor, subjects: undefined }],
    ['with subjects, which do not exist yet', { ...professor, subjects: ['Lengua'] }],
    ['without tutoredClass', { ...professor, tutoredClass: undefined }],
    ['with a tutoredClass that is a text', { ...professor, tutoredClass: 'A' }],
    [
      'with a tutoredClass without course name',
      { ...professor, tutoredClass: { id: 'x', name: 'A', courseId: 'y' } },
    ],
  ];

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without the professors', jsonResponse(200, { success: true, data: {} })],
    ...BAD_PROFESSORS.map(
      ([name, bad]) =>
        [
          `a 200 with a professor ${name}`,
          jsonResponse(200, { success: true, data: { professors: [bad] } }),
        ] as [string, Response],
    ),
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(professorsService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('professorsService.create', () => {
  const input = { firstName: 'Ana', lastName: 'García', position: 'JEFE_ESTUDIOS', classId: 'c-1' };

  it('sends POST /api/professors with a JSON body', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { professor } }));

    await professorsService.create(client, input);

    expect(client.mock.calls[0]?.[0]).toBe('/api/professors');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual({
      firstName: 'Ana',
      lastName: 'García',
      position: 'JEFE_ESTUDIOS',
      classId: 'c-1',
    });
  });

  it('leaves out the position and the class when they have no value', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { professor } }));

    await professorsService.create(client, {
      firstName: 'Ana',
      lastName: 'García',
      position: '',
      classId: '',
    });

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({
      firstName: 'Ana',
      lastName: 'García',
    });
  });

  it('returns the created professor with a 201', async () => {
    const outcome = await professorsService.create(
      clientReturning(jsonResponse(201, { success: true, data: { professor } })),
      input,
    );

    expect(outcome).toEqual({ status: 'created', professor });
  });

  it('returns validationError with the fields of a 400 VALIDATION_ERROR', async () => {
    const details = [
      { field: 'firstName', code: 'REQUIRED' },
      { field: 'classId', code: 'NOT_FOUND' },
    ];

    const outcome = await professorsService.create(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it.each([
    ['without details', errorBody('VALIDATION_ERROR')],
    ['with an unknown field code', errorBody('VALIDATION_ERROR', [{ field: 'x', code: 'RARO' }])],
  ])('returns unavailable with a 400 %s', async (_name, body) => {
    await expect(
      professorsService.create(clientReturning(jsonResponse(400, body)), input),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns classHasTutor with a 409 CLASS_ALREADY_HAS_TUTOR', async () => {
    const outcome = await professorsService.create(
      clientReturning(jsonResponse(409, errorBody('CLASS_ALREADY_HAS_TUTOR'))),
      input,
    );

    expect(outcome).toEqual({ status: 'classHasTutor' });
  });

  it('returns unavailable with a 409 of another code', async () => {
    const outcome = await professorsService.create(
      clientReturning(jsonResponse(409, errorBody('COURSE_CHANGED'))),
      input,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await professorsService.create(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      input,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 201 without the professor', jsonResponse(201, { success: true, data: {} })],
    [
      'a 201 with a malformed professor',
      jsonResponse(201, { success: true, data: { professor: { id: 'x' } } }),
    ],
    ['a 201 that is not JSON', new Response('<html>', { status: 201 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(professorsService.create(clientReturning(response), input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('professorsService.get', () => {
  const ID = '0192f5a0-0000-7000-8000-0000000000f1';

  it('asks for GET /api/professors/{id} with the id encoded', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { professor } }));

    await professorsService.get(client, 'a b/c');

    expect(client).toHaveBeenCalledExactlyOnceWith('/api/professors/a%20b%2Fc');
  });

  it('returns the professor with a 200', async () => {
    const outcome = await professorsService.get(
      clientReturning(jsonResponse(200, { success: true, data: { professor } })),
      ID,
    );

    expect(outcome).toEqual({ status: 'loaded', professor });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await professorsService.get(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      ID,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await professorsService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      ID,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without the professor', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a malformed professor',
      jsonResponse(200, { success: true, data: { professor: { id: 'x' } } }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(professorsService.get(clientReturning(response), ID)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('professorsService.update', () => {
  const ID = '0192f5a0-0000-7000-8000-0000000000f1';
  const input = { firstName: 'Ana', lastName: 'García', position: 'DIRECTOR', classId: 'c-1' };
  const replacedTutor = { id: 'p-2', firstName: 'Luis', lastName: 'Pérez' };
  const updatedBody = { success: true, data: { professor, replacedTutor: null } };

  it('sends PUT /api/professors/{id} with the final state as JSON', async () => {
    const client = clientReturning(jsonResponse(200, updatedBody));

    await professorsService.update(client, 'a b', input);

    expect(client.mock.calls[0]?.[0]).toBe('/api/professors/a%20b');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual({
      firstName: 'Ana',
      lastName: 'García',
      position: 'DIRECTOR',
      classId: 'c-1',
    });
  });

  it('sends null for no position and for no class', async () => {
    const client = clientReturning(jsonResponse(200, updatedBody));

    await professorsService.update(client, ID, { ...input, position: '', classId: '' });

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({
      firstName: 'Ana',
      lastName: 'García',
      position: null,
      classId: null,
    });
  });

  it('leaves classId out when it is not given, so the tutorship is not touched', async () => {
    const client = clientReturning(jsonResponse(200, updatedBody));

    await professorsService.update(client, ID, {
      firstName: 'Ana',
      lastName: 'García',
      position: 'DIRECTOR',
    });

    expect(sentBody(client.mock.calls[0]?.[1])).toEqual({
      firstName: 'Ana',
      lastName: 'García',
      position: 'DIRECTOR',
    });
  });

  it('returns the professor and no replaced tutor with a 200', async () => {
    const outcome = await professorsService.update(
      clientReturning(jsonResponse(200, updatedBody)),
      ID,
      input,
    );

    expect(outcome).toEqual({ status: 'updated', professor, replacedTutor: null });
  });

  it('returns the replaced tutor with a 200', async () => {
    const outcome = await professorsService.update(
      clientReturning(jsonResponse(200, { success: true, data: { professor, replacedTutor } })),
      ID,
      input,
    );

    expect(outcome).toEqual({ status: 'updated', professor, replacedTutor });
  });

  it('returns validationError with the fields of a 400 VALIDATION_ERROR', async () => {
    const details = [
      { field: 'firstName', code: 'REQUIRED' },
      { field: 'classId', code: 'NOT_FOUND' },
    ];

    const outcome = await professorsService.update(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR', details))),
      ID,
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await professorsService.update(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      ID,
      input,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await professorsService.update(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      ID,
      input,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 409 PROFESSOR_ALREADY_TUTOR', jsonResponse(409, errorBody('PROFESSOR_ALREADY_TUTOR'))],
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    [
      'a 400 without fields',
      jsonResponse(400, { success: false, error: { code: 'VALIDATION_ERROR' } }),
    ],
    ['a 200 without the professor', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a malformed replaced tutor',
      jsonResponse(200, {
        success: true,
        data: { professor, replacedTutor: { id: 'p-2' } },
      }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(professorsService.update(clientReturning(response), ID, input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('professorsService.delete', () => {
  const ID = '0192f5a0-0000-7000-8000-0000000000f1';
  const freedClass = { id: 'c-1', name: 'A', courseName: '1º Primaria' };

  it('sends DELETE /api/professors/{id} without a body, with the id encoded', async () => {
    const client = clientReturning(
      jsonResponse(200, { success: true, data: { deleted: { freedClass: null } } }),
    );

    await professorsService.delete(client, 'a b/c');

    expect(client.mock.calls[0]?.[0]).toBe('/api/professors/a%20b%2Fc');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });

  it('returns what was deleted, with the class that was left without tutor', async () => {
    const outcome = await professorsService.delete(
      clientReturning(jsonResponse(200, { success: true, data: { deleted: { freedClass } } })),
      ID,
    );

    expect(outcome).toEqual({ status: 'deleted', freedClass });
  });

  it('returns no freed class when the professor tutored none', async () => {
    const outcome = await professorsService.delete(
      clientReturning(
        jsonResponse(200, { success: true, data: { deleted: { freedClass: null } } }),
      ),
      ID,
    );

    expect(outcome).toEqual({ status: 'deleted', freedClass: null });
  });

  it('returns notFound with a 404', async () => {
    const outcome = await professorsService.delete(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      ID,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns unauthenticated with a 401', async () => {
    const outcome = await professorsService.delete(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      ID,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['a 503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['a 500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without deleted', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a malformed freed class',
      jsonResponse(200, { success: true, data: { deleted: { freedClass: { id: 'c-1' } } } }),
    ],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('returns unavailable with %s', async (_name, response) => {
    await expect(professorsService.delete(clientReturning(response), ID)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
