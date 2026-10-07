import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';
import { REQUEST_TIMEOUT_MS, requestTimeout } from './requestTimeout.js';

function captureLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('debug', stream), output: () => chunks.join('') };
}

function appWithHandlerTaking(durationMs: number, timeoutMs: number) {
  const { logger, output } = captureLogger();
  let lateResponseAttempted = false;
  const app = express();
  app.use(requestTimeout(timeoutMs));
  app.get('/api/slow', async (_req, res) => {
    await sleep(durationMs);
    lateResponseAttempted = true;
    res.json({ success: true, data: 'tarde' });
  });
  app.use(errorHandler(logger));
  return { app, output, wasLateResponseAttempted: () => lateResponseAttempted };
}

describe('requestTimeout', () => {
  it('uses a 10 second limit by default', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it('responds 503 REQUEST_TIMEOUT when the handler exceeds the limit', async () => {
    const { app } = appWithHandlerTaking(200, 50);

    const response = await request(app).get('/api/slow');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'REQUEST_TIMEOUT', message: expect.any(String) },
    });
  });

  it('discards the late response of the handler without logging errors', async () => {
    const { app, output, wasLateResponseAttempted } = appWithHandlerTaking(100, 30);

    await request(app).get('/api/slow');
    await sleep(150);

    expect(wasLateResponseAttempted()).toBe(true);
    expect(output()).not.toMatch(/headers/i);
    expect(output()).not.toContain('"level":"error"');
  });

  it('lets fast handlers respond normally', async () => {
    const { app } = appWithHandlerTaking(0, 200);

    const response = await request(app).get('/api/slow');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: 'tarde' });
  });

  it('does not respond again when the handler already started streaming', async () => {
    const app = express();
    app.use(requestTimeout(30));
    app.get('/api/stream', async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('inicio;');
      await sleep(80);
      res.end('fin');
    });

    const response = await request(app).get('/api/stream');

    expect(response.status).toBe(200);
    expect(response.text).toBe('inicio;fin');
  });

  it('is wired into the application with an injectable limit', async () => {
    const app = createApp({
      databasePing: { ping: () => new Promise<boolean>(() => {}) },
      logger: createLogger('silent'),
      requestTimeoutMs: 50,
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('REQUEST_TIMEOUT');
  });
});
