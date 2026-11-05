import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { ScheduleDetailView } from '../../application/schedule/getSchedule.js';
import { ScheduleNotDraft, ScheduleNotFound } from '../../domain/schedule/scheduleErrors.js';
import type {
  StoredScheduleOverview,
  StoredScheduleSummary,
} from '../../domain/schedule/scheduleRead.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const SCHEDULE_ID = '0192f5a0-0000-7000-8000-0000000000a2';
const GENERATED_AT = new Date('2026-11-04T08:00:05.000Z');
const CONFIRMED_AT = new Date('2026-11-05T09:10:00.000Z');

const SUMMARY: StoredScheduleSummary = {
  id: SCHEDULE_ID,
  status: 'OFFICIAL',
  generatedAt: GENERATED_AT,
  placedSessions: 1,
  confirmedAt: CONFIRMED_AT,
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: null,
};
const SUMMARY_JSON = {
  ...SUMMARY,
  generatedAt: GENERATED_AT.toISOString(),
  confirmedAt: CONFIRMED_AT.toISOString(),
};
const OVERVIEW: StoredScheduleOverview = { draft: null, official: SUMMARY, previousCount: 2 };

const OFFICIAL: ScheduleDetailView = {
  ...SUMMARY,
  courses: [],
  subjects: [],
  professors: [],
  entries: [],
};
const OFFICIAL_JSON = {
  ...OFFICIAL,
  generatedAt: GENERATED_AT.toISOString(),
  confirmedAt: CONFIRMED_AT.toISOString(),
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('the schedule confirmation routes (US-ALGO-CONFIRM)', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getSchedule: Mock<AppDependencies['getSchedule']['execute']>;
  let getOverview: Mock<AppDependencies['getScheduleOverview']['execute']>;
  let confirm: Mock<AppDependencies['confirmSchedule']['execute']>;
  let discard: Mock<AppDependencies['discardScheduleDraft']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getSchedule = vi.fn<AppDependencies['getSchedule']['execute']>().mockResolvedValue(OFFICIAL);
    getOverview = vi
      .fn<AppDependencies['getScheduleOverview']['execute']>()
      .mockResolvedValue(OVERVIEW);
    confirm = vi.fn<AppDependencies['confirmSchedule']['execute']>().mockResolvedValue(SUMMARY);
    discard = vi
      .fn<AppDependencies['discardScheduleDraft']['execute']>()
      .mockResolvedValue(undefined);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getSchedule: { execute: getSchedule },
      getScheduleOverview: { execute: getOverview },
      confirmSchedule: { execute: confirm },
      discardScheduleDraft: { execute: discard },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorized = (call: request.Test) => call.set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('GET /api/schedule/official', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the official to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorized(request(app).get('/api/schedule/official'));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { schedule: OFFICIAL_JSON } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('asks for the official of the school of the identity and ignores one in the query', async () => {
      await authorized(request(app).get('/api/schedule/official?schoolId=query-school'));

      expect(getSchedule).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        which: 'official',
      });
    });

    it('responds null when the school has no official', async () => {
      getSchedule.mockResolvedValue(null);

      const response = await authorized(request(app).get('/api/schedule/official'));

      expect(response.body).toEqual({ success: true, data: { schedule: null } });
    });

    it('responds 401 without a session and 503 without database', async () => {
      const unauthenticated = await request(app).get('/api/schedule/official');
      expect(unauthenticated.status).toBe(401);
      expect(getSchedule).not.toHaveBeenCalled();

      getSchedule.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
      const unavailable = await authorized(request(app).get('/api/schedule/official'));
      expect(unavailable.status).toBe(503);
    });
  });

  describe('GET /api/schedule/overview', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])('responds 200 to a %s, never cached', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorized(request(app).get('/api/schedule/overview'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { draft: null, official: SUMMARY_JSON, previousCount: 2 },
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('asks for the school of the identity', async () => {
      await authorized(request(app).get('/api/schedule/overview?schoolId=query-school'));

      expect(getOverview).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 401 without a session', async () => {
      const response = await request(app).get('/api/schedule/overview');

      expect(response.status).toBe(401);
      expect(getOverview).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/schedule/{id}/confirm', () => {
    const post = (id = SCHEDULE_ID) => authorized(request(app).post(`/api/schedule/${id}/confirm`));

    it('responds 200 with the confirmed schedule, never cached', async () => {
      const response = await post();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { schedule: SUMMARY_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('confirms as the actor of the identity, in the school of the identity', async () => {
      await post();

      expect(confirm).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        scheduleId: SCHEDULE_ID,
      });
    });

    it('responds 403 to a member and does not confirm anything', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await post();

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('responds 404 to an id that is not a UUID, without reaching the use case', async () => {
      const response = await post('not-a-uuid');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('responds 404 when the schedule does not exist in the school', async () => {
      confirm.mockRejectedValue(new ScheduleNotFound());

      const response = await post();

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('responds 409 SCHEDULE_NOT_DRAFT when it is no longer a draft', async () => {
      confirm.mockRejectedValue(new ScheduleNotDraft());

      const response = await post();

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SCHEDULE_NOT_DRAFT');
    });

    it('responds 401 without a session and 503 without database', async () => {
      const unauthenticated = await request(app).post(`/api/schedule/${SCHEDULE_ID}/confirm`);
      expect(unauthenticated.status).toBe(401);
      expect(confirm).not.toHaveBeenCalled();

      confirm.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
      expect((await post()).status).toBe(503);
    });
  });

  describe('DELETE /api/schedule/{id}', () => {
    const remove = (id = SCHEDULE_ID) => authorized(request(app).delete(`/api/schedule/${id}`));

    it('responds 204 with no body, never cached', async () => {
      const response = await remove();

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('discards as the actor of the identity, in the school of the identity', async () => {
      await remove();

      expect(discard).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        scheduleId: SCHEDULE_ID,
      });
    });

    it('responds 403 to a member and does not discard anything', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await remove();

      expect(response.status).toBe(403);
      expect(discard).not.toHaveBeenCalled();
    });

    it('responds 404 to an id that is not a UUID, without reaching the use case', async () => {
      const response = await remove('not-a-uuid');

      expect(response.status).toBe(404);
      expect(discard).not.toHaveBeenCalled();
    });

    it('responds 404 when the schedule does not exist, and 409 when it is not a draft', async () => {
      discard.mockRejectedValueOnce(new ScheduleNotFound());
      expect((await remove()).status).toBe(404);

      discard.mockRejectedValueOnce(new ScheduleNotDraft());
      const conflict = await remove();
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('SCHEDULE_NOT_DRAFT');
    });

    it('responds 401 without a session', async () => {
      const response = await request(app).delete(`/api/schedule/${SCHEDULE_ID}`);

      expect(response.status).toBe(401);
      expect(discard).not.toHaveBeenCalled();
    });

    it('does not take /generate for a schedule id', async () => {
      const response = await remove('generate');

      expect(response.status).toBe(404);
      expect(discard).not.toHaveBeenCalled();
    });
  });
});
