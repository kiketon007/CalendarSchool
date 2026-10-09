import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DatabasePing } from './application/health/databasePing.js';
import { createApp } from './app.js';
import { createLogger } from './infrastructure/logger.js';
import { defaultDependencies } from '../test/support/appDoubles.js';

const logger = createLogger('silent');

function appWithDatabase(isUp: boolean) {
  const databasePing: DatabasePing = { ping: () => Promise.resolve(isUp) };
  return createApp({ databasePing, logger, ...defaultDependencies });
}

describe('GET /api/health', () => {
  it('responds 200 with the service and database status', async () => {
    const response = await request(appWithDatabase(true)).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
  });

  it('responds 503 DATABASE_UNAVAILABLE when the database is down', async () => {
    const response = await request(appWithDatabase(false)).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: expect.any(String) },
    });
  });

  it('responds 503 DATABASE_UNAVAILABLE after about 2 seconds when the database hangs', async () => {
    const hangingPing: DatabasePing = { ping: () => new Promise<boolean>(() => {}) };
    const app = createApp({ databasePing: hangingPing, logger, ...defaultDependencies });
    const startedAt = Date.now();

    const response = await request(app).get('/api/health');
    const elapsedMs = Date.now() - startedAt;

    // El timeout propio del ping (2 s) salta antes que el de la petición (10 s).
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(elapsedMs).toBeGreaterThanOrEqual(1900);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('never exposes internal details in the response', async () => {
    const response = await request(appWithDatabase(false)).get('/api/health');
    const body = JSON.stringify(response.body).toLowerCase();

    for (const detail of ['postgres', 'localhost', '5432', 'password', 'stack']) {
      expect(body).not.toContain(detail);
    }
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
