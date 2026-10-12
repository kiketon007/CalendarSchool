import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';
import { requireOriginVerification } from './requireOriginVerification.js';

const SECRET = 'origin-verify-secret-0123456789abcdef';

/** App mínima con el logger capturando las líneas JSON de pino. */
function appWithGuard(trustProxyHops = 0) {
  const lines: string[] = [];
  const logger = createLogger('debug', { write: (line: string) => void lines.push(line) });
  const handler = vi.fn<express.RequestHandler>((_req, res) => {
    res.status(200).json({ success: true, data: 'reached' });
  });
  const app = express();
  app.set('trust proxy', trustProxyHops);
  app.use(requireOriginVerification(SECRET, logger));
  app.get('/api/health', handler);
  app.use(errorHandler(logger));
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { app, handler, lines, entries };
}

describe('requireOriginVerification', () => {
  it('lets through a request with the right X-Origin-Verify header', async () => {
    const { app, handler } = appWithGuard();

    const response = await request(app).get('/api/health').set('X-Origin-Verify', SECRET);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    ['is missing', undefined],
    ['is another value of the same length', 'x'.repeat(SECRET.length)],
    ['is a prefix of the secret', SECRET.slice(0, -1)],
    ['is longer than the secret', `${SECRET}x`],
    ['is empty', ''],
  ])('rejects with 403 ORIGIN_NOT_ALLOWED when the header %s', async (_case, value) => {
    const { app, handler } = appWithGuard();
    const call = request(app).get('/api/health');

    const response = await (value === undefined ? call : call.set('X-Origin-Verify', value));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'ORIGIN_NOT_ALLOWED', message: expect.any(String) as string },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs the rejection at warn level without the received value or the secret', async () => {
    const { app, lines, entries } = appWithGuard();
    const received = 'valor-recibido-que-no-debe-aparecer';

    await request(app).get('/api/health').set('X-Origin-Verify', received);

    expect(entries().some((entry) => entry.level === 'warn')).toBe(true);
    expect(lines.join('')).not.toContain(received);
    expect(lines.join('')).not.toContain(SECRET);
  });

  it('logs at debug level the IP and X-Forwarded-For used to measure TRUST_PROXY_HOPS', async () => {
    const { app, entries } = appWithGuard(1);

    await request(app)
      .get('/api/health')
      .set('X-Origin-Verify', SECRET)
      .set('X-Forwarded-For', '198.51.100.9');

    const debug = entries().find((entry) => entry.level === 'debug');
    expect(debug).toMatchObject({ ip: '198.51.100.9', forwardedFor: '198.51.100.9' });
  });
});
