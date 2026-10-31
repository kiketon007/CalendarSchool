import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { CourseAssignmentsSnapshot } from '../../domain/assignment/courseAssignments.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000c1';
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

const MATRIX: CourseAssignmentsSnapshot = {
  course: { id: COURSE_ID, name: '1º Primaria' },
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
  classes: [
    { id: CLASS_ID, name: 'A', tutor: { id: PROFESSOR_ID, firstName: 'Ana', lastName: 'García' } },
  ],
  assignments: [{ subjectId: SUBJECT_ID, classId: CLASS_ID, professorId: PROFESSOR_ID }],
};

const BODY = {
  assignments: [{ subjectId: SUBJECT_ID, classId: CLASS_ID, professorId: PROFESSOR_ID }],
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('assignments routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let getAssignments: Mock<AppDependencies['getCourseAssignments']['execute']>;
  let updateAssignments: Mock<AppDependencies['updateCourseAssignments']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    getAssignments = vi
      .fn<AppDependencies['getCourseAssignments']['execute']>()
      .mockResolvedValue(MATRIX);
    updateAssignments = vi
      .fn<AppDependencies['updateCourseAssignments']['execute']>()
      .mockResolvedValue(MATRIX);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      getCourseAssignments: { execute: getAssignments },
      updateCourseAssignments: { execute: updateAssignments },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedGet = (id = COURSE_ID) =>
    request(app)
      .get(`/api/courses/${id}/assignments`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedPut = (id = COURSE_ID, body: string | object = BODY) =>
    request(app)
      .put(`/api/courses/${id}/assignments`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
      .send(body);

  describe('GET /api/courses/:id/assignments', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the matrix to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorizedGet();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { assignments: MATRIX } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('passes the id of the course and the school of the identity to the use case', async () => {
      await request(app)
        .get(`/api/courses/${COURSE_ID}/assignments?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getAssignments).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        courseId: COURSE_ID,
      });
    });

    it('responds 404 when the course does not exist in the school', async () => {
      getAssignments.mockRejectedValue(new CourseNotFound());

      const response = await authorizedGet();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it.each(['abc', '123', 'not-a-uuid'])(
      'responds 404 for the id "%s" without reaching the use case',
      async (id) => {
        const response = await authorizedGet(id);

        expect(response.status).toBe(404);
        expect(getAssignments).not.toHaveBeenCalled();
      },
    );

    it('responds 503 when the database does not respond', async () => {
      getAssignments.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      expect((await authorizedGet()).status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and reads nothing without a token', async () => {
      const response = await request(app).get(`/api/courses/${COURSE_ID}/assignments`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getAssignments).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/courses/:id/assignments', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the stored matrix to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorizedPut();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { assignments: MATRIX } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('passes the body, the id, the school and the author of the identity to the use case', async () => {
      await authorizedPut();

      expect(updateAssignments).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        courseId: COURSE_ID,
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .put(`/api/courses/${COURSE_ID}/assignments?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'other-school' });

      expect(updateAssignments.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it('responds 400 with the fields when the body is not valid', async () => {
      updateAssignments.mockRejectedValue(
        new ValidationError([{ field: 'assignments[0].subjectId', code: 'NOT_FOUND' }]),
      );

      const response = await authorizedPut();

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'assignments[0].subjectId', code: 'NOT_FOUND' }],
        },
      });
    });

    it('responds 404 when the course does not exist in the school', async () => {
      updateAssignments.mockRejectedValue(new CourseNotFound());

      expect((await authorizedPut()).status).toBe(404);
    });

    it.each(['abc', 'not-a-uuid'])(
      'responds 404 for the id "%s" before reading the body or reaching the use case',
      async (id) => {
        const response = await authorizedPut(id, { assignments: 'not valid' });

        expect(response.status).toBe(404);
        expect(updateAssignments).not.toHaveBeenCalled();
      },
    );

    it('responds 503 when the database does not respond', async () => {
      updateAssignments.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      expect((await authorizedPut()).status).toBe(503);
    });

    it('responds 401 and writes nothing without a token', async () => {
      const response = await request(app).put(`/api/courses/${COURSE_ID}/assignments`).send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(updateAssignments).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedPut();

      expect(response.status).toBe(401);
      expect(updateAssignments).not.toHaveBeenCalled();
    });
  });
});
