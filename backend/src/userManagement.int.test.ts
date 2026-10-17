import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { BcryptPasswordHasher } from './infrastructure/bcryptPasswordHasher.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';

type App = ReturnType<typeof realApp>['app'];
type Role = 'ADMIN' | 'MEMBER';

let passwordHash: string;

beforeAll(async () => {
  // Un solo hash para todos los usuarios que crean los tests: el de la contraseña de siempre.
  passwordHash = await new BcryptPasswordHasher().hash(PASSWORD);
});

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

const code = (response: request.Response) =>
  (response.body as { error: { code: string } }).error.code;

/** Registra un colegio con su administrador y devuelve su cookie, su id y el de su colegio. */
async function register(app: App, schoolName: string, email: string) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      schoolName,
      municipalityCode: '46250',
      firstName: 'José María',
      lastName: 'García-López',
      email,
      password: PASSWORD,
      privacyPolicyAccepted: true,
      captcha: { version: 'v3', token: 'token-provisional' },
    });
  expect(response.status).toBe(201);
  const data = (response.body as { data: { user: { id: string }; school: { id: string } } }).data;
  return { cookie: cookieOf(response), userId: data.user.id, schoolId: data.school.id };
}

/** Crea un usuario del colegio con la contraseña de los tests, para que pueda iniciar sesión. */
async function createUser(schoolId: string, email: string, role: Role) {
  const id = crypto.randomUUID();
  await testPrisma.user.create({
    data: {
      id,
      schoolId,
      email,
      passwordHash,
      firstName: 'Miembro',
      lastName: 'Del colegio',
      role,
      status: 'ACTIVE',
    },
  });
  return id;
}

function login(app: App, email: string) {
  return request(app)
    .post('/api/auth/login')
    .set('Origin', TEST_APP_ORIGIN)
    .send({ email, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } });
}

function refresh(app: App, cookie: string) {
  return request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookie);
}

/** Renueva la sesión de la cookie y devuelve su access token, como hace el frontend. */
async function accessTokenOf(app: App, cookie: string): Promise<string> {
  const response = await refresh(app, cookie);
  expect(response.status).toBe(200);
  return (response.body as { data: { session: { accessToken: string } } }).data.session.accessToken;
}

/** Inicia una sesión nueva del usuario y devuelve su cookie y su access token. */
async function startSession(app: App, email: string) {
  const response = await login(app, email);
  expect(response.status).toBe(204);
  const cookie = cookieOf(response);
  return { cookie, accessToken: await accessTokenOf(app, cookie) };
}

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

function listUsers(app: App, accessToken: string) {
  return request(app).get('/api/users').set(bearer(accessToken));
}

function changeRole(app: App, accessToken: string, userId: string, role: unknown) {
  return request(app).put(`/api/users/${userId}/role`).set(bearer(accessToken)).send({ role });
}

function suspend(app: App, accessToken: string, userId: string) {
  return request(app).post(`/api/users/${userId}/suspend`).set(bearer(accessToken));
}

function reactivate(app: App, accessToken: string, userId: string) {
  return request(app).post(`/api/users/${userId}/reactivate`).set(bearer(accessToken));
}

async function stored(userId: string) {
  return testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
}

