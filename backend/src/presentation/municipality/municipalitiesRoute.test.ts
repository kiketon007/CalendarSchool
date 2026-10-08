import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Municipality } from '../../domain/municipality/municipality.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { unusedUseCases } from '../../../test/support/appDoubles.js';

const municipalities: Municipality[] = [
  { code: '03014', name: 'Alacant/Alicante', province: 'Alicante/Alacant' },
  { code: '46250', name: 'València', province: 'Valencia/València' },
];

function appListing(execute: AppDependencies['listMunicipalities']['execute']) {
  return createApp({
    ...unusedUseCases,
    listMunicipalities: { execute },
    databasePing: { ping: () => Promise.resolve(true) },
    logger: createLogger('silent'),
  });
}

describe('GET /api/municipalities', () => {
  it('responds 200 with the municipalities, without authentication', async () => {
    const response = await request(appListing(vi.fn().mockResolvedValue(municipalities))).get(
      '/api/municipalities',
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ success: true, data: municipalities });
  });

  it('is cacheable by any client for at least a day', async () => {
    const response = await request(appListing(vi.fn().mockResolvedValue(municipalities))).get(
      '/api/municipalities',
    );

    const cacheControl = response.headers['cache-control'] as string;
    expect(cacheControl).toContain('public');
    expect(Number(/max-age=(\d+)/.exec(cacheControl)?.[1])).toBeGreaterThanOrEqual(86400);
  });

  it('does not cache error responses', async () => {
    const response = await request(
      appListing(vi.fn().mockRejectedValue(new Error('fallo inesperado'))),
    ).get('/api/municipalities');

    expect(response.status).toBe(500);
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
