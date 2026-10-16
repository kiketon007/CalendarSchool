import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';

function registerBody(overrides: { schoolName: string; email: string }) {
  return {
    schoolName: overrides.schoolName,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
    email: overrides.email,
    password: PASSWORD,
    privacyPolicyAccepted: true,
    captcha: { version: 'v3', token: 'token-provisional' },
  };
}

type App = ReturnType<typeof realApp>['app'];

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio con su administrador y devuelve su cookie, su id y el de su colegio. */
async function register(app: App, schoolName: string, email: string) {
  const response = await request(app)
    .post('/api/auth/register')
    .send(registerBody({ schoolName, email }));
  expect(response.status).toBe(201);
  const data = (response.body as { data: { user: { id: string }; school: { id: string } } }).data;
  return { cookie: cookieOf(response), userId: data.user.id, schoolId: data.school.id };
}

/** Renueva la sesión con la cookie y devuelve el access token, como hace el frontend. */
async function accessTokenFor(app: App, cookie: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookie);
  expect(response.status).toBe(200);
  return (response.body as { data: { session: { accessToken: string } } }).data.session.accessToken;
}

function listUsers(app: App, accessToken: string) {
  return request(app).get('/api/users').set('Authorization', `Bearer ${accessToken}`);
}

async function addMember(schoolId: string, email: string, lastName: string) {
  await testPrisma.user.create({
    data: {
      id: crypto.randomUUID(),
      schoolId,
      email,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: 'Miembro',
      lastName,
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });
}

describe('GET /api/users against the test database', () => {
  it('lists the administrator that has just registered', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app, 'CEIP Lluís Vives', 'jose@example.com');

    const response = await listUsers(app, await accessTokenFor(app, cookie));

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown[] }).data).toEqual([
      expect.objectContaining({
        id: userId,
        email: 'jose@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    ]);
  });

  it('only lists the users of the school of the administrator, with two schools', async () => {
    const { app } = realApp();
    const first = await register(app, 'CEIP Uno', 'uno@example.com');
    const second = await register(app, 'CEIP Dos', 'dos@example.com');
    await addMember(first.schoolId, 'miembro1@example.com', 'Primero');
    await addMember(second.schoolId, 'miembro2@example.com', 'Segundo');

    const response = await listUsers(app, await accessTokenFor(app, first.cookie));

    const emails = (response.body as { data: { email: string }[] }).data.map((user) => user.email);
    expect(emails.sort()).toEqual(['miembro1@example.com', 'uno@example.com']);
  });

  it('leaves out the deleted users and keeps the suspended ones', async () => {
    const { app } = realApp();
    const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
    await addMember(schoolId, 'baja@example.com', 'Baja');
    await addMember(schoolId, 'eliminado@example.com', 'Eliminado');
    await testPrisma.user.update({
      where: { email: 'baja@example.com' },
      data: { status: 'SUSPENDED' },
    });
    await testPrisma.user.update({
      where: { email: 'eliminado@example.com' },
      data: { status: 'DELETED' },
    });

    const response = await listUsers(app, await accessTokenFor(app, cookie));

    const users = (response.body as { data: { email: string; status: string }[] }).data;
    expect(users.map((user) => [user.email, user.status]).sort()).toEqual([
      ['baja@example.com', 'SUSPENDED'],
      ['uno@example.com', 'ACTIVE'],
    ]);
  });

  it('rejects with 401 the access token of a session that has been logged out', async () => {
    const { app } = realApp();
    const { cookie } = await register(app, 'CEIP Uno', 'uno@example.com');
    const accessToken = await accessTokenFor(app, cookie);
    expect((await listUsers(app, accessToken)).status).toBe(200);

    await request(app)
      .post('/api/auth/logout')
      .set('Origin', TEST_APP_ORIGIN)
      .set('Cookie', cookie)
      .expect(204);

    const response = await listUsers(app, accessToken);
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect((response.body as { error: { code: string } }).error.code).toBe('INVALID_SESSION');
  });

  it('rejects with 401 the access token of a user that has been suspended', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app, 'CEIP Uno', 'uno@example.com');
    const accessToken = await accessTokenFor(app, cookie);

    await testPrisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    expect((await listUsers(app, accessToken)).status).toBe(401);
  });

  it('reads the role from the database: a demotion takes effect with the old token', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app, 'CEIP Uno', 'uno@example.com');
    const accessToken = await accessTokenFor(app, cookie);
    expect((await listUsers(app, accessToken)).status).toBe(200);

    await testPrisma.user.update({ where: { id: userId }, data: { role: 'MEMBER' } });

    const response = await listUsers(app, accessToken);
    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('reads the role from the database: a promotion takes effect with a token issued as member', async () => {
    const { app } = realApp();
    const { cookie, userId } = await register(app, 'CEIP Uno', 'uno@example.com');
    await testPrisma.user.update({ where: { id: userId }, data: { role: 'MEMBER' } });
    const accessToken = await accessTokenFor(app, cookie);
    expect((await listUsers(app, accessToken)).status).toBe(403);

    await testPrisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });

    expect((await listUsers(app, accessToken)).status).toBe(200);
  });

  it('rejects with 401 a token signed for a session that does not exist', async () => {
    const { app, tokenIssuer } = realApp();
    const accessToken = await tokenIssuer.issueAccessToken({
      userId: crypto.randomUUID(),
      schoolId: crypto.randomUUID(),
      role: 'ADMIN',
      sessionId: crypto.randomUUID(),
    });

    expect((await listUsers(app, accessToken)).status).toBe(401);
  });
});

describe('GET /api/users with a database that closes the connection', () => {
  let closingServer: Server;
  const sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => closingServer.close(resolve));
  });

  it('answers 503 DATABASE_UNAVAILABLE, not 401, for a valid token', async () => {
    closingServer = createServer((socket) => {
      sockets.push(socket);
      socket.on('error', () => {});
      socket.once('data', () => socket.destroy());
    });
    await new Promise<void>((resolve) => closingServer.listen(0, '127.0.0.1', resolve));
    const { port } = closingServer.address() as { port: number };
    const prisma = createPrismaClient({
      connectionString: `postgresql://user:secret@127.0.0.1:${port}/calendarschool`,
      poolMax: 1,
      connectionTimeoutMillis: 2000,
    });
    const { app, tokenIssuer } = realApp({ prisma });
    const accessToken = await tokenIssuer.issueAccessToken({
      userId: crypto.randomUUID(),
      schoolId: crypto.randomUUID(),
      role: 'ADMIN',
      sessionId: crypto.randomUUID(),
    });

    const response = await listUsers(app, accessToken);

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    await prisma.$disconnect();
  });
});
