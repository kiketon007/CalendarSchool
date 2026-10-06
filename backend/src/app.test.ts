import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DatabasePing } from './application/health/databasePing.js';
import { createApp } from './app.js';
import { createLogger } from './infrastructure/logger.js';

const logger = createLogger('silent');

function appWithDatabase(isUp: boolean) {
  const databasePing: DatabasePing = { ping: () => Promise.resolve(isUp) };
  return createApp({ databasePing, logger });
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

  it('never exposes internal details in the response', async () => {
    const response = await request(appWithDatabase(false)).get('/api/health');
    const body = JSON.stringify(response.body).toLowerCase();

    for (const detail of ['postgres', 'localhost', '5432', 'password', 'stack']) {
      expect(body).not.toContain(detail);
    }
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
