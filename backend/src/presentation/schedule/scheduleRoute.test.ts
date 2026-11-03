import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { ScheduleReadiness } from '../../domain/schedule/readiness.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const READINESS: ScheduleReadiness = {
  ready: false,
  blocking: [
    {
      code: 'COURSE_WITHOUT_CALENDAR',
      course: { id: '0192f5a0-0000-7000-8000-0000000000d2', name: '6º Primaria' },
    },
  ],
  warnings: [
    {
      code: 'MAY_EXCEED_MAX_HOURS',
      professor: {
        id: '0192f5a0-0000-7000-8000-0000000000f3',
        firstName: 'Pedro',
        lastName: 'Soto',
      },
    },
  ],
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('schedule routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getReadiness: Mock<AppDependencies['getScheduleReadiness']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getReadiness = vi
      .fn<AppDependencies['getScheduleReadiness']['execute']>()
      .mockResolvedValue(READINESS);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getScheduleReadiness: { execute: getReadiness },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedGet = () =>
    request(app).get('/api/schedule/readiness').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('GET /api/schedule/readiness', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the readiness to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorizedGet();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { readiness: READINESS } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('responds 200 when the school is ready', async () => {
      getReadiness.mockResolvedValue({ ready: true, blocking: [], warnings: [] });

      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { readiness: { ready: true, blocking: [], warnings: [] } },
      });
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await request(app)
        .get('/api/schedule/readiness?schoolId=query-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getReadiness).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 401 without a session and does not read anything', async () => {
      const response = await request(app).get('/api/schedule/readiness');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getReadiness).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedGet();

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false, error: { code: 'INVALID_SESSION' } });
    });

    it('responds 503 when the database is unavailable', async () => {
      getReadiness.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('does not exist under another path', async () => {
      const response = await request(app)
        .get('/api/schedule/other')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(404);
    });
  });
});