describe('user management against the test database', () => {
  describe('changing the role', () => {
    it('promotes a member: the token issued as member works as administrator from the next request', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const memberId = await createUser(schoolId, 'miembro@example.com', 'MEMBER');
      const member = await startSession(app, 'miembro@example.com');
      const adminToken = await accessTokenOf(app, cookie);
      expect((await listUsers(app, member.accessToken)).status).toBe(403);

      const response = await changeRole(app, adminToken, memberId, 'ADMIN');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        success: true,
        data: { id: memberId, role: 'ADMIN', status: 'ACTIVE', email: 'miembro@example.com' },
      });
      expect((await listUsers(app, member.accessToken)).status).toBe(200);
    });

    it('demotes another administrator without closing its sessions: its token gets 403', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const otherId = await createUser(schoolId, 'otro@example.com', 'ADMIN');
      const other = await startSession(app, 'otro@example.com');
      expect((await listUsers(app, other.accessToken)).status).toBe(200);

      const response = await changeRole(app, await accessTokenOf(app, cookie), otherId, 'MEMBER');

      expect(response.status).toBe(200);
      expect((await listUsers(app, other.accessToken)).status).toBe(403);
      expect((await refresh(app, other.cookie)).status).toBe(200);
      expect(await testPrisma.refreshToken.count({ where: { userId: otherId } })).toBe(1);
    });

    it('rejects the last administrator demoting themselves and changes nothing', async () => {
      const { app } = realApp();
      const { cookie, userId } = await register(app, 'CEIP Uno', 'uno@example.com');

      const response = await changeRole(app, await accessTokenOf(app, cookie), userId, 'MEMBER');

      expect(response.status).toBe(409);
      expect(code(response)).toBe('LAST_ADMIN_REQUIRED');
      expect((await stored(userId)).role).toBe('ADMIN');
    });

    it('lets an administrator demote themselves when another one stays active', async () => {
      const { app } = realApp();
      const { cookie, userId, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      await createUser(schoolId, 'otro@example.com', 'ADMIN');
      const token = await accessTokenOf(app, cookie);

      const response = await changeRole(app, token, userId, 'MEMBER');

      expect(response.status).toBe(200);
      expect((await listUsers(app, token)).status).toBe(403);
    });

    it('does not count a suspended administrator as the one that stays', async () => {
      const { app } = realApp();
      const { cookie, userId, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const suspendedAdmin = await createUser(schoolId, 'baja@example.com', 'ADMIN');
      await testPrisma.user.update({
        where: { id: suspendedAdmin },
        data: { status: 'SUSPENDED' },
      });

      const response = await changeRole(app, await accessTokenOf(app, cookie), userId, 'MEMBER');

      expect(response.status).toBe(409);
      expect(code(response)).toBe('LAST_ADMIN_REQUIRED');
    });

    it('rejects changing the role of a suspended user, even to the one it has', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const memberId = await createUser(schoolId, 'miembro@example.com', 'MEMBER');
      await testPrisma.user.update({ where: { id: memberId }, data: { status: 'SUSPENDED' } });
      const token = await accessTokenOf(app, cookie);

      for (const role of ['ADMIN', 'MEMBER']) {
        const response = await changeRole(app, token, memberId, role);
        expect(response.status).toBe(409);
        expect(code(response)).toBe('USER_NOT_ACTIVE');
      }
      expect((await stored(memberId)).role).toBe('MEMBER');
    });

    it('answers 200 without changes when the user already has the role', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const memberId = await createUser(schoolId, 'miembro@example.com', 'MEMBER');

      const response = await changeRole(app, await accessTokenOf(app, cookie), memberId, 'MEMBER');

      expect(response.status).toBe(200);
      expect((response.body as { data: { role: string } }).data.role).toBe('MEMBER');
    });

    it('answers 400 VALIDATION_ERROR to an unknown role', async () => {
      const { app } = realApp();
      const { cookie, userId } = await register(app, 'CEIP Uno', 'uno@example.com');

      const response = await changeRole(app, await accessTokenOf(app, cookie), userId, 'OWNER');

      expect(response.status).toBe(400);
      expect(code(response)).toBe('VALIDATION_ERROR');
    });
  });

  describe('suspending and reactivating', () => {
    it('suspends a member: its sessions are revoked and it can neither use its tokens nor log in', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const memberId = await createUser(schoolId, 'miembro@example.com', 'MEMBER');
      const first = await startSession(app, 'miembro@example.com');
      const second = await startSession(app, 'miembro@example.com');

      const response = await suspend(app, await accessTokenOf(app, cookie), memberId);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: { id: memberId, status: 'SUSPENDED' } });
      expect(
        await testPrisma.refreshToken.count({ where: { userId: memberId, revokedAt: null } }),
      ).toBe(0);
      for (const session of [first, second]) {
        expect((await listUsers(app, session.accessToken)).status).toBe(401);
        expect((await refresh(app, session.cookie)).status).toBe(401);
      }
      const attempt = await login(app, 'miembro@example.com');
      expect(attempt.status).toBe(403);
      expect(code(attempt)).toBe('ACCOUNT_SUSPENDED');
    });

    it('reactivates it with the same role and password, and the old sessions stay revoked', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const memberId = await createUser(schoolId, 'miembro@example.com', 'MEMBER');
      const old = await startSession(app, 'miembro@example.com');
      const adminToken = await accessTokenOf(app, cookie);
      await suspend(app, adminToken, memberId);

      const response = await reactivate(app, adminToken, memberId);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: { status: 'ACTIVE', role: 'MEMBER' } });
      expect((await refresh(app, old.cookie)).status).toBe(401);
      expect((await login(app, 'miembro@example.com')).status).toBe(204);
    });

    it('is idempotent: suspending a suspended user and reactivating an active one answer 200', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const memberId = await createUser(schoolId, 'miembro@example.com', 'MEMBER');
      const token = await accessTokenOf(app, cookie);

      expect((await reactivate(app, token, memberId)).status).toBe(200);
      expect((await suspend(app, token, memberId)).status).toBe(200);
      const again = await suspend(app, token, memberId);

      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ data: { status: 'SUSPENDED' } });
    });

    it('rejects suspending oneself even with other administrators, and keeps the sessions', async () => {
      const { app } = realApp();
      const { cookie, userId, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      await createUser(schoolId, 'otro@example.com', 'ADMIN');
      const token = await accessTokenOf(app, cookie);

      const response = await suspend(app, token, userId);

      expect(response.status).toBe(409);
      expect(code(response)).toBe('CANNOT_SUSPEND_SELF');
      expect((await stored(userId)).status).toBe('ACTIVE');
      expect((await listUsers(app, token)).status).toBe(200);
    });
  });

  describe('isolation between schools', () => {
    it('answers 404 to the three operations on a user of another school and changes nothing', async () => {
      const { app } = realApp();
      const first = await register(app, 'CEIP Uno', 'uno@example.com');
      const second = await register(app, 'CEIP Dos', 'dos@example.com');
      const memberOfSecond = await createUser(second.schoolId, 'miembro2@example.com', 'MEMBER');
      const token = await accessTokenOf(app, first.cookie);

      for (const response of [
        await changeRole(app, token, memberOfSecond, 'ADMIN'),
        await suspend(app, token, memberOfSecond),
        await reactivate(app, token, memberOfSecond),
        await suspend(app, token, second.userId),
      ]) {
        expect(response.status).toBe(404);
        expect(code(response)).toBe('NOT_FOUND');
      }
      expect(await stored(memberOfSecond)).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' });
      expect(await stored(second.userId)).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    });

    it('answers 404 to an id that is not a UUID, to a missing user and to a deleted one', async () => {
      const { app } = realApp();
      const { cookie, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      const deletedId = await createUser(schoolId, 'eliminado@example.com', 'MEMBER');
      await testPrisma.user.update({ where: { id: deletedId }, data: { status: 'DELETED' } });
      const token = await accessTokenOf(app, cookie);

      for (const id of ['no-es-un-uuid', crypto.randomUUID(), deletedId]) {
        const response = await reactivate(app, token, id);
        expect(response.status).toBe(404);
        expect(code(response)).toBe('NOT_FOUND');
      }
      expect((await stored(deletedId)).status).toBe('DELETED');
    });
  });

  describe('access control', () => {
    it('answers 403 to a member and 401 without a token, on the three routes', async () => {
      const { app } = realApp();
      const { userId, schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
      await createUser(schoolId, 'miembro@example.com', 'MEMBER');
      const member = await startSession(app, 'miembro@example.com');

      for (const response of [
        await changeRole(app, member.accessToken, userId, 'MEMBER'),
        await suspend(app, member.accessToken, userId),
        await reactivate(app, member.accessToken, userId),
      ]) {
        expect(response.status).toBe(403);
        expect(code(response)).toBe('FORBIDDEN');
      }
      expect((await request(app).post(`/api/users/${userId}/suspend`)).status).toBe(401);
      expect(await stored(userId)).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    });
  });

  describe('simultaneous requests', () => {
    // El orden exacto no se puede fijar desde fuera: si la autenticación de la segunda petición
    // ocurre después de que la primera termine, el administrador ya no lo es (`403` o `401`); si
    // ocurre antes, la regla del último administrador la rechaza bajo el bloqueo (`409`). Lo que
    // nunca puede pasar es que las dos tengan éxito. El caso determinista, con el colegio
    // bloqueado, es el del repositorio (`prismaSchoolUserRepository.int.test.ts`).
    async function twoAdminsAct(act: (app: App, token: string, targetId: string) => request.Test) {
      const { app } = realApp();
      const {
        cookie,
        userId: firstId,
        schoolId,
      } = await register(app, 'CEIP Uno', 'uno@example.com');
      const secondId = await createUser(schoolId, 'otro@example.com', 'ADMIN');
      const firstToken = await accessTokenOf(app, cookie);
      const secondToken = (await startSession(app, 'otro@example.com')).accessToken;

      const responses = await Promise.all([
        act(app, firstToken, secondId),
        act(app, secondToken, firstId),
      ]);

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect([403, 401, 409]).toContain(statuses.find((status) => status !== 200));
      const rejected = responses.find((response) => response.status === 409);
      if (rejected) {
        expect(code(rejected)).toBe('LAST_ADMIN_REQUIRED');
      }
      expect(
        await testPrisma.user.count({ where: { schoolId, role: 'ADMIN', status: 'ACTIVE' } }),
      ).toBe(1);
    }

    it('keeps an active administrator when two administrators demote each other at the same time', async () => {
      await twoAdminsAct((app, token, targetId) => changeRole(app, token, targetId, 'MEMBER'));
    });

    it('keeps an active administrator when two administrators suspend each other at the same time', async () => {
      await twoAdminsAct((app, token, targetId) => suspend(app, token, targetId));
    });
  });
});

describe('user management with a database that closes the connection', () => {
  let closingServer: Server;
  const sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => closingServer.close(resolve));
  });

  it('answers 503 DATABASE_UNAVAILABLE, not 401, on the three routes', async () => {
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
    const userId = crypto.randomUUID();

    for (const response of [
      await changeRole(app, accessToken, userId, 'MEMBER'),
      await suspend(app, accessToken, userId),
      await reactivate(app, accessToken, userId),
    ]) {
      expect(response.status).toBe(503);
      expect(code(response)).toBe('DATABASE_UNAVAILABLE');
    }
    await prisma.$disconnect();
  });
});
