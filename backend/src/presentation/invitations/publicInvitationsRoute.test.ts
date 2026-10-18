import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type { AcceptedInvitation } from '../../domain/accessLink/accessLinkRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { EmailAlreadyRegistered } from '../../domain/registration/registrationErrors.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const INVITATION_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

const body = {
  token: 'token-del-enlace',
  firstName: 'Ana',
  lastName: 'Pérez-Gil',
  email: 'ana.perez@example.com',
  password: 'Secreta123!',
  privacyPolicyAccepted: true,
};

const accepted: AcceptedInvitation = {
  invitationId: INVITATION_ID,
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    firstName: 'Ana',
    lastName: 'Pérez-Gil',
    email: 'ana.perez@example.com',
    role: 'MEMBER',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

describe('public invitations routes', () => {
  let lookup: Mock<AppDependencies['lookupInvitation']['execute']>;
  let accept: Mock<AppDependencies['acceptInvitation']['execute']>;
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    lookup = vi
      .fn<AppDependencies['lookupInvitation']['execute']>()
      .mockResolvedValue({ schoolName: 'CEIP Lluís Vives', role: 'MEMBER' });
    accept = vi.fn<AppDependencies['acceptInvitation']['execute']>().mockResolvedValue(accepted);
    authenticate = vi.fn<AppDependencies['authenticateRequest']['execute']>();
    app = createApp({
      ...defaultDependencies,
      lookupInvitation: { execute: lookup },
      acceptInvitation: { execute: accept },
      authenticateRequest: { execute: authenticate },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  describe('POST /api/invitations/lookup', () => {
    const send = (payload: unknown = { token: body.token }) =>
      request(app)
        .post('/api/invitations/lookup')
        .send(payload as object);

    it('answers 200 with the school name and the role, without any session, never cached', async () => {
      const response = await send();

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        success: true,
        data: { school: { name: 'CEIP Lluís Vives' }, role: 'MEMBER' },
      });
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('passes the body and the context of the request to the use case', async () => {
      await send({ token: body.token, extra: 'x' }).set('User-Agent', 'Mozilla/5.0 (test)');

      expect(lookup).toHaveBeenCalledExactlyOnceWith({
        body: { token: body.token, extra: 'x' },
        context: { ip: expect.any(String) as string, userAgent: 'Mozilla/5.0 (test)' },
      });
    });

    it('answers 410 ACCESS_LINK_INVALID when the link is not valid', async () => {
      lookup.mockRejectedValueOnce(new AccessLinkInvalid('NOT_PENDING'));

      const response = await send();

      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'ACCESS_LINK_INVALID', message: expect.any(String) as string },
      });
    });

    it('answers 429 TOO_MANY_REQUESTS with Retry-After', async () => {
      lookup.mockRejectedValueOnce(new TooManyAttempts(120));

      const response = await send();

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('120');
      expect(response.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
    });

    it('answers 503 DATABASE_UNAVAILABLE', async () => {
      lookup.mockRejectedValueOnce(new DatabaseUnavailable(new Error('connection refused')));

      const response = await send();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });

  describe('POST /api/invitations/accept', () => {
    const send = (payload: unknown = body) =>
      request(app)
        .post('/api/invitations/accept')
        .send(payload as object);

    it('answers 201 with the user and the school, without session, cookies or invitation id', async () => {
      const response = await send();

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.body).toEqual({
        success: true,
        data: { user: accepted.user, school: accepted.school },
      });
      expect(JSON.stringify(response.body)).not.toContain(INVITATION_ID);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('passes the whole body and the context of the request to the use case', async () => {
      await send({ ...body, role: 'ADMIN' }).set('User-Agent', 'Mozilla/5.0 (test)');

      expect(accept).toHaveBeenCalledExactlyOnceWith({
        body: { ...body, role: 'ADMIN' },
        context: { ip: expect.any(String) as string, userAgent: 'Mozilla/5.0 (test)' },
      });
    });

    it('answers 400 VALIDATION_ERROR with a detail per invalid field', async () => {
      accept.mockRejectedValueOnce(
        new ValidationError([
          { field: 'password', code: 'WEAK_PASSWORD' },
          { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
        ]),
      );

      const response = await send();

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'password', code: 'WEAK_PASSWORD' },
            { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
          ],
        },
      });
    });

    it('answers 409 EMAIL_ALREADY_REGISTERED', async () => {
      accept.mockRejectedValueOnce(new EmailAlreadyRegistered());

      const response = await send();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'EMAIL_ALREADY_REGISTERED' } });
    });

    it('answers 410 ACCESS_LINK_INVALID', async () => {
      accept.mockRejectedValueOnce(new AccessLinkInvalid('TOKEN_MISSING'));

      const response = await send({});

      expect(response.status).toBe(410);
      expect(response.body).toMatchObject({ error: { code: 'ACCESS_LINK_INVALID' } });
    });

    it('answers 429 TOO_MANY_REQUESTS with Retry-After', async () => {
      accept.mockRejectedValueOnce(new TooManyAttempts(60));

      const response = await send();

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
    });

    it('answers 503 DATABASE_UNAVAILABLE', async () => {
      accept.mockRejectedValueOnce(new DatabaseUnavailable(new Error('connection refused')));

      const response = await send();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('answers 400 INVALID_JSON to a body that is not JSON, without calling the use case', async () => {
      const response = await request(app)
        .post('/api/invitations/accept')
        .set('Content-Type', 'application/json')
        .send('{no es json');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
      expect(accept).not.toHaveBeenCalled();
    });
  });

  describe('the administrator routes stay protected', () => {
    it.each([
      ['POST', '/api/invitations'],
      ['GET', '/api/invitations'],
      ['POST', `/api/invitations/${INVITATION_ID}/revoke`],
    ])('%s %s answers 401 without a token', async (method, path) => {
      const response = await request(app)[method === 'GET' ? 'get' : 'post'](path);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(lookup).not.toHaveBeenCalled();
      expect(accept).not.toHaveBeenCalled();
    });
  });
});
