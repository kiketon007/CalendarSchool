import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { TEST_APP_ORIGIN } from '../../../test/support/appDoubles.js';
import { realApp } from '../../../test/support/realApp.js';
import { createPrismaClient, type PrismaClient } from './createPrismaClient.js';
import { PrismaRefreshTokenRepository } from './prismaRefreshTokenRepository.js';

/**
 * Servidor que acepta la conexión y la cierra al recibir el mensaje de arranque de PostgreSQL: lo
 * mismo que hace el proxy de puertos de Docker cuando el contenedor de la base de datos está parado.
 * `pg` lo señala con un `Error` sin código («Connection terminated unexpectedly»).
 */
let closingServer: Server;
let sockets: Socket[];
let prisma: PrismaClient;

beforeEach(async () => {
  sockets = [];
  closingServer = createServer((socket) => {
    sockets.push(socket);
    socket.on('error', () => {});
    socket.once('data', () => socket.destroy());
  });
  await new Promise<void>((resolve) => closingServer.listen(0, '127.0.0.1', resolve));
  const { port } = closingServer.address() as { port: number };

  prisma = createPrismaClient({
    connectionString: `postgresql://user:secret@127.0.0.1:${port}/calendarschool`,
    poolMax: 1,
    connectionTimeoutMillis: 2000,
  });
});

afterEach(async () => {
  await prisma.$disconnect();
  sockets.forEach((socket) => socket.destroy());
  await new Promise((resolve) => closingServer.close(resolve));
});

describe('a database that closes the connection while it is being used', () => {
  it('makes findByHash throw DatabaseUnavailable', async () => {
    await expect(
      new PrismaRefreshTokenRepository(prisma).findByHash('a'.repeat(64)),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });

  it('makes revoke throw DatabaseUnavailable', async () => {
    await expect(
      new PrismaRefreshTokenRepository(prisma).revoke(
        '0192f5a0-0000-7000-8000-0000000000b1',
        new Date(),
      ),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });

  it('answers POST /api/auth/logout with 503 and keeps the cookie', async () => {
    const { app } = realApp({ prisma });

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', TEST_APP_ORIGIN)
      .set('Cookie', 'refresh_token=some-token');

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('answers POST /api/auth/refresh with 503 and keeps the cookie', async () => {
    const { app } = realApp({ prisma });

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', TEST_APP_ORIGIN)
      .set('Cookie', 'refresh_token=some-token');

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
