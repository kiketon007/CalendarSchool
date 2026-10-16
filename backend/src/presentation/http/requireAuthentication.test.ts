import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  type AuthenticatedUser,
  type AuthenticateRequest,
} from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';
import { getAuthenticatedUser, requireAuthentication } from './requireAuthentication.js';

const ACCESS_TOKEN = 'header.payload.signature';
const IDENTITY: AuthenticatedUser = {
  userId: 'user-1',
  schoolId: 'school-1',
  role: 'ADMIN',
  sessionId: 'session-1',
};

describe('requireAuthentication', () => {
  let execute: Mock<AuthenticateRequest['execute']>;
  let handler: Mock<express.RequestHandler>;
  let lines: string[];
  let app: express.Express;

  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  beforeEach(() => {
    execute = vi.fn<AuthenticateRequest['execute']>().mockResolvedValue(IDENTITY);
    handler = vi.fn<express.RequestHandler>((_req, res) => {
      res.status(200).json({ success: true, data: getAuthenticatedUser(res) });
    });
    lines = [];
    const logger = createLogger('debug', { write: (line: string) => void lines.push(line) });
    app = express();
    app.get('/protected', requireAuthentication({ execute }, logger), handler);
    app.use(errorHandler(logger));
  });

  it('lets through a request with a valid bearer token and exposes the identity to the handler', async () => {
    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: IDENTITY });
    expect(execute).toHaveBeenCalledExactlyOnceWith(ACCESS_TOKEN);
  });

  it.each([
    ['is missing', undefined, 'TOKEN_MISSING'],
    ['uses the Basic scheme', 'Basic dXNlcjpwYXNz', 'TOKEN_MISSING'],
    ['has an empty bearer token', 'Bearer ', 'TOKEN_MISSING'],
    ['has two tokens', 'Bearer one two', 'TOKEN_MISSING'],
    ['has a lowercase scheme', `bearer ${ACCESS_TOKEN}`, 'TOKEN_MISSING'],
  ])(
    'rejects with 401 INVALID_SESSION without running the use case when the header %s',
    async (_case, header, reason) => {
      const call = request(app).get('/protected');

      const response = await (header === undefined ? call : call.set('Authorization', header));

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toEqual({
        success: false,
        error: { code: 'INVALID_SESSION', message: expect.any(String) as string },
      });
      expect(execute).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(entries()).toContainEqual(
        expect.objectContaining({ event: 'AUTHENTICATION_REJECTED', reason, level: 'info' }),
      );
    },
  );

  it('rejects with 401 and the reason of the use case, which never reaches the client', async () => {
    execute.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(JSON.stringify(response.body)).not.toContain('SESSION_REVOKED');
    expect(handler).not.toHaveBeenCalled();
    expect(entries()).toContainEqual(
      expect.objectContaining({ event: 'AUTHENTICATION_REJECTED', reason: 'SESSION_REVOKED' }),
    );
  });

  it('never writes the token or the Authorization header to the log', async () => {
    execute.mockRejectedValue(new InvalidSession('TOKEN_INVALID'));

    await request(app).get('/protected').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(ACCESS_TOKEN);
      expect(line.toLowerCase()).not.toContain('authorization');
    }
  });

  it('answers 503 DATABASE_UNAVAILABLE, never 401, when the database does not respond', async () => {
    execute.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    expect(response.headers['www-authenticate']).toBeUndefined();
  });
});

describe('getAuthenticatedUser', () => {
  it('fails with a programming error when no authentication middleware ran', async () => {
    const lines: string[] = [];
    const logger = createLogger('silent', { write: (line: string) => void lines.push(line) });
    const app = express();
    app.get('/unprotected', (_req, res) => {
      res.json({ success: true, data: getAuthenticatedUser(res) });
    });
    app.use(errorHandler(logger));

    const response = await request(app).get('/unprotected');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});
