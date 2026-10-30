import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import type { CourseWorkload } from '../../domain/workload/courseWorkload.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';

const WORKLOAD: CourseWorkload = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  calendar: { id: 'calendar-1', name: 'Jornada continua', sessionsPerDay: 6 },
  subjects: [
    {
      id: SUBJECT_ID,
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
    },
  ],
  assignedSessions: 3,
  availableSessions: 30,
  warnings: [],
};

const BODY = { changes: [{ subjectId: SUBJECT_ID, sessionsPerWeek: 4 }] };

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('workload routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getCourseWorkload: Mock<AppDependencies['getCourseWorkload']['execute']>;
  let updateCourseWorkload: Mock<AppDependencies['updateCourseWorkload']['execute']>;
  let getCourse: Mock<AppDependencies['getCourse']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getCourseWorkload = vi
      .fn<AppDependencies['getCourseWorkload']['execute']>()
      .mockResolvedValue(WORKLOAD);
    updateCourseWorkload = vi
      .fn<AppDependencies['updateCourseWorkload']['execute']>()
      .mockResolvedValue(WORKLOAD);
    getCourse = vi
      .fn<AppDependencies['getCourse']['execute']>()
      .mockRejectedValue(new CourseNotFound());
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getCourseWorkload: { execute: getCourseWorkload },
      updateCourseWorkload: { execute: updateCourseWorkload },
      getCourse: { execute: getCourse },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedGet = (id = COURSE_ID) =>
    request(app).get(`/api/courses/${id}/workload`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedPatch = (id = COURSE_ID, body: string | object = BODY) =>
    request(app)
      .patch(`/api/courses/${id}/workload`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
      .send(body);

  describe('GET /api/courses/:id/workload', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the workload to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorizedGet();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { workload: WORKLOAD } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('passes the id of the course and the school of the identity to the use case', async () => {
      await request(app)
        .get(`/api/courses/${COURSE_ID}/workload?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getCourseWorkload).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        courseId: COURSE_ID,
      });
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedGet('no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(getCourseWorkload).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the course is not in the school', async () => {
      getCourseWorkload.mockRejectedValue(new CourseNotFound());

      const response = await authorizedGet();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get(`/api/courses/${COURSE_ID}/workload`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getCourseWorkload).not.toHaveBeenCalled();
    });

    it('responds 401, not 403, when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedGet()).status).toBe(401);
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getCourseWorkload.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('PATCH /api/courses/:id/workload', () => {
    it('responds 200 with the workload as it ended, never cached', async () => {
      const response = await authorizedPatch();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { workload: WORKLOAD } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the body, the course, the school and the author of the identity to the use case', async () => {
      await authorizedPatch();

      expect(updateCourseWorkload).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        courseId: COURSE_ID,
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .patch(`/api/courses/${COURSE_ID}/workload?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'body-school' });

      expect(updateCourseWorkload).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_ID }),
      );
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedPatch()).status).toBe(200);
    });

    it('responds 403 FORBIDDEN to a MEMBER, without looking at the id or the body', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      for (const response of [
        await authorizedPatch(),
        await authorizedPatch('no-es-un-uuid'),
        await authorizedPatch(COURSE_ID, { changes: 'x' }),
        await authorizedPatch(COURSE_ID, '{ esto no es JSON'),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      }
      expect(updateCourseWorkload).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedPatch('no-es-un-uuid', { changes: 'x' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(updateCourseWorkload).not.toHaveBeenCalled();
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      updateCourseWorkload.mockRejectedValue(
        new ValidationError([
          { field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
          { field: 'changes[1].subjectId', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPatch();

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
            { field: 'changes[1].subjectId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 404 NOT_FOUND when the course is not in the school', async () => {
      updateCourseWorkload.mockRejectedValue(new CourseNotFound());

      const response = await authorizedPatch();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 401 and does nothing without a token', async () => {
      const response = await request(app).patch(`/api/courses/${COURSE_ID}/workload`).send(BODY);

      expect(response.status).toBe(401);
      expect(updateCourseWorkload).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateCourseWorkload.mockRejectedValue(
        new DatabaseUnavailable(new Error('connection refused')),
      );

      const response = await authorizedPatch();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('the routes of the courses', () => {
    it('still reach the courses router: the workload does not swallow GET /api/courses/:id', async () => {
      const response = await request(app)
        .get(`/api/courses/${COURSE_ID}`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(404);
      expect(getCourse).toHaveBeenCalledOnce();
      expect(getCourseWorkload).not.toHaveBeenCalled();
    });
  });
});
