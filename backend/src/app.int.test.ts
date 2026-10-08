import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testPrisma } from '../test/support/testPrisma.js';
import { createApp } from './app.js';
import { createLogger } from './infrastructure/logger.js';
import { PrismaDatabasePing } from './infrastructure/prisma/prismaDatabasePing.js';
import { unusedUseCases } from '../test/support/appDoubles.js';

describe('GET /api/health against the test database', () => {
  it('responds 200 with the database up', async () => {
    const logger = createLogger('silent');
    const app = createApp({
      databasePing: new PrismaDatabasePing(testPrisma, logger),
      logger,
      ...unusedUseCases,
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
  });
});
