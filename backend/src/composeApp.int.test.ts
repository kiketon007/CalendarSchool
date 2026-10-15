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

  describe('the login', () => {
    const ORIGIN = 'http://localhost:5173';
    const attempt = {
      email: 'nadie@example.com',
      password: 'Secreta123!',
      captcha: { version: 'v3', token: 'e2e' },
    };

    it('is wired: an empty body is a 400 VALIDATION_ERROR and costs no attempt', async () => {
      const { app } = composeApp(config, { logger, prisma: testPrisma });

      const response = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({});

      expect(response.status).toBe(400);
      expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      expect(await testPrisma.rateLimitAttempt.count()).toBe(0);
    });

    it('uses the failed attempts maximum of the configuration', async () => {
      const { app } = composeApp(
        { ...config, loginAttemptsMax: 1 },
        { logger, prisma: testPrisma },
      );
      const send = () => request(app).post('/api/auth/login').set('Origin', ORIGIN).send(attempt);

      const first = await send();
      const second = await send();

      expect(first.status).toBe(401);
      expect((first.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
      expect(second.status).toBe(429);
      expect(second.headers['retry-after']).toBeDefined();
      expect(
        await testPrisma.rateLimitAttempt.count({ where: { key: { startsWith: 'login:' } } }),
      ).toBe(1);
    });
  });
});
