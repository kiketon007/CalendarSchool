import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';
import { requireAllowedOrigin } from './requireAllowedOrigin.js';

const APP_ORIGIN = 'http://localhost:5173';

/** App mínima: el guard delante de un handler que solo responde si se le deja pasar. */
function appWithGuard() {
  const handler = vi.fn<express.RequestHandler>((_req, res) => {
    res.status(200).json({ success: true, data: 'reached' });
  });
  const app = express();
  app.post('/protected', requireAllowedOrigin(APP_ORIGIN), handler);
  app.use(errorHandler(createLogger('silent')));
  return { app, handler };
}

describe('requireAllowedOrigin', () => {
  it('lets through a request from the application origin', async () => {
    const { app, handler } = appWithGuard();

    const response = await request(app).post('/protected').set('Origin', APP_ORIGIN);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    ['another site', 'https://malicioso.example'],
    ['another port', 'http://localhost:4173'],
    ['another scheme', 'https://localhost:5173'],
    ['the opaque null origin', 'null'],
  ])(
    'rejects %s with 403 ORIGIN_NOT_ALLOWED without reaching the handler',
    async (_case, origin) => {
      const { app, handler } = appWithGuard();

      const response = await request(app).post('/protected').set('Origin', origin);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'ORIGIN_NOT_ALLOWED', message: expect.any(String) as string },
      });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('rejects a request without Origin header', async () => {
    const { app, handler } = appWithGuard();

    const response = await request(app).post('/protected');

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(handler).not.toHaveBeenCalled();
  });
});
