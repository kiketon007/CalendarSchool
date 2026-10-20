import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { Professor } from '../../domain/professor/professor.js';
import { ClassAlreadyHasTutor } from '../../domain/professor/professorErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const PROFESSOR: Professor = {
  id: 'professor-1',
  firstName: 'José María',
  lastName: 'García López',
  position: 'JEFE_ESTUDIOS',
  subjects: [],
  tutoredClass: { id: 'class-1', name: 'A', courseId: 'course-1', courseName: '1º Primaria' },
};

const BODY = {
  firstName: 'José María',
  lastName: 'García López',
  position: 'JEFE_ESTUDIOS',
  classId: '0192f5a0-0000-7000-8000-0000000000e1',
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('professors routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createProfessor: Mock<AppDependencies['createProfessor']['execute']>;
  let listProfessors: Mock<AppDependencies['listProfessors']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createProfessor = vi
      .fn<AppDependencies['createProfessor']['execute']>()
      .mockResolvedValue(PROFESSOR);
    listProfessors = vi
      .fn<AppDependencies['listProfessors']['execute']>()
      .mockResolvedValue([PROFESSOR]);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createProfessor: { execute: createProfessor },
      listProfessors: { execute: listProfessors },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/professors').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/professors').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/professors', () => {
    it('responds 201 with the professor, with no subjects and its class', async () => {
      const response = await authorizedPost();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: { professor: PROFESSOR } });
      expect(authenticate).toHaveBeenCalledExactlyOnceWith(ACCESS_TOKEN);
    });

    it('passes the body, the school and the author of the identity to the use case', async () => {
      await authorizedPost();

      expect(createProfessor).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .post('/api/professors?schoolId=other-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'other-school' });

      expect(createProfessor.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
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
      createProfessor.mockRejectedValue(
        new ValidationError([
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'classId', code: 'NOT_FOUND' },
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
            { field: 'classId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 409 CLASS_ALREADY_HAS_TUTOR when the class has a tutor', async () => {
      createProfessor.mockRejectedValue(new ClassAlreadyHasTutor());

      const response = await authorizedPost();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'CLASS_ALREADY_HAS_TUTOR' },
      });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      createProfessor.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).post('/api/professors').send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
      expect(createProfessor).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedPost();

      expect(response.status).toBe(401);
      expect(createProfessor).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/professors', () => {
    it('responds 200 with the professors of the school', async () => {
      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { professors: [PROFESSOR] } });
      expect(listProfessors).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 200 with an empty list when the school has no professors', async () => {
      listProfessors.mockResolvedValue([]);

      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { professors: [] } });
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
        .get('/api/professors?schoolId=other-school&search=x')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(listProfessors).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      listProfessors.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get('/api/professors');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(listProfessors).not.toHaveBeenCalled();
    });
  });
});
