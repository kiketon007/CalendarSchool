import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { GenerationView } from '../../application/schedule/generationView.js';
import {
  GenerationInProgress,
  GenerationNotCancellable,
  GenerationNotFound,
  ScheduleNotReady,
} from '../../domain/schedule/generationErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const USER_ID = 'user-1';
const GENERATION_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const CREATED_AT = new Date('2026-11-04T08:00:00.000Z');

const QUEUED: GenerationView = {
  id: GENERATION_ID,
  status: 'QUEUED',
  progress: 0,
  placed: 0,
  total: 0,
  errorCode: null,
  errorMessage: null,
  errorDetails: null,
  scheduleId: null,
  createdAt: CREATED_AT,
  startedAt: null,
  finishedAt: null,
};
const QUEUED_JSON = { ...QUEUED, createdAt: CREATED_AT.toISOString() };

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: USER_ID, schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('schedule generation routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let start: Mock<AppDependencies['startGeneration']['execute']>;
  let current: Mock<AppDependencies['getCurrentGeneration']['execute']>;
  let get: Mock<AppDependencies['getGeneration']['execute']>;
  let cancel: Mock<AppDependencies['cancelGeneration']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    start = vi.fn<AppDependencies['startGeneration']['execute']>().mockResolvedValue(QUEUED);
    current = vi.fn<AppDependencies['getCurrentGeneration']['execute']>().mockResolvedValue(QUEUED);
    get = vi.fn<AppDependencies['getGeneration']['execute']>().mockResolvedValue(QUEUED);
    cancel = vi.fn<AppDependencies['cancelGeneration']['execute']>().mockResolvedValue({
      ...QUEUED,
      status: 'CANCELLED',
      finishedAt: CREATED_AT,
    });
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      startGeneration: { execute: start },
      getCurrentGeneration: { execute: current },
      getGeneration: { execute: get },
      cancelGeneration: { execute: cancel },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorized = (call: request.Test) => call.set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/schedule/generate', () => {
    it('responds 202 with the generation, never cached', async () => {
      const response = await authorized(request(app).post('/api/schedule/generate'));

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ success: true, data: { generation: QUEUED_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('takes the school and the actor from the identity and ignores a body or query from the client', async () => {
      await authorized(request(app).post('/api/schedule/generate?schoolId=query-school')).send({
        schoolId: 'body-school',
        actorId: 'body-user',
      });

      expect(start).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID, actorId: USER_ID });
    });

    it('responds 403 to a member and does not start anything', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await authorized(request(app).post('/api/schedule/generate'));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      expect(start).not.toHaveBeenCalled();
    });

    it('responds 401 without a session', async () => {
      const response = await request(app).post('/api/schedule/generate');

      expect(response.status).toBe(401);
      expect(start).not.toHaveBeenCalled();
    });

    it('responds 409 SCHEDULE_NOT_READY when there are blockers', async () => {
      start.mockRejectedValue(new ScheduleNotReady());

      const response = await authorized(request(app).post('/api/schedule/generate'));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'SCHEDULE_NOT_READY' },
      });
    });

    it('responds 409 GENERATION_IN_PROGRESS when the school already has one', async () => {
      start.mockRejectedValue(new GenerationInProgress());

      const response = await authorized(request(app).post('/api/schedule/generate'));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'GENERATION_IN_PROGRESS' },
      });
    });

    it('responds 500 when the worker could not be launched', async () => {
      start.mockRejectedValue(new Error('AccessDeniedException'));

      const response = await authorized(request(app).post('/api/schedule/generate'));

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
    });

    it('responds 503 when the database is unavailable', async () => {
      start.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorized(request(app).post('/api/schedule/generate'));

      expect(response.status).toBe(503);
    });
  });

  describe('GET /api/schedule/generate', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the current generation to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorized(request(app).get('/api/schedule/generate'));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { generation: QUEUED_JSON } });
        expect(response.headers['cache-control']).toBe('no-store');
        expect(current).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
      },
    );

    it('responds null when the school never generated', async () => {
      current.mockResolvedValue(null);

      const response = await authorized(request(app).get('/api/schedule/generate'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { generation: null } });
    });

    it('responds 401 without a session', async () => {
      const response = await request(app).get('/api/schedule/generate');

      expect(response.status).toBe(401);
      expect(current).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/schedule/generate/{id}', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the generation to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorized(
          request(app).get(`/api/schedule/generate/${GENERATION_ID}`),
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { generation: QUEUED_JSON } });
        expect(response.headers['cache-control']).toBe('no-store');
        expect(get).toHaveBeenCalledExactlyOnceWith({
          schoolId: SCHOOL_ID,
          generationId: GENERATION_ID,
        });
      },
    );

    it('responds 404 to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorized(request(app).get('/api/schedule/generate/not-a-uuid'));

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(get).not.toHaveBeenCalled();
    });

    it('responds 404 when the generation is of another school or does not exist', async () => {
      get.mockRejectedValue(new GenerationNotFound());

      const response = await authorized(
        request(app).get(`/api/schedule/generate/${GENERATION_ID}`),
      );

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('responds 401 without a session', async () => {
      const response = await request(app).get(`/api/schedule/generate/${GENERATION_ID}`);

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/schedule/generate/{id}', () => {
    it('responds 200 with the generation, never cached', async () => {
      const response = await authorized(
        request(app).delete(`/api/schedule/generate/${GENERATION_ID}`),
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { generation: { id: GENERATION_ID, status: 'CANCELLED' } },
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(cancel).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: USER_ID,
        generationId: GENERATION_ID,
      });
    });

    it('responds 403 to a member and cancels nothing', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await authorized(
        request(app).delete(`/api/schedule/generate/${GENERATION_ID}`),
      );

      expect(response.status).toBe(403);
      expect(cancel).not.toHaveBeenCalled();
    });

    it('responds 404 to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorized(request(app).delete('/api/schedule/generate/not-a-uuid'));

      expect(response.status).toBe(404);
      expect(cancel).not.toHaveBeenCalled();
    });

    it('responds 404 when the generation is of another school', async () => {
      cancel.mockRejectedValue(new GenerationNotFound());

      const response = await authorized(
        request(app).delete(`/api/schedule/generate/${GENERATION_ID}`),
      );

      expect(response.status).toBe(404);
    });

    it('responds 409 GENERATION_NOT_CANCELLABLE when it already finished', async () => {
      cancel.mockRejectedValue(new GenerationNotCancellable());

      const response = await authorized(
        request(app).delete(`/api/schedule/generate/${GENERATION_ID}`),
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'GENERATION_NOT_CANCELLABLE' },
      });
    });

    it('responds 401 without a session', async () => {
      const response = await request(app).delete(`/api/schedule/generate/${GENERATION_ID}`);

      expect(response.status).toBe(401);
      expect(cancel).not.toHaveBeenCalled();
    });
  });
});
