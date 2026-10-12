import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';
import { createLogger } from '../logger.js';
import { createPrismaClient, type PrismaClient } from './createPrismaClient.js';
import { PrismaDatabasePing } from './prismaDatabasePing.js';

const CONNECTION_TIMEOUT_MS = 300;
const logger = createLogger('silent');

/** Servidor TCP que acepta conexiones y nunca responde: una base de datos colgada. */
let hungServer: Server;
let sockets: Socket[];
let prisma: PrismaClient;

beforeEach(async () => {
  sockets = [];
  hungServer = createServer((socket) => {
    sockets.push(socket);
    socket.on('error', () => {});
  });
  await new Promise<void>((resolve) => hungServer.listen(0, '127.0.0.1', resolve));
  const { port } = hungServer.address() as { port: number };

  prisma = createPrismaClient({
    connectionString: `postgresql://user:secret@127.0.0.1:${port}/calendarschool`,
    poolMax: 1,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
});

afterEach(async () => {
  await prisma.$disconnect();
  sockets.forEach((socket) => socket.destroy());
  await new Promise((resolve) => hungServer.close(resolve));
});

describe('connection timeout with a database that does not answer', () => {
  it('fails every query within the timeout, without piling up pending connections', async () => {
    const ping = new PrismaDatabasePing(prisma, logger);
    const startedAt = Date.now();

    const results = await Promise.all([ping.ping(), ping.ping(), ping.ping()]);
    const elapsedMs = Date.now() - startedAt;

    expect(results).toEqual([false, false, false]);
    // Con un pool de 1, las consultas esperan turno, pero ninguna se queda colgada para siempre.
    expect(elapsedMs).toBeLessThan(CONNECTION_TIMEOUT_MS * 3 + 1500);
    expect(sockets.length).toBeLessThanOrEqual(3);
  });

  it('answers GET /api/health with 503 DATABASE_UNAVAILABLE in about the connection timeout', async () => {
    const app = createApp({
      databasePing: new PrismaDatabasePing(prisma, logger),
      logger,
      ...defaultDependencies,
    });
    const startedAt = Date.now();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(Date.now() - startedAt).toBeLessThan(1900);
  });
});
