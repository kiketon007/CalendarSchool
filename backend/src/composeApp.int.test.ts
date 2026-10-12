import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testDatabaseUrl, testPrisma } from '../test/support/testPrisma.js';
import { composeApp } from './composeApp.js';
import { loadConfig, type AppConfig } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';

const config: AppConfig = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'integration-only-jwt-secret-0123456789',
  APP_ORIGIN: 'http://localhost:5173',
});
const logger = createLogger('silent');

describe('composeApp', () => {
  it('wires the real application: GET /api/health answers 200 against the test database', async () => {
    const { app, prisma } = composeApp(config, { logger, poolMax: 1 });

    try {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('uses the Prisma client it is given instead of creating its own', () => {
    const { prisma } = composeApp(config, { logger, prisma: testPrisma });

    expect(prisma).toBe(testPrisma);
  });

  it('requires X-Origin-Verify when the configuration has ORIGIN_VERIFY_SECRET', async () => {
    const secret = 'origin-verify-secret-0123456789abcdef';
    const { app, prisma } = composeApp(
      { ...config, originVerifySecret: secret },
      { logger, prisma: testPrisma },
    );

    expect(prisma).toBe(testPrisma);
    expect((await request(app).get('/api/health')).status).toBe(403);
    expect((await request(app).get('/api/health').set('X-Origin-Verify', secret)).status).toBe(200);
  });
});
