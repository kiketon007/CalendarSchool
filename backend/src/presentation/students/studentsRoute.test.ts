import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { Student, StudentSummary } from '../../domain/student/student.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const STUDENT: Student = {
  id: 'student-1',
  firstName: 'Juan',
  lastName: 'García',
  course: { id: 'course-1', name: '1º Primaria' },
  class: { id: 'class-1', name: 'A' },
  cafeteria: true,
  scholarship: false,
  foodType: 'Vegetariana',
  observations: 'Necesita apoyo',
};

const SUMMARY: StudentSummary = {
  id: 'student-1',
  firstName: 'Juan',
  lastName: 'García',
  course: { id: 'course-1', name: '1º Primaria' },
  class: { id: 'class-1', name: 'A' },
  cafeteria: true,
  scholarship: false,
};

const BODY = {
  firstName: 'Juan',
  lastName: 'García',
  courseId: '0192f5a0-0000-7000-8000-0000000000d1',
  classId: '0192f5a0-0000-7000-8000-0000000000e1',
  cafeteria: true,
  scholarship: false,
  foodType: 'Vegetariana',
  observations: 'Necesita apoyo',
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('students routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createStudent: Mock<AppDependencies['createStudent']['execute']>;
  let listStudents: Mock<AppDependencies['listStudents']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createStudent = vi.fn<AppDependencies['createStudent']['execute']>().mockResolvedValue(STUDENT);
    listStudents = vi.fn<AppDependencies['listStudents']['execute']>().mockResolvedValue([SUMMARY]);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createStudent: { execute: createStudent },
      listStudents: { execute: listStudents },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/students').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/students').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/students', () => {
    it('responds 201 with the student, sensitive data included', async () => {
      const response = await authorizedPost();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: { student: STUDENT } });
      expect(authenticate).toHaveBeenCalledExactlyOnceWith(ACCESS_TOKEN);
    });

    it('passes the body, the school and the author of the identity to the use case', async () => {
      await authorizedPost();

      expect(createStudent).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .post('/api/students?schoolId=other-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'other-school' });

      expect(createStudent.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      const response = await authorizedPost();

      expect(response.status).toBe(201);
    });

    it('is never cached and does not require the Origin header', async () => {
      const response = await authorizedPost();

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.status).toBe(201);
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      createStudent.mockRejectedValue(
        new ValidationError([
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'scholarship', code: 'NOT_ALLOWED' },
          { field: 'courseId', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPost({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'firstName', code: 'REQUIRED' },
            { field: 'scholarship', code: 'NOT_ALLOWED' },
            { field: 'courseId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 400 INVALID_JSON for a body that is not JSON, without reaching the use case', async () => {
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"firstName":');

      expect(response.status).toBe(400);
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      createStudent.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).post('/api/students').send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedPost();

      expect(response.status).toBe(401);
      expect(createStudent).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/students', () => {
    it('responds 200 with the students of the school', async () => {
      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { students: [SUMMARY] } });
      expect(listStudents).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 200 with an empty list when the school has no students', async () => {
      listStudents.mockResolvedValue([]);

      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { students: [] } });
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
        .get('/api/students?schoolId=other-school&search=x')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(listStudents).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      listStudents.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
    });

    it('responds 401 without a token and does not read the students', async () => {
      const response = await request(app).get('/api/students');

      expect(response.status).toBe(401);
      expect(listStudents).not.toHaveBeenCalled();
    });
  });
});
