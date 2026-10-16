import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import type { UserRole } from '../../domain/user/user.js';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';
import { requireRole } from './requireRole.js';

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: 'school-1', role, sessionId: 'session-1' };
}

describe('requireRole', () => {
  let handler: Mock<express.RequestHandler>;
  let lines: string[];

  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  /** App mínima con la identidad ya puesta, como la dejaría `requireAuthentication`. */
  function appFor(role: UserRole | undefined) {
    const logger = createLogger('debug', { write: (line: string) => void lines.push(line) });
    const app = express();
    app.get(
      '/admin',
      (_req, res, next) => {
        if (role !== undefined) {
          res.locals.auth = identityWith(role);
        }
        next();
      },
      requireRole('ADMIN', logger),
      handler,
    );
    app.use(errorHandler(logger));
    return app;
  }

  beforeEach(() => {
    lines = [];
    handler = vi.fn<express.RequestHandler>((_req, res) => {
      res.status(200).json({ success: true });
    });
  });

  it('lets through a user with the required role', async () => {
    const response = await request(appFor('ADMIN')).get('/admin');

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects another role with 403 FORBIDDEN without reaching the handler', async () => {
    const response = await request(appFor('MEMBER')).get('/admin');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: expect.any(String) as string },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs the denial with the user, the school and both roles', async () => {
    await request(appFor('MEMBER')).get('/admin');

    expect(entries()).toContainEqual(
      expect.objectContaining({
        event: 'AUTHORIZATION_DENIED',
        level: 'warn',
        user_id: 'user-1',
        school_id: 'school-1',
        role: 'MEMBER',
        required_role: 'ADMIN',
      }),
    );
  });

  it('fails with a programming error, not with 403, when no authentication ran before', async () => {
    const response = await request(appFor(undefined)).get('/admin');

    expect(response.status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });
});
