import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies, TEST_APP_ORIGIN } from '../../../test/support/appDoubles.js';

const REFRESH_TOKEN = 'plain-refresh-token';
const CLEARED_COOKIE = 'refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax';

describe('POST /api/auth/logout', () => {
  let execute: ReturnType<typeof vi.fn<AppDependencies['logOut']['execute']>>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    execute = vi.fn<AppDependencies['logOut']['execute']>().mockResolvedValue(undefined);
    app = createApp({
      ...defaultDependencies,
      logOut: { execute },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  /** Petición de cierre de sesión desde el origen de la aplicación, con la cookie indicada (`null`: sin cookie). */
  function logout(cookie: string | null = `refresh_token=${REFRESH_TOKEN}`) {
    const pending = request(app).post('/api/auth/logout').set('Origin', TEST_APP_ORIGIN);
    return cookie === null ? pending : pending.set('Cookie', cookie);
  }

  it('responds 204 without a body and clears the cookie with the attributes it was created with', async () => {
    const response = await logout();

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.headers['set-cookie']).toEqual([CLEARED_COOKIE]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('passes the cookie token, the client ip and the user agent to the use case', async () => {
    await logout(`theme=dark; refresh_token=${REFRESH_TOKEN}`).set('User-Agent', 'Mozilla/5.0');

    expect(execute).toHaveBeenCalledWith(REFRESH_TOKEN, {
      ip: expect.stringMatching(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/) as string,
      userAgent: 'Mozilla/5.0',
    });
  });

  it('responds 204 and clears the cookie when the request carries none', async () => {
    const response = await logout(null);

    expect(response.status).toBe(204);
    expect(execute).toHaveBeenCalledWith(undefined, expect.any(Object));
    expect(response.headers['set-cookie']).toEqual([CLEARED_COOKIE]);
  });

  it.each([
    ['another origin', 'https://malicioso.example'],
    ['no origin', undefined],
  ])(
    'responds 403 ORIGIN_NOT_ALLOWED from %s without calling the use case or clearing the cookie',
    async (_case, origin) => {
      const pending = request(app)
        .post('/api/auth/logout')
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

    const response = await logout();

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('enables no CORS for another origin', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://malicioso.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
