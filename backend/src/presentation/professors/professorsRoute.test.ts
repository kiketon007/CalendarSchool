import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { Professor } from '../../domain/professor/professor.js';
import { ProfessorAlreadyTutor } from '../../domain/course/courseErrors.js';
import { ClassAlreadyHasTutor, ProfessorNotFound } from '../../domain/professor/professorErrors.js';
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
  unavailableCount: 0,
  tutoredClass: { id: 'class-1', name: 'A', courseId: 'course-1', courseName: '1º Primaria' },
};

const BODY = {
  firstName: 'José María',
  lastName: 'García López',
  position: 'JEFE_ESTUDIOS',
  classId: '0192f5a0-0000-7000-8000-0000000000e1',
};

const AVAILABILITY = {
  professorId: '0192f5a0-0000-7000-8000-0000000000f1',
  unavailable: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:30' }],
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('professors routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createProfessor: Mock<AppDependencies['createProfessor']['execute']>;
  let listProfessors: Mock<AppDependencies['listProfessors']['execute']>;
  let getProfessor: Mock<AppDependencies['getProfessor']['execute']>;
  let updateProfessor: Mock<AppDependencies['updateProfessor']['execute']>;
  let deleteProfessor: Mock<AppDependencies['deleteProfessor']['execute']>;
  let getAvailability: Mock<AppDependencies['getProfessorAvailability']['execute']>;
  let updateAvailability: Mock<AppDependencies['updateProfessorAvailability']['execute']>;
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
    getProfessor = vi.fn<AppDependencies['getProfessor']['execute']>().mockResolvedValue(PROFESSOR);
    updateProfessor = vi
      .fn<AppDependencies['updateProfessor']['execute']>()
      .mockResolvedValue({ professor: PROFESSOR, replacedTutor: null });
    deleteProfessor = vi
      .fn<AppDependencies['deleteProfessor']['execute']>()
      .mockResolvedValue({ freedClass: null });
    getAvailability = vi
      .fn<AppDependencies['getProfessorAvailability']['execute']>()
      .mockResolvedValue(AVAILABILITY);
    updateAvailability = vi
      .fn<AppDependencies['updateProfessorAvailability']['execute']>()
      .mockResolvedValue(AVAILABILITY);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createProfessor: { execute: createProfessor },
      listProfessors: { execute: listProfessors },
      getProfessor: { execute: getProfessor },
      updateProfessor: { execute: updateProfessor },
      deleteProfessor: { execute: deleteProfessor },
      getProfessorAvailability: { execute: getAvailability },
      updateProfessorAvailability: { execute: updateAvailability },
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

  describe('GET /api/professors/{id}', () => {
    const ID = '0192f5a0-0000-7000-8000-0000000000f1';
    const authorizedGetOne = (id = ID) =>
      request(app).get(`/api/professors/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    it('responds 200 with the professor, never cached', async () => {
      const response = await authorizedGetOne();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { professor: PROFESSOR } });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(getProfessor).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        professorId: ID,
      });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedGetOne()).status).toBe(200);
    });

    it('responds 404 NOT_FOUND when the professor is not in the school', async () => {
      getProfessor.mockRejectedValue(new ProfessorNotFound());

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
        expect(getProfessor).not.toHaveBeenCalled();
      },
    );

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getProfessor.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      expect((await authorizedGetOne()).status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).get(`/api/professors/${ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getProfessor).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/professors/{id}', () => {
    const ID = '0192f5a0-0000-7000-8000-0000000000f1';
    const authorizedPut = (body: string | object = BODY, id = ID) =>
      request(app)
        .put(`/api/professors/${id}`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send(body);

    it('responds 200 with the professor and the replaced tutor, never cached', async () => {
      const replacedTutor = { id: 'professor-2', firstName: 'Luis', lastName: 'Pérez' };
      updateProfessor.mockResolvedValue({ professor: PROFESSOR, replacedTutor });

      const response = await authorizedPut();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { professor: PROFESSOR, replacedTutor },
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the body, the school, the author and the id to the use case', async () => {
      await authorizedPut();

      expect(updateProfessor).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        professorId: ID,
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .put(`/api/professors/${ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'other-school' });

      expect(updateProfessor.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'accepts a %s and does not require Origin',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        expect((await authorizedPut()).status).toBe(200);
      },
    );

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      updateProfessor.mockRejectedValue(
        new ValidationError([
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'classId', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPut({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'firstName', code: 'REQUIRED' },
            { field: 'classId', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 404 NOT_FOUND when the professor is not in the school', async () => {
      updateProfessor.mockRejectedValue(new ProfessorNotFound());

      const response = await authorizedPut();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 404 for an id that is not a UUID without reaching the use case', async () => {
      const response = await authorizedPut(BODY, 'abc');

      expect(response.status).toBe(404);
      expect(updateProfessor).not.toHaveBeenCalled();
    });

    it('responds 409 PROFESSOR_ALREADY_TUTOR when another write gave the professor a class', async () => {
      updateProfessor.mockRejectedValue(new ProfessorAlreadyTutor());

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'PROFESSOR_ALREADY_TUTOR' } });
    });

    it('responds 400 INVALID_JSON for a broken body', async () => {
      const response = await request(app)
        .put(`/api/professors/${ID}`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"firstName":');

      expect(response.status).toBe(400);
      expect(updateProfessor).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateProfessor.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      expect((await authorizedPut()).status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).put(`/api/professors/${ID}`).send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(updateProfessor).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/professors/{id}', () => {
    const ID = '0192f5a0-0000-7000-8000-0000000000f1';
    const authorizedDelete = (id = ID) =>
      request(app).delete(`/api/professors/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    it('responds 200 with what was freed, never cached', async () => {
      const freedClass = { id: 'class-1', name: 'A', courseName: '1º Primaria' };
      deleteProfessor.mockResolvedValue({ freedClass });

      const response = await authorizedDelete();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { deleted: { freedClass } } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the school, the author and the id to the use case', async () => {
      await authorizedDelete();

      expect(deleteProfessor).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        professorId: ID,
      });
    });

    it('takes the school from the identity, not from the query', async () => {
      await request(app)
        .delete(`/api/professors/${ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(deleteProfessor.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'accepts a %s and does not require Origin',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        expect((await authorizedDelete()).status).toBe(200);
      },
    );

    it('responds 404 NOT_FOUND when the professor is not in the school', async () => {
      deleteProfessor.mockRejectedValue(new ProfessorNotFound());

      const response = await authorizedDelete();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it.each(['abc', '123', 'not-a-uuid'])(
      'responds 404 for the id "%s" without reaching the use case',
      async (id) => {
        const response = await authorizedDelete(id);

        expect(response.status).toBe(404);
        expect(deleteProfessor).not.toHaveBeenCalled();
      },
    );

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      deleteProfessor.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      expect((await authorizedDelete()).status).toBe(503);
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).delete(`/api/professors/${ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(deleteProfessor).not.toHaveBeenCalled();
    });
  });

  describe('availability routes', () => {
    const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';
    const AVAILABILITY_BODY = {
      unavailable: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:30' }],
    };
    const authorizedGetAvailability = (id = PROFESSOR_ID) =>
      request(app)
        .get(`/api/professors/${id}/availability`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);
    const authorizedPutAvailability = (
      id = PROFESSOR_ID,
      body: string | object = AVAILABILITY_BODY,
    ) =>
      request(app)
        .put(`/api/professors/${id}/availability`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send(body);

    describe('GET /api/professors/:id/availability', () => {
      it.each<UserRole>(['ADMIN', 'MEMBER'])(
        'responds 200 with the availability to a %s, never cached',
        async (role) => {
          authenticate.mockResolvedValue(identityWith(role));

          const response = await authorizedGetAvailability();

          expect(response.status).toBe(200);
          expect(response.body).toEqual({ success: true, data: { availability: AVAILABILITY } });
          expect(response.headers['cache-control']).toBe('no-store');
        },
      );

      it('passes the id and the school of the identity to the use case, ignoring a school in the query', async () => {
        await request(app)
          .get(`/api/professors/${PROFESSOR_ID}/availability?schoolId=query-school`)
          .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

        expect(getAvailability).toHaveBeenCalledExactlyOnceWith({
          schoolId: SCHOOL_ID,
          professorId: PROFESSOR_ID,
        });
      });

      it('responds 404 when the professor does not exist in the school', async () => {
        getAvailability.mockRejectedValue(new ProfessorNotFound());

        const response = await authorizedGetAvailability();

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      });

      it.each(['abc', '123', 'not-a-uuid'])(
        'responds 404 for the id "%s" without reaching the use case',
        async (id) => {
          const response = await authorizedGetAvailability(id);

          expect(response.status).toBe(404);
          expect(getAvailability).not.toHaveBeenCalled();
        },
      );

      it('responds 503 when the database does not respond', async () => {
        getAvailability.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

        expect((await authorizedGetAvailability()).status).toBe(503);
      });

      it('responds 401 with WWW-Authenticate: Bearer and reads nothing without a token', async () => {
        const response = await request(app).get(`/api/professors/${PROFESSOR_ID}/availability`);

        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(getAvailability).not.toHaveBeenCalled();
      });
    });

    describe('PUT /api/professors/:id/availability', () => {
      it.each<UserRole>(['ADMIN', 'MEMBER'])(
        'responds 200 with what was stored to a %s, never cached',
        async (role) => {
          authenticate.mockResolvedValue(identityWith(role));

          const response = await authorizedPutAvailability();

          expect(response.status).toBe(200);
          expect(response.body).toEqual({ success: true, data: { availability: AVAILABILITY } });
          expect(response.headers['cache-control']).toBe('no-store');
        },
      );

      it('passes the body, the id, the school and the author of the identity to the use case', async () => {
        await authorizedPutAvailability();

        expect(updateAvailability).toHaveBeenCalledExactlyOnceWith({
          schoolId: SCHOOL_ID,
          actorId: 'user-1',
          professorId: PROFESSOR_ID,
          body: AVAILABILITY_BODY,
        });
      });

      it('takes the school from the identity, not from the body or the query', async () => {
        await request(app)
          .put(`/api/professors/${PROFESSOR_ID}/availability?schoolId=other-school`)
          .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
          .send({ ...AVAILABILITY_BODY, schoolId: 'other-school' });

        expect(updateAvailability.mock.calls[0]?.[0].schoolId).toBe(SCHOOL_ID);
      });

      it('responds 400 with the fields when the body is not valid', async () => {
        updateAvailability.mockRejectedValue(
          new ValidationError([{ field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' }]),
        );

        const response = await authorizedPutAvailability();

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            details: [{ field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' }],
          },
        });
      });

      it('responds 404 when the professor does not exist in the school', async () => {
        updateAvailability.mockRejectedValue(new ProfessorNotFound());

        expect((await authorizedPutAvailability()).status).toBe(404);
      });

      it.each(['abc', 'not-a-uuid'])(
        'responds 404 for the id "%s" before reading the body or reaching the use case',
        async (id) => {
          const response = await authorizedPutAvailability(id, { unavailable: 'not valid' });

          expect(response.status).toBe(404);
          expect(updateAvailability).not.toHaveBeenCalled();
        },
      );

      it('responds 503 when the database does not respond', async () => {
        updateAvailability.mockRejectedValue(
          new DatabaseUnavailable(new Error('connection refused')),
        );

        expect((await authorizedPutAvailability()).status).toBe(503);
      });

      it('responds 401 and writes nothing without a token', async () => {
        const response = await request(app)
          .put(`/api/professors/${PROFESSOR_ID}/availability`)
          .send(AVAILABILITY_BODY);

        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(updateAvailability).not.toHaveBeenCalled();
      });

      it('responds 401 when the session is not valid', async () => {
        authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

        const response = await authorizedPutAvailability();

        expect(response.status).toBe(401);
        expect(updateAvailability).not.toHaveBeenCalled();
      });
    });
  });
});
