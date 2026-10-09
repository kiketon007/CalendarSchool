import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { RefreshSessionResult } from '../../application/session/refreshSession.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies, TEST_APP_ORIGIN } from '../../../test/support/appDoubles.js';

const REFRESH_TOKEN = 'plain-refresh-token';
const CLEARED_COOKIE = 'refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax';

const refreshed: RefreshSessionResult = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

describe('POST /api/auth/refresh', () => {
  let execute: ReturnType<typeof vi.fn<AppDependencies['refreshSession']['execute']>>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    execute = vi.fn<AppDependencies['refreshSession']['execute']>().mockResolvedValue(refreshed);
    app = createApp({
      ...defaultDependencies,
      refreshSession: { execute },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  /** Petición de refresh desde el origen de la aplicación, con la cookie indicada (`null`: sin cookie). */
  function refresh(cookie: string | null = `refresh_token=${REFRESH_TOKEN}`) {
    const pending = request(app).post('/api/auth/refresh').set('Origin', TEST_APP_ORIGIN);
    return cookie === null ? pending : pending.set('Cookie', cookie);
  }

  it('responds 200 with the session, the user and the school, and forbids caching', async () => {
    const response = await refresh();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: refreshed });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain(REFRESH_TOKEN);
  });

  it('neither rotates nor rewrites the cookie when it succeeds', async () => {
    const response = await refresh();

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('passes the cookie token, the client ip and the user agent to the use case', async () => {
    await refresh(`theme=dark; refresh_token=${REFRESH_TOKEN}`).set('User-Agent', 'Mozilla/5.0');

    expect(execute).toHaveBeenCalledWith(REFRESH_TOKEN, {
      ip: expect.stringMatching(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/) as string,
      userAgent: 'Mozilla/5.0',
    });
  });

  it('passes no token to the use case when the cookie is missing', async () => {
    execute.mockRejectedValueOnce(new InvalidSession('MISSING'));

    await refresh(null);

    expect(execute).toHaveBeenCalledWith(undefined, expect.any(Object));
  });

  it.each(['MISSING', 'UNKNOWN', 'REVOKED', 'EXPIRED', 'USER_INACTIVE'] as const)(
    'responds 401 INVALID_SESSION for %s, without the reason, and clears the cookie',
    async (reason) => {
      execute.mockRejectedValueOnce(new InvalidSession(reason));

      const response = await refresh();

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'INVALID_SESSION', message: expect.any(String) as string },
      });
      expect(JSON.stringify(response.body)).not.toContain(reason);
      expect(response.headers['set-cookie']).toEqual([CLEARED_COOKIE]);
    },
  );

  it.each([
    ['another origin', 'https://malicioso.example'],
    ['no origin', undefined],
  ])(
    'responds 403 ORIGIN_NOT_ALLOWED from %s without calling the use case',
    async (_case, origin) => {
      const pending = request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${REFRESH_TOKEN}`);
      const response = await (origin === undefined ? pending : pending.set('Origin', origin));

      expect(response.status).toBe(403);
      expect((response.body as { error: { code: string } }).error.code).toBe('ORIGIN_NOT_ALLOWED');
      expect(execute).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('responds 503 DATABASE_UNAVAILABLE and keeps the cookie', async () => {
    execute.mockRejectedValueOnce(new DatabaseUnavailable(new Error('caída')));

    const response = await refresh();

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('enables no CORS for another origin, neither in the request nor in a preflight', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://malicioso.example');
    const preflight = await request(app)
      .options('/api/auth/refresh')
      .set('Origin', 'https://malicioso.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
