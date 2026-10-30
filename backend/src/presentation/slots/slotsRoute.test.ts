import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { SubjectSlotRule } from '../../application/slots/buildSubjectSlotRule.js';
import { ValidationError } from '../../application/validationError.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import { CourseHasNoCalendar, SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';

const RULE: SubjectSlotRule = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  subject: {
    id: SUBJECT_ID,
    name: 'Religión',
    code: 'REL',
    color: 'purple',
    sessionsPerWeek: 2,
    maxPerDay: null,
    blockSize: null,
  },
  calendar: {
    id: 'calendar-1',
    name: 'Jornada',
    periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:45' }],
  },
  slots: [{ dayOfWeek: 1, sessionNumber: 1 }],
  outsideCalendarCount: 0,
  warnings: [],
};

const BODY = { slots: [{ dayOfWeek: 1, sessionNumber: 1 }] };

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('forbidden slots routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getForbiddenSlots: Mock<AppDependencies['getForbiddenSlots']['execute']>;
  let updateForbiddenSlots: Mock<AppDependencies['updateForbiddenSlots']['execute']>;
  let getCourse: Mock<AppDependencies['getCourse']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getForbiddenSlots = vi
      .fn<AppDependencies['getForbiddenSlots']['execute']>()
      .mockResolvedValue(RULE);
    updateForbiddenSlots = vi
      .fn<AppDependencies['updateForbiddenSlots']['execute']>()
      .mockResolvedValue(RULE);
    getCourse = vi
      .fn<AppDependencies['getCourse']['execute']>()
      .mockRejectedValue(new SubjectCourseNotFound());
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getForbiddenSlots: { execute: getForbiddenSlots },
      updateForbiddenSlots: { execute: updateForbiddenSlots },
      getCourse: { execute: getCourse },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const url = (courseId = COURSE_ID, subjectId = SUBJECT_ID) =>
    `/api/courses/${courseId}/subjects/${subjectId}/forbidden-slots`;
  const authorizedGet = (courseId = COURSE_ID, subjectId = SUBJECT_ID) =>
    request(app).get(url(courseId, subjectId)).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedPut = (
    courseId = COURSE_ID,
    subjectId = SUBJECT_ID,
    body: string | object = BODY,
  ) =>
    request(app)
      .put(url(courseId, subjectId))
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
      .send(body);

  describe('GET', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the rule to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorizedGet();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { slotRule: RULE } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('passes the ids of the route and the school of the identity to the use case', async () => {
      await request(app)
        .get(`${url()}?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getForbiddenSlots).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        courseId: COURSE_ID,
        subjectId: SUBJECT_ID,
      });
    });

    it.each([
      ['a course id that is not a UUID', 'no-es-un-uuid', SUBJECT_ID],
      ['a subject id that is not a UUID', COURSE_ID, 'no-es-un-uuid'],
    ])(
      'responds 404 NOT_FOUND to %s, without reaching the use case',
      async (_name, courseId, subjectId) => {
        const response = await authorizedGet(courseId, subjectId);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
        expect(getForbiddenSlots).not.toHaveBeenCalled();
      },
    );

    it('responds 404 NOT_FOUND when the subject is not taught in the course', async () => {
      getForbiddenSlots.mockRejectedValue(new SubjectCourseNotFound());

      const response = await authorizedGet();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get(url());

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getForbiddenSlots).not.toHaveBeenCalled();
    });

    it('responds 401, not 403, when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedGet()).status).toBe(401);
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getForbiddenSlots.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('PUT', () => {
    it('responds 200 with the rule as it ended, never cached', async () => {
      const response = await authorizedPut();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { slotRule: RULE } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the body, the ids, the school and the author of the identity to the use case', async () => {
      await authorizedPut();

      expect(updateForbiddenSlots).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        courseId: COURSE_ID,
        subjectId: SUBJECT_ID,
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .put(`${url()}?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'body-school' });

      expect(updateForbiddenSlots).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_ID }),
      );
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedPut()).status).toBe(200);
    });

    it('responds 403 FORBIDDEN to a MEMBER, without looking at the ids or the body', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      for (const response of [
        await authorizedPut(),
        await authorizedPut('no-es-un-uuid'),
        await authorizedPut(COURSE_ID, SUBJECT_ID, { slots: 'x' }),
        await authorizedPut(COURSE_ID, SUBJECT_ID, '{ esto no es JSON'),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      }
      expect(updateForbiddenSlots).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedPut('no-es-un-uuid', SUBJECT_ID, { slots: 'x' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(updateForbiddenSlots).not.toHaveBeenCalled();
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      updateForbiddenSlots.mockRejectedValue(
        new ValidationError([
          { field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' },
          { field: 'slots[1]', code: 'DUPLICATE' },
        ]),
      );

      const response = await authorizedPut();

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' },
            { field: 'slots[1]', code: 'DUPLICATE' },
          ],
        },
      });
    });

    it('responds 404 NOT_FOUND when the subject is not taught in the course', async () => {
      updateForbiddenSlots.mockRejectedValue(new SubjectCourseNotFound());

      const response = await authorizedPut();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 409 COURSE_HAS_NO_CALENDAR when the course has no calendar', async () => {
      updateForbiddenSlots.mockRejectedValue(new CourseHasNoCalendar());

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'COURSE_HAS_NO_CALENDAR' },
      });
    });

    it('responds 401 and does nothing without a token', async () => {
      const response = await request(app).put(url()).send(BODY);

      expect(response.status).toBe(401);
      expect(updateForbiddenSlots).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateForbiddenSlots.mockRejectedValue(
        new DatabaseUnavailable(new Error('connection refused')),
      );

      const response = await authorizedPut();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('the routes of the courses', () => {
    it('still reach the courses router: the slots do not swallow GET /api/courses/:id', async () => {
      const response = await request(app)
        .get(`/api/courses/${COURSE_ID}`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(404);
      expect(getCourse).toHaveBeenCalledOnce();
      expect(getForbiddenSlots).not.toHaveBeenCalled();
    });
  });
});
