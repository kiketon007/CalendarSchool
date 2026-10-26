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
} from '../../domain/subject/subjectErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

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
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createSubject = vi.fn<AppDependencies['createSubject']['execute']>().mockResolvedValue(SUBJECT);
    listSubjects = vi.fn<AppDependencies['listSubjects']['execute']>().mockResolvedValue([SUBJECT]);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createSubject: { execute: createSubject },
      listSubjects: { execute: listSubjects },
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
});
