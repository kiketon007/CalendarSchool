import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const body = { token: 'token-del-enlace', password: 'Secreta123!' };

describe('public password reset routes', () => {
  let lookup: Mock<AppDependencies['lookupPasswordReset']['execute']>;
  let confirm: Mock<AppDependencies['confirmPasswordReset']['execute']>;
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    lookup = vi
      .fn<AppDependencies['lookupPasswordReset']['execute']>()
      .mockResolvedValue({ schoolName: 'CEIP Lluís Vives', email: 'a***@example.com' });
    confirm = vi.fn<AppDependencies['confirmPasswordReset']['execute']>().mockResolvedValue();
    authenticate = vi.fn<AppDependencies['authenticateRequest']['execute']>();
    app = createApp({
      ...defaultDependencies,
      lookupPasswordReset: { execute: lookup },
      confirmPasswordReset: { execute: confirm },
      authenticateRequest: { execute: authenticate },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  describe('POST /api/password-resets/lookup', () => {
    const send = (payload: unknown = { token: body.token }) =>
      request(app)
        .post('/api/password-resets/lookup')
        .send(payload as object);

    it('answers 200 with the school name and the masked email, without any session, never cached', async () => {
      const response = await send();

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        success: true,
        data: { school: { name: 'CEIP Lluís Vives' }, email: 'a***@example.com' },
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
      expect(response.body).toMatchObject({ error: { code: 'ACCESS_LINK_INVALID' } });
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

  describe('POST /api/password-resets/confirm', () => {
    const send = (payload: unknown = body) =>
      request(app)
        .post('/api/password-resets/confirm')
        .send(payload as object);

    it('answers 204 without a body, session or cookies, never cached', async () => {
      const response = await send();

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('passes the whole body and the context of the request to the use case', async () => {
      await send({ ...body, userId: 'other' }).set('User-Agent', 'Mozilla/5.0 (test)');

      expect(confirm).toHaveBeenCalledExactlyOnceWith({
        body: { ...body, userId: 'other' },
        context: { ip: expect.any(String) as string, userAgent: 'Mozilla/5.0 (test)' },
      });
    });

    it('answers 400 VALIDATION_ERROR with the field details', async () => {
      confirm.mockRejectedValueOnce(
        new ValidationError([{ field: 'password', code: 'WEAK_PASSWORD' }]),
      );

      const response = await send();

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'password', code: 'WEAK_PASSWORD' }],
        },
      });
    });

    it('answers 410 ACCESS_LINK_INVALID when the link is not valid', async () => {
      confirm.mockRejectedValueOnce(new AccessLinkInvalid('NOT_PENDING'));

      const response = await send();

      expect(response.status).toBe(410);
      expect(response.body).toMatchObject({ error: { code: 'ACCESS_LINK_INVALID' } });
    });

    it('answers 429 TOO_MANY_REQUESTS with Retry-After', async () => {
      confirm.mockRejectedValueOnce(new TooManyAttempts(60));

      const response = await send();

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
    });

    it('answers 503 DATABASE_UNAVAILABLE', async () => {
      confirm.mockRejectedValueOnce(new DatabaseUnavailable(new Error('connection refused')));

      const response = await send();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });
  });
});
