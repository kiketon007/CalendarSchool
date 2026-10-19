import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { Course } from '../../domain/course/course.js';
import { CourseAlreadyExists } from '../../domain/course/courseErrors.js';
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
  classes: [
    { id: 'class-1', name: 'A', tutor: null },
    { id: 'class-2', name: 'B', tutor: null },
  ],
};

/** El curso tal como lo serializa la API: la fecha en ISO 8601. */
const COURSE_JSON = { ...COURSE, createdAt: '2026-10-19T09:30:00.000Z' };

const BODY = { name: '1º Primaria', classes: [{ name: 'A' }, { name: 'B' }] };

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('courses routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createCourse: Mock<AppDependencies['createCourse']['execute']>;
  let listCourses: Mock<AppDependencies['listCourses']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createCourse = vi.fn<AppDependencies['createCourse']['execute']>().mockResolvedValue(COURSE);
    listCourses = vi.fn<AppDependencies['listCourses']['execute']>().mockResolvedValue([COURSE]);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createCourse: { execute: createCourse },
      listCourses: { execute: listCourses },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/courses').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/courses').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

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
});
