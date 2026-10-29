import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { Subject } from '../../domain/subject/subject.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';

const SUBJECT: Subject = {
  id: 'subject-1',
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: null,
  color: 'blue',
  createdAt: new Date('2026-10-26T09:30:00Z'),
  courses: [{ id: 'course-1', name: '1º Primaria', sessionsPerWeek: 3 }],
};

/** La asignatura tal como la serializa la API: la fecha en ISO 8601. */
const SUBJECT_JSON = { ...SUBJECT, createdAt: '2026-10-26T09:30:00.000Z' };

const BODY = {
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  color: 'blue',
  courses: [{ courseId: '0192f5a0-0000-7000-8000-0000000000d1', sessionsPerWeek: 3 }],
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('subjects routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createSubject: Mock<AppDependencies['createSubject']['execute']>;
  let listSubjects: Mock<AppDependencies['listSubjects']['execute']>;
  let getSubject: Mock<AppDependencies['getSubject']['execute']>;
  let updateSubject: Mock<AppDependencies['updateSubject']['execute']>;
  let deleteSubject: Mock<AppDependencies['deleteSubject']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createSubject = vi.fn<AppDependencies['createSubject']['execute']>().mockResolvedValue(SUBJECT);
    listSubjects = vi.fn<AppDependencies['listSubjects']['execute']>().mockResolvedValue([SUBJECT]);
    getSubject = vi.fn<AppDependencies['getSubject']['execute']>().mockResolvedValue(SUBJECT);
    updateSubject = vi.fn<AppDependencies['updateSubject']['execute']>().mockResolvedValue(SUBJECT);
    deleteSubject = vi
      .fn<AppDependencies['deleteSubject']['execute']>()
      .mockResolvedValue({ id: SUBJECT_ID });
    app = createApp({
      ...defaultDependencies,
      deleteSubject: { execute: deleteSubject },
      authenticateRequest: { execute: authenticate },
      createSubject: { execute: createSubject },
      listSubjects: { execute: listSubjects },
      getSubject: { execute: getSubject },
      updateSubject: { execute: updateSubject },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/subjects').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/subjects').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/subjects', () => {
    it('responds 201 with the subject, never cached', async () => {
      const response = await authorizedPost();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: { subject: SUBJECT_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the body, the school and the author of the identity to the use case', async () => {
      await authorizedPost();

      expect(createSubject).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .post('/api/subjects?schoolId=query-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'body-school' });

      expect(createSubject).toHaveBeenCalledWith(expect.objectContaining({ schoolId: SCHOOL_ID }));
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedPost()).status).toBe(201);
    });

    it('responds 403 FORBIDDEN to a MEMBER, without reaching the use case, even with a body that is not valid', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await authorizedPost({ name: '' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      expect(createSubject).not.toHaveBeenCalled();
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      createSubject.mockRejectedValue(
        new ValidationError([
          { field: 'name', code: 'REQUIRED' },
          { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
          { field: 'courses[1].courseId', code: 'NOT_FOUND' },
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
            { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
            { field: 'courses[1].courseId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 409 SUBJECT_ALREADY_EXISTS when the name is taken', async () => {
      createSubject.mockRejectedValue(new SubjectAlreadyExists());

      const response = await authorizedPost();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'SUBJECT_ALREADY_EXISTS' },
      });
    });

    it('responds 409 SUBJECT_CODE_ALREADY_EXISTS when the code is taken', async () => {
      createSubject.mockRejectedValue(new SubjectCodeAlreadyExists());

      const response = await authorizedPost();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'SUBJECT_CODE_ALREADY_EXISTS' },
      });
    });

    it('responds 400 INVALID_JSON for a body that is not JSON, without reaching the use case', async () => {
      const response = await request(app)
        .post('/api/subjects')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"name":');

      expect(response.status).toBe(400);
      expect(createSubject).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      createSubject.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).post('/api/subjects').send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(createSubject).not.toHaveBeenCalled();
    });

    it('responds 401, not 403, when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedPost()).status).toBe(401);
      expect(createSubject).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/subjects', () => {
    it('responds 200 with the subjects of the school, never cached', async () => {
      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { subjects: [SUBJECT_JSON] } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('responds 200 with an empty list when the school has no subjects', async () => {
      listSubjects.mockResolvedValue([]);

      const response = await authorizedGet();

      expect(response.body).toEqual({ success: true, data: { subjects: [] } });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedGet()).status).toBe(200);
    });

    it('takes the school from the identity and ignores one sent in the query', async () => {
      await request(app)
        .get('/api/subjects?schoolId=other-school&page=2')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(listSubjects).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      listSubjects.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 without a token and does not read the subjects', async () => {
      const response = await request(app).get('/api/subjects');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(listSubjects).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/subjects/:id', () => {
    const authorizedGetOne = (id = SUBJECT_ID) =>
      request(app).get(`/api/subjects/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    it('responds 200 with the subject, never cached', async () => {
      const response = await authorizedGetOne();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { subject: SUBJECT_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedGetOne()).status).toBe(200);
    });

    it('asks for the subject of the id under the school of the identity', async () => {
      await authorizedGetOne();

      expect(getSubject).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        subjectId: SUBJECT_ID,
      });
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedGetOne('no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(getSubject).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the subject is not in the school', async () => {
      getSubject.mockRejectedValue(new SubjectNotFound());

      const response = await authorizedGetOne();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getSubject.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGetOne();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 without a token and does not read the subject', async () => {
      const response = await request(app).get(`/api/subjects/${SUBJECT_ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getSubject).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/subjects/:id', () => {
    const authorizedPut = (body: string | object = BODY, id = SUBJECT_ID) =>
      request(app)
        .put(`/api/subjects/${id}`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send(body);

    it('responds 200 with the subject, never cached', async () => {
      const response = await authorizedPut();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { subject: SUBJECT_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the id, the body, the school and the author of the identity to the use case', async () => {
      await authorizedPut();

      expect(updateSubject).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        subjectId: SUBJECT_ID,
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .put(`/api/subjects/${SUBJECT_ID}?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'body-school' });

      expect(updateSubject).toHaveBeenCalledWith(expect.objectContaining({ schoolId: SCHOOL_ID }));
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedPut()).status).toBe(200);
    });

    it('responds 403 FORBIDDEN to a MEMBER, even with an id that is not valid or a body that is not valid, without reaching the use case', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      for (const response of [
        await authorizedPut(),
        await authorizedPut({ name: '' }, 'no-es-un-uuid'),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      }
      expect(updateSubject).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without validating the body or reaching the use case', async () => {
      const response = await authorizedPut({ name: '' }, 'no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(updateSubject).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the subject is not in the school', async () => {
      updateSubject.mockRejectedValue(new SubjectNotFound());

      const response = await authorizedPut();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      updateSubject.mockRejectedValue(
        new ValidationError([
          { field: 'code', code: 'INVALID_LENGTH' },
          { field: 'courses[1].courseId', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPut({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'code', code: 'INVALID_LENGTH' },
            { field: 'courses[1].courseId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it.each([
      [new SubjectAlreadyExists(), 'SUBJECT_ALREADY_EXISTS'],
      [new SubjectCodeAlreadyExists(), 'SUBJECT_CODE_ALREADY_EXISTS'],
    ])('responds 409 %# with its own code', async (error, code) => {
      updateSubject.mockRejectedValue(error);

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ success: false, error: { code } });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateSubject.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPut();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).put(`/api/subjects/${SUBJECT_ID}`).send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(updateSubject).not.toHaveBeenCalled();
    });

    it('responds 401, not 403, when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedPut()).status).toBe(401);
      expect(updateSubject).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/subjects/:id', () => {
    const authorizedDelete = (id = SUBJECT_ID) =>
      request(app).delete(`/api/subjects/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    it('responds 200 with the deleted id, never cached', async () => {
      const response = await authorizedDelete();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { deleted: { id: SUBJECT_ID } } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the id, the school and the author of the identity to the use case', async () => {
      await authorizedDelete();

      expect(deleteSubject).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        subjectId: SUBJECT_ID,
      });
    });

    it('takes the school from the identity, not from the query', async () => {
      await request(app)
        .delete(`/api/subjects/${SUBJECT_ID}?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(deleteSubject).toHaveBeenCalledWith(expect.objectContaining({ schoolId: SCHOOL_ID }));
    });

    it('responds 403 FORBIDDEN to a MEMBER, even with an id that is not a UUID, without reaching the use case', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      for (const response of [await authorizedDelete(), await authorizedDelete('no-es-un-uuid')]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      }
      expect(deleteSubject).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedDelete('no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(deleteSubject).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the subject is not in the school', async () => {
      deleteSubject.mockRejectedValue(new SubjectNotFound());

      const response = await authorizedDelete();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      deleteSubject.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedDelete();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).delete(`/api/subjects/${SUBJECT_ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(deleteSubject).not.toHaveBeenCalled();
    });

    it('responds 401, not 403, when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedDelete()).status).toBe(401);
      expect(deleteSubject).not.toHaveBeenCalled();
    });
  });
});
