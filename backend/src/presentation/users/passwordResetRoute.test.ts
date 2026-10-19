import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { UserNotActive, UserNotFound } from '../../domain/user/userManagementErrors.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'actor-1';
const USER_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const URL = 'http://localhost:5173/restablecer#secret-token';
const CREATED_AT = new Date('2026-10-17T10:00:00Z');
const EXPIRES_AT = new Date('2026-10-20T10:00:00Z');

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: ACTOR_ID, schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('password reset administration routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let create: Mock<AppDependencies['createPasswordReset']['execute']>;
  let revoke: Mock<AppDependencies['revokePasswordReset']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    create = vi.fn<AppDependencies['createPasswordReset']['execute']>().mockResolvedValue({
      passwordReset: { userId: USER_ID, createdAt: CREATED_AT, expiresAt: EXPIRES_AT },
      url: URL,
    });
    revoke = vi
      .fn<AppDependencies['revokePasswordReset']['execute']>()
      .mockResolvedValue(undefined);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createPasswordReset: { execute: create },
      revokePasswordReset: { execute: revoke },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (path: string) =>
    request(app).post(path).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/users/{id}/password-reset', () => {
    it('responds 201 with the reset (ISO dates) and the url, never cached', async () => {
      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset`);

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        success: true,
        data: {
          passwordReset: {
            userId: USER_ID,
            createdAt: '2026-10-17T10:00:00.000Z',
            expiresAt: '2026-10-20T10:00:00.000Z',
          },
          url: URL,
        },
      });
    });

    it('passes the school and the actor from the identity and the user from the path', async () => {
      await authorizedPost(`/api/users/${USER_ID}/password-reset?schoolId=other`).send({
        schoolId: 'other-school',
        actorId: 'other-user',
      });

      expect(create).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
        userId: USER_ID,
      });
    });

    it('answers 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedPost('/api/users/not-a-uuid/password-reset');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(create).not.toHaveBeenCalled();
    });

    it('answers 404 NOT_FOUND when the use case reports an unknown user', async () => {
      create.mockRejectedValue(new UserNotFound());

      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('answers 409 USER_NOT_ACTIVE for a suspended user', async () => {
      create.mockRejectedValue(new UserNotActive());

      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset`);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'USER_NOT_ACTIVE' } });
    });

    it('answers 503 DATABASE_UNAVAILABLE', async () => {
      create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset`);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('POST /api/users/{id}/password-reset/revoke', () => {
    it('responds 204 without a body and passes the school, the actor and the user', async () => {
      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset/revoke`);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(revoke).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
        userId: USER_ID,
      });
    });

    it('answers 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedPost('/api/users/not-a-uuid/password-reset/revoke');

      expect(response.status).toBe(404);
      expect(revoke).not.toHaveBeenCalled();
    });

    it('answers 404 NOT_FOUND when the use case reports an unknown user', async () => {
      revoke.mockRejectedValue(new UserNotFound());

      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset/revoke`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('answers 503 DATABASE_UNAVAILABLE', async () => {
      revoke.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost(`/api/users/${USER_ID}/password-reset/revoke`);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe.each([
    [
      'POST /api/users/{id}/password-reset',
      () => request(app).post(`/api/users/${USER_ID}/password-reset`),
    ],
    [
      'POST /api/users/{id}/password-reset/revoke',
      () => request(app).post(`/api/users/${USER_ID}/password-reset/revoke`),
    ],
  ])('%s authorization', (_name, send) => {
    it('answers 401, not 403, without a token', async () => {
      const response = await send();

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('answers 401 when the session is no longer valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await send().set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(401);
      expect(create).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });

    it('answers 403 FORBIDDEN to a member without calling any use case', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await send().set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      expect(create).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });
  });
});
