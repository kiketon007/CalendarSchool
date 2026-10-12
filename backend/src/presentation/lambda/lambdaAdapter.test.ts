import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import express from 'express';
import { describe, expect, it } from 'vitest';
import type { RegisterSchoolResult } from '../../application/registration/registerSchool.js';
import { createApp } from '../../app.js';
import { createLambdaHandler } from './lambdaAdapter.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const logger = createLogger('silent');

const registered: RegisterSchoolResult = {
  registration: {
    user: { id: 'u1', email: 'ana@example.com', firstName: 'Ana', lastName: 'Pérez' },
    school: {
      id: 's1',
      name: 'CEIP Prueba',
      municipality: { code: '46250', name: 'València', province: 'València' },
    },
  },
  refreshToken: 'opaque-refresh-token',
};

function handler() {
  const app = createApp({
    databasePing: { ping: () => Promise.resolve(true) },
    logger,
    ...defaultDependencies,
    registerSchool: { execute: () => Promise.resolve(registered) },
  });
  return createLambdaHandler(app);
}

/** Evento de la HTTP API de API Gateway con payload 2.0, como lo envía con `ANY /{proxy+}`. */
function event(overrides: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}): APIGatewayProxyEventV2 {
  const { method, path, headers = {}, body, isBase64Encoded = false } = overrides;
  return {
    version: '2.0',
    routeKey: 'ANY /{proxy+}',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'abc.execute-api.eu-central-1.amazonaws.com', ...headers },
    requestContext: {
      accountId: '123456789012',
      apiId: 'abc',
      domainName: 'abc.execute-api.eu-central-1.amazonaws.com',
      domainPrefix: 'abc',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '203.0.113.9', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: 'ANY /{proxy+}',
      stage: '$default',
      time: '12/Oct/2026:09:00:00 +0000',
      timeEpoch: 1_791_795_600_000,
    },
    body,
    isBase64Encoded,
  };
}

async function invoke(e: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return await handler()(e, {});
}

describe('Lambda adapter over createApp (HTTP API payload 2.0)', () => {
  it('answers GET /api/health with the common response body', async () => {
    const result = await invoke(event({ method: 'GET', path: '/api/health' }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '')).toEqual({
      success: true,
      data: { status: 'ok', database: 'up' },
    });
  });

  it('parses a JSON body received in base64', async () => {
    const payload = JSON.stringify({ schoolName: 'CEIP Prueba' });
    const result = await invoke(
      event({
        method: 'POST',
        path: '/api/auth/register',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(payload).toString('base64'),
        isBase64Encoded: true,
      }),
    );

    expect(result.statusCode).toBe(201);
  });

  it('returns the Set-Cookie header in the cookies array of the response', async () => {
    const result = await invoke(
      event({
        method: 'POST',
        path: '/api/auth/register',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );

    expect(result.statusCode).toBe(201);
    expect(result.cookies).toHaveLength(1);
    expect(result.cookies?.[0]).toMatch(/^refresh_token=opaque-refresh-token;/);
    expect(result.cookies?.[0]).toMatch(/HttpOnly/);
    expect(result.headers).not.toHaveProperty('set-cookie');
  });

  it('keeps every cookie separate when the app sets several', async () => {
    const app = express();
    app.get('/two', (_req, res) => {
      res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
      res.end();
    });
    app.get('/one', (_req, res) => {
      res.setHeader('Set-Cookie', 'c=3; Path=/');
      res.end();
    });
    const lambda = createLambdaHandler(app);
    const call = async (path: string) =>
      (await lambda(event({ method: 'GET', path }), {})) as APIGatewayProxyStructuredResultV2;

    expect((await call('/two')).cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect((await call('/one')).cookies).toEqual(['c=3; Path=/']);
  });

  it('forwards the cookies of the event to Express as a Cookie header', async () => {
    const app = express();
    app.get('/echo', (req, res) => {
      res.json({ cookie: req.get('cookie') });
    });
    const result = (await createLambdaHandler(app)(
      { ...event({ method: 'GET', path: '/echo' }), cookies: ['a=1', 'b=2'] },
      {},
    )) as APIGatewayProxyStructuredResultV2;

    expect(JSON.parse(result.body ?? '')).toEqual({ cookie: 'a=1; b=2' });
  });

  it('answers an unknown API route with the common 404 body', async () => {
    const result = await invoke(event({ method: 'GET', path: '/api/nope' }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body ?? '').error.code).toBe('NOT_FOUND');
  });
});
