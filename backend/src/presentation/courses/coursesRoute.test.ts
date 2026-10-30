import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { Course } from '../../domain/course/course.js';
import {
  CourseAlreadyExists,
  CourseChanged,
  CourseNotFound,
  ProfessorAlreadyTutor,
} from '../../domain/course/courseErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const COURSE: Course = {
  id: 'course-1',
  name: '1º Primaria',
  createdAt: new Date('2026-10-19T09:30:00Z'),
  studentCount: 6,
  classes: [
    { id: 'class-1', name: 'A', tutor: null, studentCount: 4 },
    { id: 'class-2', name: 'B', tutor: null, studentCount: 1 },
  ],
};

/** El curso tal como lo serializa la API: la fecha en ISO 8601. */
const COURSE_JSON = { ...COURSE, createdAt: '2026-10-19T09:30:00.000Z' };

const BODY = { name: '1º Primaria', classes: [{ name: 'A' }, { name: 'B' }] };

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const IMPACT = { classCount: 3, studentCount: 0, constraintCount: 0 };
const EDIT_BODY = {
  name: '1º Primaria Tarde',
  classes: [{ id: '0192f5a0-0000-7000-8000-0000000000e1', name: 'Grupo A' }, { name: 'C' }],
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('courses routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createCourse: Mock<AppDependencies['createCourse']['execute']>;
  let listCourses: Mock<AppDependencies['listCourses']['execute']>;
  let getCourse: Mock<AppDependencies['getCourse']['execute']>;
  let updateCourse: Mock<AppDependencies['updateCourse']['execute']>;
  let getCourseDeletionImpact: Mock<AppDependencies['getCourseDeletionImpact']['execute']>;
  let deleteCourse: Mock<AppDependencies['deleteCourse']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createCourse = vi.fn<AppDependencies['createCourse']['execute']>().mockResolvedValue(COURSE);
    listCourses = vi.fn<AppDependencies['listCourses']['execute']>().mockResolvedValue([COURSE]);
    getCourse = vi.fn<AppDependencies['getCourse']['execute']>().mockResolvedValue(COURSE);
    updateCourse = vi.fn<AppDependencies['updateCourse']['execute']>().mockResolvedValue(COURSE);
    getCourseDeletionImpact = vi
      .fn<AppDependencies['getCourseDeletionImpact']['execute']>()
      .mockResolvedValue(IMPACT);
    deleteCourse = vi.fn<AppDependencies['deleteCourse']['execute']>().mockResolvedValue(IMPACT);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createCourse: { execute: createCourse },
      listCourses: { execute: listCourses },
      getCourse: { execute: getCourse },
      updateCourse: { execute: updateCourse },
      getCourseDeletionImpact: { execute: getCourseDeletionImpact },
      deleteCourse: { execute: deleteCourse },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/courses').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/courses').set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedGetOne = (id: string = COURSE_ID) =>
    request(app).get(`/api/courses/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedPut = (id: string = COURSE_ID, body: string | object = EDIT_BODY) =>
    request(app)
      .put(`/api/courses/${id}`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
      .send(body);

  const authorizedImpact = (id: string = COURSE_ID) =>
    request(app).get(`/api/courses/${id}/impact`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedDelete = (id: string = COURSE_ID) =>
    request(app).delete(`/api/courses/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/courses', () => {
    it('responds 201 with the course and its classes without tutor', async () => {
      const response = await authorizedPost();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: { course: COURSE_JSON } });
      expect(authenticate).toHaveBeenCalledExactlyOnceWith(ACCESS_TOKEN);
    });

    it('passes the body, the school and the author of the identity to the use case', async () => {
      await authorizedPost();

      expect(createCourse).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .post('/api/courses?schoolId=other-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'other-school' });

      expect(createCourse.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedPost();

      expect(response.status).toBe(201);
    });

    it('is never cached', async () => {
      const response = await authorizedPost();

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('does not require the Origin header: it does not use cookies', async () => {
      const response = await authorizedPost();

      expect(response.status).toBe(201);
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      createCourse.mockRejectedValue(
        new ValidationError([
          { field: 'name', code: 'REQUIRED' },
          { field: 'classes[1].name', code: 'DUPLICATE' },
        ]),
      );

      const response = await authorizedPost({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'name', code: 'REQUIRED' },
            { field: 'classes[1].name', code: 'DUPLICATE' },
          ],
        },
      });
    });

    it('responds 409 COURSE_ALREADY_EXISTS when the name is taken', async () => {
      createCourse.mockRejectedValue(new CourseAlreadyExists());

      const response = await authorizedPost();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'COURSE_ALREADY_EXISTS' },
      });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      createCourse.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).post('/api/courses').send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
      expect(createCourse).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedPost();

      expect(response.status).toBe(401);
      expect(createCourse).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/courses', () => {
    it('responds 200 with the courses of the school', async () => {
      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { courses: [COURSE_JSON] } });
      expect(listCourses).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 200 with an empty list when the school has no courses', async () => {
      listCourses.mockResolvedValue([]);

      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { courses: [] } });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedGet();

      expect(response.status).toBe(200);
    });

    it('is never cached', async () => {
      const response = await authorizedGet();

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await request(app)
        .get('/api/courses?schoolId=other-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(listCourses).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      listCourses.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get('/api/courses');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(listCourses).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/courses/:id', () => {
    it('responds 200 with the course', async () => {
      const response = await authorizedGetOne();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { course: COURSE_JSON } });
      expect(getCourse).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        courseId: COURSE_ID,
      });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedGetOne();

      expect(response.status).toBe(200);
    });

    it('is never cached', async () => {
      const response = await authorizedGetOne();

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await request(app)
        .get(`/api/courses/${COURSE_ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getCourse.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it('responds 404 NOT_FOUND when the course is not in the school', async () => {
      getCourse.mockRejectedValue(new CourseNotFound());

      const response = await authorizedGetOne();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedGetOne('abc');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(getCourse).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getCourse.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGetOne();

      expect(response.status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get(`/api/courses/${COURSE_ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getCourse).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/courses/:id', () => {
    it('responds 200 with the course in its final state', async () => {
      const response = await authorizedPut();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { course: COURSE_JSON } });
    });

    it('passes the body, the course, the school and the author of the identity to the use case', async () => {
      await authorizedPut();

      expect(updateCourse).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        courseId: COURSE_ID,
        body: EDIT_BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .put(`/api/courses/${COURSE_ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...EDIT_BODY, schoolId: 'other-school' });

      expect(updateCourse.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedPut();

      expect(response.status).toBe(200);
    });

    it('is never cached', async () => {
      const response = await authorizedPut();

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('does not require the Origin header: it does not use cookies', async () => {
      const response = await authorizedPut();

      expect(response.status).toBe(200);
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields, including a class id', async () => {
      updateCourse.mockRejectedValue(
        new ValidationError([
          { field: 'name', code: 'REQUIRED' },
          { field: 'classes[1].id', code: 'DUPLICATE' },
        ]),
      );

      const response = await authorizedPut(COURSE_ID, {});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'name', code: 'REQUIRED' },
            { field: 'classes[1].id', code: 'DUPLICATE' },
          ],
        },
      });
    });

    it('responds 404 NOT_FOUND when the course is not in the school', async () => {
      updateCourse.mockRejectedValue(new CourseNotFound());

      const response = await authorizedPut();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedPut('abc');

      expect(response.status).toBe(404);
      expect(updateCourse).not.toHaveBeenCalled();
    });

    it('responds 409 COURSE_ALREADY_EXISTS when the name is taken', async () => {
      updateCourse.mockRejectedValue(new CourseAlreadyExists());

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'COURSE_ALREADY_EXISTS' },
      });
    });

    it('responds 409 COURSE_CHANGED when a class is no longer in the course', async () => {
      updateCourse.mockRejectedValue(new CourseChanged());

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'COURSE_CHANGED' },
      });
    });

    it('responds 409 PROFESSOR_ALREADY_TUTOR when the professor already tutors another class', async () => {
      updateCourse.mockRejectedValue(new ProfessorAlreadyTutor());

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'PROFESSOR_ALREADY_TUTOR' },
      });
    });

    it('responds 400 VALIDATION_ERROR with the tutorId of the class that has no valid professor', async () => {
      updateCourse.mockRejectedValue(
        new ValidationError([{ field: 'classes[1].tutorId', code: 'NOT_FOUND' }]),
      );

      const response = await authorizedPut();

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'classes[1].tutorId', code: 'NOT_FOUND' }],
        },
      });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateCourse.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPut();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).put(`/api/courses/${COURSE_ID}`).send(EDIT_BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(updateCourse).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedPut();

      expect(response.status).toBe(401);
      expect(updateCourse).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/courses/:id/impact', () => {
    it('responds 200 with the impact of deleting the course', async () => {
      const response = await authorizedImpact();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { impact: IMPACT } });
      expect(getCourseDeletionImpact).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        courseId: COURSE_ID,
      });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedImpact();

      expect(response.status).toBe(200);
    });

    it('is never cached', async () => {
      const response = await authorizedImpact();

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await request(app)
        .get(`/api/courses/${COURSE_ID}/impact?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getCourseDeletionImpact.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it('responds 404 NOT_FOUND when the course is not in the school', async () => {
      getCourseDeletionImpact.mockRejectedValue(new CourseNotFound());

      const response = await authorizedImpact();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedImpact('abc');

      expect(response.status).toBe(404);
      expect(getCourseDeletionImpact).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getCourseDeletionImpact.mockRejectedValue(
        new DatabaseUnavailable(new Error('connection refused')),
      );

      const response = await authorizedImpact();

      expect(response.status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get(`/api/courses/${COURSE_ID}/impact`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getCourseDeletionImpact).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/courses/:id', () => {
    it('responds 200 with what was deleted', async () => {
      deleteCourse.mockResolvedValue({ classCount: 2, studentCount: 5, constraintCount: 0 });

      const response = await authorizedDelete();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: { classCount: 2, studentCount: 5, constraintCount: 0 } },
      });
    });

    it('passes the course, the school and the author of the identity to the use case', async () => {
      await authorizedDelete();

      expect(deleteCourse).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        courseId: COURSE_ID,
      });
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await request(app)
        .delete(`/api/courses/${COURSE_ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(deleteCourse.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedDelete();

      expect(response.status).toBe(200);
    });

    it('is never cached', async () => {
      const response = await authorizedDelete();

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('does not require the Origin header: it does not use cookies', async () => {
      const response = await authorizedDelete();

      expect(response.status).toBe(200);
    });

    it('responds 404 NOT_FOUND when the course is not in the school or was already deleted', async () => {
      deleteCourse.mockRejectedValue(new CourseNotFound());

      const response = await authorizedDelete();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedDelete('abc');

      expect(response.status).toBe(404);
      expect(deleteCourse).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      deleteCourse.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedDelete();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).delete(`/api/courses/${COURSE_ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(deleteCourse).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedDelete();

      expect(response.status).toBe(401);
      expect(deleteCourse).not.toHaveBeenCalled();
    });
  });
});
