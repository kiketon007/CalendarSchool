import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { scheduleGenerationService } from './scheduleGenerationService';

type Generation = components['schemas']['Generation'];

const GENERATION_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const CREATED_AT = '2026-11-04T08:00:00.000Z';

const score = {
  total: 12,
  preferredMisses: 1,
  preferredTotal: 6,
  professorGaps: 0,
  consecutiveDays: 2,
  initialTotal: 21,
};

const queued: Generation = {
  id: GENERATION_ID,
  status: 'QUEUED',
  progress: 0,
  placed: 0,
  total: 0,
  improve: true,
  phase: 'SEARCHING',
  engine: 'BACKTRACKING',
  score: null,
  improvementCancelled: false,
  errorCode: null,
  errorMessage: null,
  errorDetails: null,
  scheduleId: null,
  createdAt: CREATED_AT,
  startedAt: null,
  finishedAt: null,
};
const running: Generation = {
  ...queued,
  status: 'RUNNING',
  progress: 40,
  placed: 20,
  total: 50,
  startedAt: CREATED_AT,
};
const completed: Generation = {
  ...running,
  status: 'COMPLETED',
  progress: 100,
  placed: 50,
  scheduleId: '0192f5a0-0000-7000-8000-0000000000a1',
  finishedAt: CREATED_AT,
};
const improving: Generation = { ...running, placed: 50, progress: 100, phase: 'IMPROVING', score };
const improved: Generation = { ...completed, phase: 'IMPROVING', score };
const improvementStopped: Generation = { ...improved, improvementCancelled: true };
const notImproved: Generation = { ...completed, improve: false, score: { ...score, total: 21 } };
const cancelled: Generation = { ...running, status: 'CANCELLED', finishedAt: CREATED_AT };
const lesson = {
  course: { id: 'c1', name: '1º Primaria' },
  class: { id: 'k1', name: 'A' },
  subject: { id: 's1', name: 'Inglés' },
  professor: { id: 'p1', name: 'Eva García' },
};
const infeasible: Generation = {
  ...running,
  status: 'FAILED',
  errorCode: 'INFEASIBLE',
  errorMessage: 'No hay solución',
  errorDetails: { reason: 'PROFESSOR_BUSY', lesson },
  finishedAt: CREATED_AT,
};
const timeout: Generation = {
  ...running,
  status: 'FAILED',
  errorCode: 'TIMEOUT',
  errorMessage: 'Se agotó el tiempo',
  finishedAt: CREATED_AT,
};
const internal: Generation = {
  ...queued,
  status: 'FAILED',
  errorCode: 'INTERNAL',
  errorMessage: 'La generación se interrumpió',
  finishedAt: CREATED_AT,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });
const generationBody = (generation: unknown) => ({ success: true, data: { generation } });

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

/** Respuestas que ningún método debe aceptar como una generación válida. */
const malformedGenerations: [string, unknown][] = [
  ['without a body', undefined],
  ['a null generation', null],
  ['a status that does not exist', { ...queued, status: 'PAUSED' }],
  ['a progress above 100', { ...running, progress: 101 }],
  ['a negative progress', { ...running, progress: -1 }],
  ['an improve that is not a boolean', { ...running, improve: 'si' }],
  ['a missing improve', { ...running, improve: undefined }],
  ['a phase that does not exist', { ...running, phase: 'WAITING' }],
  ['a missing phase', { ...running, phase: undefined }],
  ['an engine that does not exist', { ...running, engine: 'GENETIC' }],
  ['a missing engine', { ...running, engine: undefined }],
  ['an engine in lower case', { ...running, engine: 'ortools' }],
  ['a score that is not a score', { ...running, score: { total: 3 } }],
  ['a score with a negative number', { ...running, score: { ...score, total: -1 } }],
  ['an improvementCancelled that is not a boolean', { ...running, improvementCancelled: 'no' }],
  ['a missing improvementCancelled', { ...running, improvementCancelled: undefined }],
  ['a fractional placed', { ...running, placed: 1.5 }],
  ['a total that is not a number', { ...running, total: '50' }],
  ['an error code that does not exist', { ...infeasible, errorCode: 'OTHER' }],
  ['an error code in a generation that did not fail', { ...running, errorCode: 'INTERNAL' }],
  ['a schedule in a generation that did not complete', { ...running, scheduleId: 'x' }],
  ['a missing created date', { ...queued, createdAt: undefined }],
  ['a created date that is not a date', { ...queued, createdAt: 'ayer' }],
  [
    'a reason that does not exist',
    { ...infeasible, errorDetails: { reason: 'OTHER', lesson: null } },
  ],
  [
    'a lesson without professor',
    {
      ...infeasible,
      errorDetails: { reason: 'CLASS_BUSY', lesson: { ...lesson, professor: undefined } },
    },
  ],
];

