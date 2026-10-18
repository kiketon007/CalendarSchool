import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { PendingInvitation } from '../../domain/accessLink/accessLinkRepository.js';
import { InvitationNotFound } from '../../domain/accessLink/accessLinkErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const INVITATION_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const URL = 'http://localhost:5173/invitacion#secret-token';

const INVITATION: PendingInvitation = {
  id: INVITATION_ID,
  role: 'MEMBER',
  createdBy: { id: ACTOR_ID, firstName: 'José María', lastName: 'García-López' },
  createdAt: new Date('2026-10-17T10:00:00Z'),
  expiresAt: new Date('2026-10-20T10:00:00Z'),
};

const SERIALIZED_INVITATION = {
  id: INVITATION_ID,
  role: 'MEMBER',
  createdBy: { id: ACTOR_ID, firstName: 'José María', lastName: 'García-López' },
  createdAt: '2026-10-17T10:00:00.000Z',
  expiresAt: '2026-10-20T10:00:00.000Z',
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: ACTOR_ID, schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('invitations routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let create: Mock<AppDependencies['createInvitation']['execute']>;
  let list: Mock<AppDependencies['listPendingInvitations']['execute']>;
  let revoke: Mock<AppDependencies['revokeInvitation']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    create = vi
      .fn<AppDependencies['createInvitation']['execute']>()
      .mockResolvedValue({ invitation: INVITATION, url: URL });
    list = vi
      .fn<AppDependencies['listPendingInvitations']['execute']>()
      .mockResolvedValue([INVITATION]);
    revoke = vi.fn<AppDependencies['revokeInvitation']['execute']>().mockResolvedValue(undefined);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createInvitation: { execute: create },
      listPendingInvitations: { execute: list },
      revokeInvitation: { execute: revoke },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (path: string) =>
    request(app).post(path).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedGet = (path: string) =>
    request(app).get(path).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/invitations', () => {
    it('responds 201 with the invitation (ISO dates) and the url, never cached', async () => {
      const response = await authorizedPost('/api/invitations').send({ role: 'MEMBER' });

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        success: true,
        data: { invitation: SERIALIZED_INVITATION, url: URL },
      });
    });

    it('passes the school and the actor from the identity and the role from the body', async () => {
      await authorizedPost('/api/invitations?schoolId=other-school').send({
        role: 'ADMIN',
        schoolId: 'other-school',
        actorId: 'other-user',
      });

      expect(create).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
        role: 'ADMIN',
      });
    });

    it('answers 400 VALIDATION_ERROR when the role is missing or invalid', async () => {
      const missing = await authorizedPost('/api/invitations').send({});
      const invalid = await authorizedPost('/api/invitations').send({ role: 'OWNER' });

      expect(missing.status).toBe(400);
      expect(missing.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect(invalid.status).toBe(400);
      expect(invalid.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect(create).not.toHaveBeenCalled();
    });

    it('answers 503 DATABASE_UNAVAILABLE when the invitation cannot be saved', async () => {
      create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost('/api/invitations').send({ role: 'MEMBER' });

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('GET /api/invitations', () => {
    it('responds 200 with the pending invitations and no link', async () => {
      const response = await authorizedGet('/api/invitations');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({ success: true, data: [SERIALIZED_INVITATION] });
      expect(JSON.stringify(response.body)).not.toContain('url');
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await authorizedGet('/api/invitations?schoolId=other-school');

      expect(list).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('answers 503 DATABASE_UNAVAILABLE when the list cannot be read', async () => {
      list.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet('/api/invitations');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('POST /api/invitations/{id}/revoke', () => {
    it('responds 204 without a body and passes the school, the actor and the id', async () => {
      const response = await authorizedPost(`/api/invitations/${INVITATION_ID}/revoke`);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(revoke).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
        invitationId: INVITATION_ID,
      });
    });

    it('answers 404 NOT_FOUND to an id that is not a UUID without calling the use case', async () => {
      const response = await authorizedPost('/api/invitations/not-a-uuid/revoke');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(revoke).not.toHaveBeenCalled();
    });

    it('answers 404 NOT_FOUND when the use case reports an unknown invitation', async () => {
      revoke.mockRejectedValue(new InvitationNotFound());

      const response = await authorizedPost(`/api/invitations/${INVITATION_ID}/revoke`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('answers 503 DATABASE_UNAVAILABLE when the invitation cannot be revoked', async () => {
      revoke.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost(`/api/invitations/${INVITATION_ID}/revoke`);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe.each([
    ['POST /api/invitations', () => request(app).post('/api/invitations').send({ role: 'MEMBER' })],
    ['GET /api/invitations', () => request(app).get('/api/invitations')],
    [
      'POST /api/invitations/{id}/revoke',
      () => request(app).post(`/api/invitations/${INVITATION_ID}/revoke`),
    ],
  ])('%s authorization', (_name, send) => {
    it('answers 401, not 403, without a token', async () => {
      const response = await send();

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('answers 401 when the session is no longer valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await send().set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(401);
      expect(create).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });

    it('answers 403 FORBIDDEN to a member without calling any use case', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await send().set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      expect(create).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });
  });
});
