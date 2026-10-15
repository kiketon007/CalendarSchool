import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createLogger } from './infrastructure/logger.js';
import { defaultDependencies, TEST_APP_ORIGIN } from '../test/support/appDoubles.js';

function app(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    ...defaultDependencies,
    databasePing: { ping: () => Promise.resolve(true) },
    logger: createLogger('silent'),
    ...overrides,
  });
}

describe('Cache-Control of the API', () => {
  it('forbids caching a successful response', async () => {
    const response = await request(app()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('forbids caching an unknown route under /api', async () => {
    const response = await request(app()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('forbids caching the error of a body the parser rejects', async () => {
    const response = await request(app())
      .post('/api/auth/refresh')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('forbids caching an unexpected error', async () => {
    const failing = app({ databasePing: { ping: () => Promise.reject(new Error('inesperado')) } });

    const response = await request(failing).get('/api/health');

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('forbids caching the response of a route that sets nothing itself', async () => {
    const response = await request(app())
      .post('/api/auth/refresh')
      .set('Origin', 'https://malicioso.example');

    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('keeps the public cache of GET /api/municipalities when it succeeds', async () => {
    const withMunicipalities = app({
      listMunicipalities: { execute: () => Promise.resolve([]) },
    });

    const response = await request(withMunicipalities).get('/api/municipalities');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('does not cache a failed GET /api/municipalities', async () => {
    const response = await request(app()).get('/api/municipalities').set('Origin', TEST_APP_ORIGIN);

    expect(response.status).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
