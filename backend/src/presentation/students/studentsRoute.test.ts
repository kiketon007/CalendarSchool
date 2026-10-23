import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import { StudentNotFound } from '../../domain/student/studentErrors.js';
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

const ID = '0192f5a0-0000-7000-8000-0000000000a1';

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
  let getStudent: Mock<AppDependencies['getStudent']['execute']>;
  let updateStudent: Mock<AppDependencies['updateStudent']['execute']>;
  let deleteStudent: Mock<AppDependencies['deleteStudent']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createStudent = vi.fn<AppDependencies['createStudent']['execute']>().mockResolvedValue(STUDENT);
    listStudents = vi.fn<AppDependencies['listStudents']['execute']>().mockResolvedValue([SUMMARY]);
    getStudent = vi.fn<AppDependencies['getStudent']['execute']>().mockResolvedValue(STUDENT);
    updateStudent = vi.fn<AppDependencies['updateStudent']['execute']>().mockResolvedValue(STUDENT);
    deleteStudent = vi
      .fn<AppDependencies['deleteStudent']['execute']>()
      .mockResolvedValue({ id: ID });
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createStudent: { execute: createStudent },
      listStudents: { execute: listStudents },
      getStudent: { execute: getStudent },
      updateStudent: { execute: updateStudent },
      deleteStudent: { execute: deleteStudent },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/students').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/students').set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedGetOne = (id: string = ID) =>
    request(app).get(`/api/students/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedPut = (body: string | object = BODY, id: string = ID) =>
    request(app)
      .put(`/api/students/${id}`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
      .send(body);

  const authorizedDelete = (id: string = ID) =>
    request(app).delete(`/api/students/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

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

  describe('GET /api/students/{id}', () => {
    it('responds 200 with the student, sensitive data included, and never caches it', async () => {
      const response = await authorizedGetOne();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { student: STUDENT } });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(getStudent).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID, studentId: ID });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedGetOne()).status).toBe(200);
    });

    it('takes the school from the identity and ignores one sent in the query', async () => {
      await request(app)
        .get(`/api/students/${ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getStudent.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it('responds 404 NOT_FOUND when the student is not in the school', async () => {
      getStudent.mockRejectedValue(new StudentNotFound());

      const response = await authorizedGetOne();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it.each(['abc', '123', 'not-a-uuid'])(
      'responds 404 for the id "%s" without reaching the use case',
      async (id) => {
        const response = await authorizedGetOne(id);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
        expect(getStudent).not.toHaveBeenCalled();
      },
    );

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getStudent.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      expect((await authorizedGetOne()).status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get(`/api/students/${ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getStudent).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/students/{id}', () => {
    it('responds 200 with the student, sensitive data included, and never caches it', async () => {
      const response = await authorizedPut();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { student: STUDENT } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the id, the body, the school and the author of the identity to the use case', async () => {
      await authorizedPut();

      expect(updateStudent).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        studentId: ID,
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .put(`/api/students/${ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'other-school' });

      expect(updateStudent.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'accepts a %s without the Origin header',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        expect((await authorizedPut()).status).toBe(200);
      },
    );

    it('responds 400 VALIDATION_ERROR with the invalid fields, including a course or a class that are gone', async () => {
      updateStudent.mockRejectedValue(
        new ValidationError([
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'courseId', code: 'NOT_FOUND' },
          { field: 'classId', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPut({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'firstName', code: 'REQUIRED' },
            { field: 'courseId', code: 'NOT_FOUND' },
            { field: 'classId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 404 NOT_FOUND when the student is not in the school', async () => {
      updateStudent.mockRejectedValue(new StudentNotFound());

      const response = await authorizedPut();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it.each(['abc', '123', 'not-a-uuid'])(
      'responds 404 for the id "%s" without reaching the use case, even with an invalid body',
      async (id) => {
        const response = await authorizedPut({}, id);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
        expect(updateStudent).not.toHaveBeenCalled();
      },
    );

    it('responds 400 INVALID_JSON for a body that is not JSON, without reaching the use case', async () => {
      const response = await request(app)
        .put(`/api/students/${ID}`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"firstName":');

      expect(response.status).toBe(400);
      expect(updateStudent).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateStudent.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPut();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).put(`/api/students/${ID}`).send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(updateStudent).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedPut()).status).toBe(401);
      expect(updateStudent).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/students/{id}', () => {
    it('responds 200 with the deleted id and never caches it', async () => {
      const response = await authorizedDelete();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { deleted: { id: ID } } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the id, the school and the author of the identity to the use case', async () => {
      await authorizedDelete();

      expect(deleteStudent).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        studentId: ID,
      });
    });

    it('takes the school from the identity and ignores one sent in the query', async () => {
      await request(app)
        .delete(`/api/students/${ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(deleteStudent).toHaveBeenCalledWith(expect.objectContaining({ schoolId: SCHOOL_ID }));
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedDelete()).status).toBe(200);
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedDelete()).status).toBe(200);
    });

    it('responds 404 NOT_FOUND when the student is not in the school', async () => {
      deleteStudent.mockRejectedValue(new StudentNotFound());

      const response = await authorizedDelete();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it.each(['abc', '123', 'not-a-uuid'])(
      'responds 404 for the id "%s" without reaching the use case',
      async (id) => {
        const response = await authorizedDelete(id);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
        expect(deleteStudent).not.toHaveBeenCalled();
      },
    );

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      deleteStudent.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedDelete();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).delete(`/api/students/${ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(deleteStudent).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedDelete()).status).toBe(401);
      expect(deleteStudent).not.toHaveBeenCalled();
    });
  });
});
