import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { subjectsService, type CreateSubjectInput } from './subjectsService';

type Subject = components['schemas']['Subject'];

const subject: Subject = {
  id: '0192f5a0-0000-7000-8000-0000000000e1',
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: 'Lengua extranjera',
  color: 'blue',
  createdAt: '2026-10-26T09:30:00.000Z',
  courses: [
    { id: '0192f5a0-0000-7000-8000-0000000000d1', name: '1º Primaria', sessionsPerWeek: 3 },
  ],
};

const input: CreateSubjectInput = {
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: 'Lengua extranjera',
  color: 'blue',
  courses: [{ courseId: '0192f5a0-0000-7000-8000-0000000000d1', sessionsPerWeek: 3 }],
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

describe('subjectsService.list', () => {
  it('asks for GET /api/subjects through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { subjects: [] } }));

    await subjectsService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/subjects');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the subjects with their courses and sessions', async () => {
    const outcome = await subjectsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { subjects: [subject] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', subjects: [subject] });
  });

  it('returns a subject without code, without description and without courses', async () => {
    const bare: Subject = { ...subject, code: null, description: null, courses: [] };

    const outcome = await subjectsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { subjects: [bare] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', subjects: [bare] });
  });

  it('returns an empty list', async () => {
    const outcome = await subjectsService.list(
      clientReturning(jsonResponse(200, { success: true, data: { subjects: [] } })),
    );

    expect(outcome).toEqual({ status: 'loaded', subjects: [] });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await subjectsService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  const withSubject = (changes: Record<string, unknown>) =>
    jsonResponse(200, { success: true, data: { subjects: [{ ...subject, ...changes }] } });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without subjects', jsonResponse(200, { success: true, data: {} })],
    ['a subject without courses', withSubject({ courses: undefined })],
    ['a subject with a type that does not exist', withSubject({ type: 'OTHER' })],
    ['a subject with a status that does not exist', withSubject({ status: 'ARCHIVED' })],
    ['a subject with a color outside the palette', withSubject({ color: 'magenta' })],
    ['a subject whose code is not text or null', withSubject({ code: 5 })],
    ['a subject whose description is not text or null', withSubject({ description: 5 })],
    ['a subject without code property', withSubject({ code: undefined })],
    ['a course without name', withSubject({ courses: [{ id: 'x', sessionsPerWeek: 2 }] })],
    [
      'a course with 0 sessions',
      withSubject({ courses: [{ id: 'x', name: 'A', sessionsPerWeek: 0 }] }),
    ],
    [
      'a course with 6 sessions',
      withSubject({ courses: [{ id: 'x', name: 'A', sessionsPerWeek: 6 }] }),
    ],
    [
      'a course with half a session',
      withSubject({ courses: [{ id: 'x', name: 'A', sessionsPerWeek: 2.5 }] }),
    ],
    ['a creation date that is not a date', withSubject({ createdAt: 'ayer' })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(subjectsService.list(clientReturning(response))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('subjectsService.create', () => {
  it('sends POST /api/subjects with a JSON body through the authenticated client', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { subject } }));

    await subjectsService.create(client, input);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/subjects');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual(input);
  });

  it('sends exactly what the form decides, whatever else the input carries', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { subject } }));

    await subjectsService.create(client, { ...input, schoolId: 'otro' } as CreateSubjectInput);

    expect(Object.keys(sentBody(client.mock.calls[0]?.[1]) as object).sort()).toEqual([
      'code',
      'color',
      'courses',
      'description',
      'name',
      'status',
      'type',
    ]);
  });

  it('sends a missing code and description as null', async () => {
    const client = clientReturning(jsonResponse(201, { success: true, data: { subject } }));

    await subjectsService.create(client, { ...input, code: null, description: null });

    expect(sentBody(client.mock.calls[0]?.[1])).toMatchObject({ code: null, description: null });
  });

  it('returns the created subject', async () => {
    const outcome = await subjectsService.create(
      clientReturning(jsonResponse(201, { success: true, data: { subject } })),
      input,
    );

    expect(outcome).toEqual({ status: 'created', subject });
  });

  it('returns the invalid fields of a 400 VALIDATION_ERROR, also OUT_OF_RANGE and NOT_FOUND', async () => {
    const details = [
      { field: 'name', code: 'REQUIRED' },
      { field: 'code', code: 'INVALID_LENGTH' },
      { field: 'color', code: 'INVALID_FORMAT' },
      { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
      { field: 'courses[1].courseId', code: 'NOT_FOUND' },
      { field: 'courses[2].courseId', code: 'DUPLICATE' },
    ];

    const outcome = await subjectsService.create(
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

  it('returns alreadyExists on a 409 SUBJECT_ALREADY_EXISTS', async () => {
    const outcome = await subjectsService.create(
      clientReturning(jsonResponse(409, errorBody('SUBJECT_ALREADY_EXISTS'))),
      input,
    );

    expect(outcome).toEqual({ status: 'alreadyExists' });
  });

  it('returns codeAlreadyExists on a 409 SUBJECT_CODE_ALREADY_EXISTS', async () => {
    const outcome = await subjectsService.create(
      clientReturning(jsonResponse(409, errorBody('SUBJECT_CODE_ALREADY_EXISTS'))),
      input,
    );

    expect(outcome).toEqual({ status: 'codeAlreadyExists' });
  });

  it('returns forbidden on a 403 FORBIDDEN', async () => {
    const outcome = await subjectsService.create(
      clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
      input,
    );

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await subjectsService.create(
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
    ['a 409 with another code', jsonResponse(409, errorBody('CALENDAR_ALREADY_EXISTS'))],
    ['a 201 without subject', jsonResponse(201, { success: true, data: {} })],
    [
      'a 201 with a subject that is not valid',
      jsonResponse(201, { success: true, data: { subject: { ...subject, color: 'magenta' } } }),
    ],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(subjectsService.create(clientReturning(response), input)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('subjectsService.get', () => {
  it('asks for GET /api/subjects/{id} through the authenticated client, encoding the id', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { subject } }));

    await subjectsService.get(client, 'a/b?c');

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/subjects/a%2Fb%3Fc');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the subject with its courses and sessions', async () => {
    const outcome = await subjectsService.get(
      clientReturning(jsonResponse(200, { success: true, data: { subject } })),
      subject.id,
    );

    expect(outcome).toEqual({ status: 'loaded', subject });
  });

  it('returns a subject without code, without description and without courses', async () => {
    const bare = { ...subject, code: null, description: null, courses: [] };

    const outcome = await subjectsService.get(
      clientReturning(jsonResponse(200, { success: true, data: { subject: bare } })),
      subject.id,
    );

    expect(outcome).toEqual({ status: 'loaded', subject: bare });
  });

  it('is notFound on 404', async () => {
    const outcome = await subjectsService.get(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      subject.id,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await subjectsService.get(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      subject.id,
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without subject', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a subject that is not valid',
      jsonResponse(200, { success: true, data: { subject: { ...subject, color: 'magenta' } } }),
    ],
    [
      'a 200 with a list instead of a subject',
      jsonResponse(200, { success: true, data: { subject: [subject] } }),
    ],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(subjectsService.get(clientReturning(response), subject.id)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('subjectsService.update', () => {
  it('sends PUT /api/subjects/{id} with a JSON body through the authenticated client, encoding the id', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { subject } }));

    await subjectsService.update(client, 'a/b?c', input);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/subjects/a%2Fb%3Fc');
    const init = client.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(init)).toEqual(input);
  });

  it('sends exactly what the form decides, whatever else the input carries', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { subject } }));

    await subjectsService.update(client, subject.id, {
      ...input,
      schoolId: 'otro-colegio',
      id: 'otro-id',
    } as CreateSubjectInput);

    expect(Object.keys(sentBody(client.mock.calls[0]?.[1]) as object).sort()).toEqual([
      'code',
      'color',
      'courses',
      'description',
      'name',
      'status',
      'type',
    ]);
  });

  it('sends a removed code and description as null', async () => {
    const client = clientReturning(jsonResponse(200, { success: true, data: { subject } }));

    await subjectsService.update(client, subject.id, { ...input, code: null, description: null });

    expect(sentBody(client.mock.calls[0]?.[1])).toMatchObject({ code: null, description: null });
  });

  it('returns the saved subject', async () => {
    const outcome = await subjectsService.update(
      clientReturning(jsonResponse(200, { success: true, data: { subject } })),
      subject.id,
      input,
    );

    expect(outcome).toEqual({ status: 'updated', subject });
  });

  it('returns the invalid fields of a 400 VALIDATION_ERROR, also OUT_OF_RANGE and NOT_FOUND', async () => {
    const details = [
      { field: 'name', code: 'REQUIRED' },
      { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
      { field: 'courses[1].courseId', code: 'NOT_FOUND' },
    ];

    const outcome = await subjectsService.update(
      clientReturning(
        jsonResponse(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'x', details },
        }),
      ),
      subject.id,
      input,
    );

    expect(outcome).toEqual({ status: 'validationError', details });
  });

  it('returns alreadyExists on a 409 SUBJECT_ALREADY_EXISTS', async () => {
    const outcome = await subjectsService.update(
      clientReturning(jsonResponse(409, errorBody('SUBJECT_ALREADY_EXISTS'))),
      subject.id,
      input,
    );

    expect(outcome).toEqual({ status: 'alreadyExists' });
  });

  it('returns codeAlreadyExists on a 409 SUBJECT_CODE_ALREADY_EXISTS', async () => {
    const outcome = await subjectsService.update(
      clientReturning(jsonResponse(409, errorBody('SUBJECT_CODE_ALREADY_EXISTS'))),
      subject.id,
      input,
    );

    expect(outcome).toEqual({ status: 'codeAlreadyExists' });
  });

  it('returns notFound on a 404', async () => {
    const outcome = await subjectsService.update(
      clientReturning(jsonResponse(404, errorBody('NOT_FOUND'))),
      subject.id,
      input,
    );

    expect(outcome).toEqual({ status: 'notFound' });
  });

  it('returns forbidden on a 403 FORBIDDEN', async () => {
    const outcome = await subjectsService.update(
      clientReturning(jsonResponse(403, errorBody('FORBIDDEN'))),
      subject.id,
      input,
    );

    expect(outcome).toEqual({ status: 'forbidden' });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await subjectsService.update(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      subject.id,
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
    ['a 409 with another code', jsonResponse(409, errorBody('CALENDAR_ALREADY_EXISTS'))],
    ['a 403 with another code', jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED'))],
    ['a 200 without subject', jsonResponse(200, { success: true, data: {} })],
    [
      'a 200 with a subject that is not valid',
      jsonResponse(200, { success: true, data: { subject: { ...subject, status: 'ARCHIVED' } } }),
    ],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is unavailable on %s', async (_name, response) => {
    await expect(
      subjectsService.update(clientReturning(response), subject.id, input),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
