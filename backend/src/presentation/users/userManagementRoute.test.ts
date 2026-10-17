import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const TARGET_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const ACTOR_ID = '0192f5a0-0000-7000-8000-0000000000b2';

const UPDATED: SchoolUser = {
  id: TARGET_ID,
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: new Date('2026-10-07T09:30:00Z'),
};
const UPDATED_BODY = { ...UPDATED, createdAt: '2026-10-07T09:30:00.000Z' };

function identityWith(role: UserRole) {
  return { userId: ACTOR_ID, schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('user management routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let manage: Mock<AppDependencies['manageSchoolUser']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    manage = vi.fn<AppDependencies['manageSchoolUser']['execute']>().mockResolvedValue(UPDATED);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      manageSchoolUser: { execute: manage },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const bearer = { Authorization: `Bearer ${ACCESS_TOKEN}` };

  const routes = [
    {
      name: 'PUT /api/users/{id}/role',
      send: (id: string) =>
        request(app).put(`/api/users/${id}/role`).set(bearer).send({ role: 'ADMIN' }),
      action: { type: 'changeRole', role: 'ADMIN' },
    },
    {
      name: 'POST /api/users/{id}/suspend',
      send: (id: string) => request(app).post(`/api/users/${id}/suspend`).set(bearer),
      action: { type: 'suspend' },
    },
    {
      name: 'POST /api/users/{id}/reactivate',
      send: (id: string) => request(app).post(`/api/users/${id}/reactivate`).set(bearer),
      action: { type: 'reactivate' },
    },
  ] as const;

  describe.each(routes)('$name', ({ send, action }) => {
    it('responds 200 with the updated user, ISO dates and no cache', async () => {
      const response = await send(TARGET_ID);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: UPDATED_BODY });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the school and the actor of the identity, the user of the path and the action', async () => {
      await send(TARGET_ID);

      expect(manage).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
        userId: TARGET_ID,
        action,
      });
    });

    it('answers 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await send('no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(manage).not.toHaveBeenCalled();
    });

    it('answers 403 FORBIDDEN to a member without calling the use case', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await send(TARGET_ID);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      expect(manage).not.toHaveBeenCalled();
    });

    it('answers 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      manage.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await send(TARGET_ID);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('does not require the Origin header: it does not use cookies', async () => {
      expect((await send(TARGET_ID)).status).toBe(200);
    });
  });

  it('answers 401, not 403 or 404, without a token on the three routes', async () => {
    for (const response of [
      await request(app).put('/api/users/no-es-un-uuid/role').send({ role: 'ADMIN' }),
      await request(app).post(`/api/users/${TARGET_ID}/suspend`),
      await request(app).post(`/api/users/${TARGET_ID}/reactivate`),
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
    }
    expect(manage).not.toHaveBeenCalled();
  });

  it('answers 401 INVALID_SESSION when the session is no longer valid', async () => {
    authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

    const response = await request(app).post(`/api/users/${TARGET_ID}/suspend`).set(bearer);

    expect(response.status).toBe(401);
    expect(manage).not.toHaveBeenCalled();
  });

  it.each([
    ['without a body', undefined],
    ['without role', {}],
    ['with an unknown role', { role: 'OWNER' }],
    ['with a role that is not a string', { role: 1 }],
    ['with a lowercase role', { role: 'admin' }],
  ])('answers 400 VALIDATION_ERROR on the role route %s', async (_name, body) => {
    const response = await request(app).put(`/api/users/${TARGET_ID}/role`).set(bearer).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'role' }] },
    });
    expect(manage).not.toHaveBeenCalled();
  });

  it('reports a missing role as REQUIRED and an unknown one as INVALID_FORMAT', async () => {
    const missing = await request(app).put(`/api/users/${TARGET_ID}/role`).set(bearer).send({});
    const unknown = await request(app)
      .put(`/api/users/${TARGET_ID}/role`)
      .set(bearer)
      .send({ role: 'OWNER' });

    expect(missing.body).toMatchObject({
      error: { details: [{ field: 'role', code: 'REQUIRED' }] },
    });
    expect(unknown.body).toMatchObject({
      error: { details: [{ field: 'role', code: 'INVALID_FORMAT' }] },
    });
  });

  it('ignores a school or an actor sent in the body or the query: they come from the identity', async () => {
    await request(app)
      .put(`/api/users/${TARGET_ID}/role?schoolId=other-school`)
      .set(bearer)
      .send({ role: 'MEMBER', schoolId: 'other-school', actorId: 'someone-else' });

    expect(manage).toHaveBeenCalledExactlyOnceWith({
      schoolId: SCHOOL_ID,
      actorId: ACTOR_ID,
      userId: TARGET_ID,
      action: { type: 'changeRole', role: 'MEMBER' },
    });
  });

  it('checks the role guard before the body: a member gets 403, not 400', async () => {
    authenticate.mockResolvedValue(identityWith('MEMBER'));

    const response = await request(app).put(`/api/users/${TARGET_ID}/role`).set(bearer).send({});

    expect(response.status).toBe(403);
  });
});
