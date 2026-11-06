import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { ScheduleDetailView } from '../../application/schedule/getSchedule.js';
import type { StoredScheduleSummary } from '../../domain/schedule/scheduleRead.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const SCHEDULE_ID = '0192f5a0-0000-7000-8000-0000000000a2';
const GENERATED_AT = new Date('2026-11-04T08:00:05.000Z');
const CONFIRMED_AT = new Date('2026-11-05T09:10:00.000Z');
const REPLACED_AT = new Date('2026-11-06T09:10:00.000Z');

const PREVIOUS: StoredScheduleSummary = {
  id: SCHEDULE_ID,
  status: 'OFFICIAL',
  generatedAt: GENERATED_AT,
  placedSessions: 1,
  confirmedAt: CONFIRMED_AT,
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: REPLACED_AT,
};
const PREVIOUS_JSON = {
  ...PREVIOUS,
  generatedAt: GENERATED_AT.toISOString(),
  confirmedAt: CONFIRMED_AT.toISOString(),
  replacedAt: REPLACED_AT.toISOString(),
};

const DETAIL: ScheduleDetailView = {
  ...PREVIOUS,
  courses: [],
  subjects: [],
  professors: [],
  entries: [],
};
const DETAIL_JSON = { ...DETAIL, ...PREVIOUS_JSON };

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('the previous schedules routes (US-ALGO-CONFIRM_b)', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getSchedule: Mock<AppDependencies['getSchedule']['execute']>;
  let listPrevious: Mock<AppDependencies['listPreviousSchedules']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getSchedule = vi.fn<AppDependencies['getSchedule']['execute']>().mockResolvedValue(DETAIL);
    listPrevious = vi
      .fn<AppDependencies['listPreviousSchedules']['execute']>()
      .mockResolvedValue([PREVIOUS]);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getSchedule: { execute: getSchedule },
      listPreviousSchedules: { execute: listPrevious },
      getScheduleOverview: {
        execute: () => Promise.resolve({ draft: null, official: null, previousCount: 0 }),
      },
      getScheduleReadiness: {
        execute: () => Promise.resolve({ ready: true, blocking: [], warnings: [] }),
      },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorized = (call: request.Test) => call.set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('GET /api/schedule/previous', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])('responds 200 to a %s, never cached', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorized(request(app).get('/api/schedule/previous'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { schedules: [PREVIOUS_JSON] } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('asks for the school of the identity and ignores one in the query', async () => {
      await authorized(request(app).get('/api/schedule/previous?schoolId=query-school'));

      expect(listPrevious).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds an empty list when no official was replaced', async () => {
      listPrevious.mockResolvedValue([]);

      const response = await authorized(request(app).get('/api/schedule/previous'));

      expect(response.body).toEqual({ success: true, data: { schedules: [] } });
    });

    it('responds 401 without a session and 503 without database', async () => {
      const unauthenticated = await request(app).get('/api/schedule/previous');
      expect(unauthenticated.status).toBe(401);
      expect(listPrevious).not.toHaveBeenCalled();

      listPrevious.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
      const unavailable = await authorized(request(app).get('/api/schedule/previous'));
      expect(unavailable.status).toBe(503);
    });
  });

  describe('GET /api/schedule/{id}', () => {
    const get = (id = SCHEDULE_ID) => authorized(request(app).get(`/api/schedule/${id}`));

    it.each<UserRole>(['ADMIN', 'MEMBER'])('responds 200 to a %s, never cached', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await get();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { schedule: DETAIL_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('asks for the official with that id in the school of the identity', async () => {
      await authorized(request(app).get(`/api/schedule/${SCHEDULE_ID}?schoolId=query-school`));

      expect(getSchedule).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        which: { id: SCHEDULE_ID },
      });
    });

    it('responds 404 when there is no such official in the school', async () => {
      getSchedule.mockResolvedValue(null);

      const response = await get();

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('responds 404 to an id that is not a UUID, without reaching the use case', async () => {
      const response = await get('not-a-uuid');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(getSchedule).not.toHaveBeenCalled();
    });

    it('responds 401 without a session and 503 without database', async () => {
      const unauthenticated = await request(app).get(`/api/schedule/${SCHEDULE_ID}`);
      expect(unauthenticated.status).toBe(401);
      expect(getSchedule).not.toHaveBeenCalled();

      getSchedule.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
      expect((await get()).status).toBe(503);
    });
  });

  describe('the literal routes come before /:id', () => {
    it.each(['draft', 'official', 'overview', 'previous', 'readiness'])(
      'GET /api/schedule/%s is not read as an id',
      async (path) => {
        const response = await authorized(request(app).get(`/api/schedule/${path}`));

        expect(response.status).toBe(200);
        for (const [argument] of getSchedule.mock.calls) {
          expect(typeof argument.which).toBe('string');
        }
      },
    );
  });
});
