import { describe, expect, it, vi } from 'vitest';
import { runSmoke } from '../../scripts/smoke.mjs';

const BASE_URL = 'https://app.calendarschools.es';
const API_URL = 'https://abc123.execute-api.eu-central-1.amazonaws.com';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const health = () => json(200, { success: true, data: { status: 'ok', database: 'up' } });
const notFound = () =>
  json(404, {
    success: false,
    error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe' },
  });
const originRejected = () =>
  json(403, { success: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'No permitido' } });
const page = () =>
  new Response('<!doctype html><div id="root"></div>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

type Route = () => Response | Promise<Response>;

/** `fetch` simulado: cada método y URL tiene su respuesta, o una lista que se consume en orden. */
function fakeFetch(routes: Record<string, Route | Route[]>) {
  const calls: string[] = [];
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url as string}`;
    calls.push(key);
    const route = routes[key];
    const next = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
    if (next === undefined) {
      return Promise.reject(new Error(`Petición inesperada: ${key}`));
    }
    return Promise.resolve(next());
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const healthyRoutes = (): Record<string, Route | Route[]> => ({
  [`GET ${BASE_URL}/`]: page,
  [`GET ${BASE_URL}/api/health`]: health,
  [`POST ${BASE_URL}/api/auth/register`]: notFound,
  [`GET ${API_URL}/api/health`]: originRejected,
});

/** Reloj simulado: `sleep` lo adelanta, así que los reintentos no esperan de verdad. */
function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: (ms: number) => Promise.resolve((current += ms)),
  };
}

const quiet = { log: () => {} };

describe('runSmoke', () => {
  it('passes when the site is healthy, the registration is closed and execute-api is protected', async () => {
    const { fetch, calls } = fakeFetch(healthyRoutes());

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual(
      expect.arrayContaining([
        `GET ${BASE_URL}/api/health`,
        `POST ${BASE_URL}/api/auth/register`,
        `GET ${API_URL}/api/health`,
      ]),
    );
  });

  it('retries until the health check answers 200, to wait for CloudFront to propagate', async () => {
    const routes = healthyRoutes();
    routes[`GET ${BASE_URL}/api/health`] = [
      () => json(403, { message: 'Forbidden' }),
      () => json(503, { success: false, error: { code: 'DATABASE_UNAVAILABLE' } }),
      health,
    ];
    const { fetch, calls } = fakeFetch(routes);

    await runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet });

    expect(calls.filter((call) => call === `GET ${BASE_URL}/api/health`)).toHaveLength(3);
  });

  it('retries when the request itself fails, as when the DNS is not ready yet', async () => {
    const routes = healthyRoutes();
    routes[`GET ${BASE_URL}/api/health`] = [
      () => Promise.reject(new TypeError('fetch failed')),
      health,
    ];
    const { fetch } = fakeFetch(routes);

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet }),
    ).resolves.toBeUndefined();
  });

  it('fails after 2 minutes naming the check and what it received', async () => {
    const routes = healthyRoutes();
    routes[`GET ${BASE_URL}/api/health`] = () =>
      json(503, { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'x' } });
    const { fetch, calls } = fakeFetch(routes);
    const clock = fakeClock();

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...clock, ...quiet }),
    ).rejects.toThrow(/GET \/api\/health.*503.*DATABASE_UNAVAILABLE/s);

    expect(clock.now()).toBeGreaterThanOrEqual(120_000);
    expect(clock.now()).toBeLessThanOrEqual(130_000);
    expect(calls.filter((call) => call === `GET ${BASE_URL}/api/health`).length).toBeGreaterThan(5);
  });

  it('fails when the health check says the database is down even with a 200', async () => {
    const routes = healthyRoutes();
    routes[`GET ${BASE_URL}/api/health`] = () =>
      json(200, { success: true, data: { status: 'ok', database: 'down' } });
    const { fetch } = fakeFetch(routes);

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet }),
    ).rejects.toThrow(/database/);
  });

  it('fails when the registration is reachable, because it must stay closed', async () => {
    const routes = healthyRoutes();
    routes[`POST ${BASE_URL}/api/auth/register`] = () =>
      json(422, { success: false, error: { code: 'VALIDATION_ERROR' } });
    const { fetch } = fakeFetch(routes);

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet }),
    ).rejects.toThrow(/POST \/api\/auth\/register.*422/s);
  });

  it('fails when execute-api answers without X-Origin-Verify', async () => {
    const routes = healthyRoutes();
    routes[`GET ${API_URL}/api/health`] = health;
    const { fetch } = fakeFetch(routes);

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet }),
    ).rejects.toThrow(/execute-api.*200/s);
  });

  it('fails when the frontend does not serve the page', async () => {
    const routes = healthyRoutes();
    routes[`GET ${BASE_URL}/`] = () => new Response('Forbidden', { status: 403 });
    const { fetch } = fakeFetch(routes);

    await expect(
      runSmoke({ baseUrl: BASE_URL, apiUrl: API_URL, fetch, ...fakeClock(), ...quiet }),
    ).rejects.toThrow(/GET \/ .*403/s);
  });

  it('reports every failing check, not only the first one', async () => {
    const routes = healthyRoutes();
    routes[`POST ${BASE_URL}/api/auth/register`] = () => json(201, { success: true });
    routes[`GET ${API_URL}/api/health`] = health;
    const { fetch } = fakeFetch(routes);

    const error = await runSmoke({
      baseUrl: BASE_URL,
      apiUrl: API_URL,
      fetch,
      ...fakeClock(),
      ...quiet,
    }).catch((e: unknown) => e as Error);

    expect((error as Error).message).toMatch(/register/);
    expect((error as Error).message).toMatch(/execute-api/);
  });

  it('skips the execute-api check when no URL is given', async () => {
    const routes = healthyRoutes();
    delete routes[`GET ${API_URL}/api/health`];
    const { fetch } = fakeFetch(routes);

    await expect(
      runSmoke({ baseUrl: BASE_URL, fetch, ...fakeClock(), ...quiet }),
    ).resolves.toBeUndefined();
  });
});