describe('scheduleGenerationService.start', () => {
  it('sends POST /api/schedule/generate through the authenticated client, improving by default', async () => {
    const client = clientReturning(jsonResponse(202, generationBody(queued)));

    await scheduleGenerationService.start(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/generate');
    expect(client.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(client.mock.calls[0]?.[1]?.body as string)).toEqual({ improve: true });
    expect(new Headers(client.mock.calls[0]?.[1]?.headers).get('Content-Type')).toBe(
      'application/json',
    );
  });

  it.each([true, false])(
    'sends the improve that was asked for (%s) as the body',
    async (improve) => {
      const client = clientReturning(jsonResponse(202, generationBody({ ...queued, improve })));

      const outcome = await scheduleGenerationService.start(client, { improve });

      expect(JSON.parse(client.mock.calls[0]?.[1]?.body as string)).toEqual({ improve });
      expect(outcome).toMatchObject({ status: 'started', generation: { improve } });
    },
  );

  it('is unavailable on a 400, which the screen never provokes with its own body', async () => {
    const outcome = await scheduleGenerationService.start(
      clientReturning(jsonResponse(400, errorBody('VALIDATION_ERROR'))),
      { improve: false },
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('is started with the generation on 202', async () => {
    const outcome = await scheduleGenerationService.start(
      clientReturning(jsonResponse(202, generationBody(queued))),
    );

    expect(outcome).toEqual({ status: 'started', generation: queued });
  });

  it.each<[string, Response, string]>([
    ['409 SCHEDULE_NOT_READY', jsonResponse(409, errorBody('SCHEDULE_NOT_READY')), 'notReady'],
    [
      '409 GENERATION_IN_PROGRESS',
      jsonResponse(409, errorBody('GENERATION_IN_PROGRESS')),
      'inProgress',
    ],
    ['403', jsonResponse(403, errorBody('FORBIDDEN')), 'forbidden'],
    ['401', jsonResponse(401, errorBody('INVALID_SESSION')), 'unauthenticated'],
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE')), 'unavailable'],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR')), 'unavailable'],
    ['409 with another code', jsonResponse(409, errorBody('OTHER')), 'unavailable'],
    ['409 that is not JSON', new Response('<html>', { status: 409 }), 'unavailable'],
  ])('answers %s with %s', async (_name, response, status) => {
    expect(await scheduleGenerationService.start(clientReturning(response))).toEqual({ status });
  });

  it('is unavailable when the request fails', async () => {
    expect(await scheduleGenerationService.start(clientReturning(new Error('offline')))).toEqual({
      status: 'unavailable',
    });
  });

  it.each(malformedGenerations)('is unavailable on a 202 with %s', async (_name, generation) => {
    const outcome = await scheduleGenerationService.start(
      clientReturning(jsonResponse(202, generationBody(generation))),
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('scheduleGenerationService.current', () => {
  it('asks for GET /api/schedule/generate', async () => {
    const client = clientReturning(jsonResponse(200, generationBody(null)));

    await scheduleGenerationService.current(client);

    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/generate');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it.each<[string, Generation]>([
    ['queued', queued],
    ['running', running],
    ['completed', completed],
    ['cancelled', cancelled],
    ['improving, with the score so far', improving],
    ['completed after improving', improved],
    ['completed with the improvement stopped', improvementStopped],
    ['completed without improving', notImproved],
    ['failed because it is infeasible', infeasible],
    ['failed because of the time limit', timeout],
    ['failed by an internal error', internal],
  ])('returns a generation that is %s as it comes', async (_name, generation) => {
    const outcome = await scheduleGenerationService.current(
      clientReturning(jsonResponse(200, generationBody(generation))),
    );

    expect(outcome).toEqual({ status: 'loaded', generation });
  });

  it('returns null when the school never generated', async () => {
    const outcome = await scheduleGenerationService.current(
      clientReturning(jsonResponse(200, generationBody(null))),
    );

    expect(outcome).toEqual({ status: 'loaded', generation: null });
  });

  it.each(['BACKTRACKING', 'ORTOOLS'] as const)(
    'accepts and keeps the engine of the generation (%s)',
    async (engine) => {
      const outcome = await scheduleGenerationService.current(
        clientReturning(jsonResponse(200, generationBody({ ...running, engine }))),
      );

      expect(outcome).toEqual({ status: 'loaded', generation: { ...running, engine } });
    },
  );

  it('accepts a failure without lesson', async () => {
    const generation: Generation = {
      ...infeasible,
      errorDetails: { reason: 'NO_FREE_CELLS', lesson: null },
    };

    const outcome = await scheduleGenerationService.current(
      clientReturning(jsonResponse(200, generationBody(generation))),
    );

    expect(outcome).toEqual({ status: 'loaded', generation });
  });

  it.each<[string, Response, string]>([
    ['401', jsonResponse(401, errorBody('INVALID_SESSION')), 'unauthenticated'],
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE')), 'unavailable'],
    ['a 200 without data', jsonResponse(200, { success: true }), 'unavailable'],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 }), 'unavailable'],
  ])('answers %s with %s', async (_name, response, status) => {
    expect(await scheduleGenerationService.current(clientReturning(response))).toEqual({ status });
  });

  it('is unavailable when the request fails', async () => {
    expect(await scheduleGenerationService.current(clientReturning(new Error('offline')))).toEqual({
      status: 'unavailable',
    });
  });

  it.each(malformedGenerations.filter(([, generation]) => generation !== null))(
    'is unavailable on a 200 with %s',
    async (_name, generation) => {
      const outcome = await scheduleGenerationService.current(
        clientReturning(jsonResponse(200, generationBody(generation))),
      );

      expect(outcome).toEqual({ status: 'unavailable' });
    },
  );
});

describe('scheduleGenerationService.get', () => {
  it('asks for GET /api/schedule/generate/{id} with the id encoded', async () => {
    const client = clientReturning(jsonResponse(200, generationBody(running)));

    await scheduleGenerationService.get(client, 'a/b?c');

    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/generate/a%2Fb%3Fc');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the generation as it comes', async () => {
    const outcome = await scheduleGenerationService.get(
      clientReturning(jsonResponse(200, generationBody(running))),
      GENERATION_ID,
    );

    expect(outcome).toEqual({ status: 'loaded', generation: running });
  });

  it.each<[string, Response, string]>([
    ['404', jsonResponse(404, errorBody('NOT_FOUND')), 'notFound'],
    ['401', jsonResponse(401, errorBody('INVALID_SESSION')), 'unauthenticated'],
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE')), 'unavailable'],
    ['a 200 with null', jsonResponse(200, generationBody(null)), 'unavailable'],
  ])('answers %s with %s', async (_name, response, status) => {
    expect(await scheduleGenerationService.get(clientReturning(response), GENERATION_ID)).toEqual({
      status,
    });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await scheduleGenerationService.get(
      clientReturning(new Error('offline')),
      GENERATION_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each(malformedGenerations)('is unavailable on a 200 with %s', async (_name, generation) => {
    const outcome = await scheduleGenerationService.get(
      clientReturning(jsonResponse(200, generationBody(generation))),
      GENERATION_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});

describe('scheduleGenerationService.cancel', () => {
  it('sends DELETE /api/schedule/generate/{id} with the id encoded', async () => {
    const client = clientReturning(jsonResponse(200, generationBody(cancelled)));

    await scheduleGenerationService.cancel(client, 'a/b');

    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/generate/a%2Fb');
    expect(client.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('returns the generation as the server left it, cancelled or still running', async () => {
    for (const generation of [cancelled, running]) {
      const outcome = await scheduleGenerationService.cancel(
        clientReturning(jsonResponse(200, generationBody(generation))),
        GENERATION_ID,
      );

      expect(outcome).toEqual({ status: 'loaded', generation });
    }
  });

  it.each<[string, Response, string]>([
    [
      '409 GENERATION_NOT_CANCELLABLE',
      jsonResponse(409, errorBody('GENERATION_NOT_CANCELLABLE')),
      'notCancellable',
    ],
    ['403', jsonResponse(403, errorBody('FORBIDDEN')), 'forbidden'],
    ['404', jsonResponse(404, errorBody('NOT_FOUND')), 'notFound'],
    ['401', jsonResponse(401, errorBody('INVALID_SESSION')), 'unauthenticated'],
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE')), 'unavailable'],
    ['409 with another code', jsonResponse(409, errorBody('OTHER')), 'unavailable'],
  ])('answers %s with %s', async (_name, response, status) => {
    expect(
      await scheduleGenerationService.cancel(clientReturning(response), GENERATION_ID),
    ).toEqual({ status });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await scheduleGenerationService.cancel(
      clientReturning(new Error('offline')),
      GENERATION_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('is unavailable on a 200 with a malformed generation', async () => {
    const outcome = await scheduleGenerationService.cancel(
      clientReturning(jsonResponse(200, generationBody({ ...running, status: 'PAUSED' }))),
      GENERATION_ID,
    );

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});
