import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { ScheduleDraftView } from '../../application/schedule/getScheduleDraft.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const GENERATED_AT = new Date('2026-11-04T08:00:05.000Z');

const DRAFT: ScheduleDraftView = {
  id: '0192f5a0-0000-7000-8000-0000000000a2',
  status: 'DRAFT',
  generatedAt: GENERATED_AT,
  placedSessions: 1,
  courses: [
    {
      id: 'course-1',
      name: '1º Primaria',
      calendar: {
        id: 'calendar-1',
        name: 'Primaria',
        periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:45' }],
      },
      classes: [{ id: 'class-1a', name: 'A' }],
    },
  ],
  subjects: [{ id: 'subject-1', name: 'Inglés', code: null, color: 'blue' }],
  professors: [{ id: 'professor-1', firstName: 'Ana', lastName: 'García' }],
  entries: [
    {
      courseId: 'course-1',
      classId: 'class-1a',
      subjectId: 'subject-1',
      professorId: 'professor-1',
      dayOfWeek: 1,
      sessionNumber: 1,
      startTime: '09:00',
      endTime: '09:45',
    },
  ],
};
const DRAFT_JSON = { ...DRAFT, generatedAt: GENERATED_AT.toISOString() };

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('GET /api/schedule/draft', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getDraft: Mock<AppDependencies['getScheduleDraft']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getDraft = vi.fn<AppDependencies['getScheduleDraft']['execute']>().mockResolvedValue(DRAFT);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getScheduleDraft: { execute: getDraft },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorized = (call: request.Test) => call.set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  it.each<UserRole>(['ADMIN', 'MEMBER'])(
    'responds 200 with the draft to a %s, never cached',
    async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorized(request(app).get('/api/schedule/draft'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { schedule: DRAFT_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );

  it('responds null when the school has no draft', async () => {
    getDraft.mockResolvedValue(null);

    const response = await authorized(request(app).get('/api/schedule/draft'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { schedule: null } });
  });

  it('takes the school from the identity and ignores one in the query', async () => {
    await authorized(request(app).get('/api/schedule/draft?schoolId=query-school'));

    expect(getDraft).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
  });

  it('responds 401 without a session', async () => {
    const response = await request(app).get('/api/schedule/draft');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(getDraft).not.toHaveBeenCalled();
  });

  it('responds 503 when the database is unavailable', async () => {
    getDraft.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    const response = await authorized(request(app).get('/api/schedule/draft'));

    expect(response.status).toBe(503);
  });

  it('responds 500 on an unexpected error without leaking it', async () => {
    getDraft.mockRejectedValue(new Error('boom: secret detail'));

    const response = await authorized(request(app).get('/api/schedule/draft'));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret detail');
  });
});
