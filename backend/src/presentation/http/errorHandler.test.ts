import { Writable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';

function captureLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('error', stream), output: () => chunks.join('') };
}

const app = createApp({
  databasePing: { ping: () => Promise.resolve(true) },
  logger: createLogger('silent'),
});

describe('unknown routes under /api', () => {
  it('respond 404 NOT_FOUND as JSON instead of the default HTML page', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});

describe('malformed JSON bodies', () => {
  it('respond 400 INVALID_JSON', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INVALID_JSON', message: expect.any(String) },
    });
  });
});

describe('bodies rejected by the JSON parser', () => {
  function appCapturingErrors() {
    const { logger, output } = captureLogger();
    const app = createApp({ databasePing: { ping: () => Promise.resolve(true) }, logger });
    return { app, output };
  }

  it('respond 413 PAYLOAD_TOO_LARGE when the body exceeds 100 KB, without error logs', async () => {
    const { app, output } = appCapturingErrors();

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(101 * 1024) }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) },
    });
    expect(output()).toBe('');
  });

  it('respond 415 UNSUPPORTED_MEDIA_TYPE for an unsupported charset, without error logs', async () => {
    const { app, output } = appCapturingErrors();

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json; charset=latin-9')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: expect.any(String) },
    });
    expect(output()).toBe('');
  });

  it('respond 415 UNSUPPORTED_MEDIA_TYPE for an unsupported content encoding', async () => {
    const { app, output } = appCapturingErrors();

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress-unknown')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(output()).toBe('');
  });
});

describe('unhandled errors', () => {
  function appThrowing(error: Error) {
    const { logger, output } = captureLogger();
    const failingApp = express();
    // Handler que rechaza de forma asíncrona: Express 5 lo envía al manejador de errores.
    failingApp.get('/api/boom', () => Promise.reject(error));
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 500 INTERNAL_ERROR without the original message or stack', async () => {
    const { failingApp } = appThrowing(new Error('secreto interno en la traza'));

    const response = await request(failingApp).get('/api/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('secreto interno');
  });

  it('log the stack trace of the error', async () => {
    const { failingApp, output } = appThrowing(new Error('secreto interno en la traza'));

    await request(failingApp).get('/api/boom');

    expect(output()).toContain('secreto interno en la traza');
    expect(output()).toContain('"stack"');
  });
});
