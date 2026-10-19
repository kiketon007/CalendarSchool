import { createHash } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';
const NEW_PASSWORD = 'Nueva4567!x';

type App = ReturnType<typeof realApp>['app'];

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

const code = (response: request.Response) =>
  (response.body as { error: { code: string } }).error.code;

/** Registra un colegio con su administrador y devuelve su access token y los ids. */
async function registerAdmin(app: App, schoolName: string, email: string) {
  const registered = await request(app)
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
  expect(registered.status).toBe(201);
  const data = (registered.body as { data: { user: { id: string }; school: { id: string } } }).data;
  const refreshed = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookieOf(registered));
  const accessToken = (refreshed.body as { data: { session: { accessToken: string } } }).data
    .session.accessToken;
  return { accessToken, userId: data.user.id, schoolId: data.school.id };
}

/** Crea un usuario del colegio con una invitación aceptada por la API y devuelve su id. */
async function addUser(app: App, adminToken: string, email: string, role: 'ADMIN' | 'MEMBER') {
  const invited = await request(app)
    .post('/api/invitations')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ role });
  const url = (invited.body as { data: { url: string } }).data.url;
  const accepted = await request(app)
    .post('/api/invitations/accept')
    .send({
      token: url.slice(url.indexOf('#') + 1),
      firstName: 'Ana',
      lastName: 'Pérez-Gil',
      email,
      password: PASSWORD,
      privacyPolicyAccepted: true,
    });
  expect(accepted.status).toBe(201);
  return (accepted.body as { data: { user: { id: string } } }).data.user.id;
}

/** Inicia sesión por la API: devuelve la cookie y el access token. */
async function logIn(app: App, email: string, password: string) {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', TEST_APP_ORIGIN)
    .send({ email, password, captcha: { version: 'v3', token: 'e2e' } });
  if (response.status !== 204) {
    return { status: response.status, cookie: '', accessToken: '' };
  }
  const cookie = cookieOf(response);
  const refreshed = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookie);
  const accessToken = (refreshed.body as { data: { session: { accessToken: string } } }).data
    .session.accessToken;
  return { status: 204, cookie, accessToken };
}

const generate = (app: App, accessToken: string, userId: string) =>
  request(app)
    .post(`/api/users/${userId}/password-reset`)
    .set('Authorization', `Bearer ${accessToken}`);
const revoke = (app: App, accessToken: string, userId: string) =>
  request(app)
    .post(`/api/users/${userId}/password-reset/revoke`)
    .set('Authorization', `Bearer ${accessToken}`);
const lookup = (app: App, body: unknown) =>
  request(app)
    .post('/api/password-resets/lookup')
    .send(body as object);
const confirm = (app: App, body: unknown) =>
  request(app)
    .post('/api/password-resets/confirm')
    .send(body as object);

/** Genera el enlace por la API y devuelve su token. */
async function generateToken(app: App, accessToken: string, userId: string) {
  const response = await generate(app, accessToken, userId);
  expect(response.status).toBe(201);
  const url = (response.body as { data: { url: string } }).data.url;
  expect(url.startsWith(`${TEST_APP_ORIGIN}/restablecer#`)).toBe(true);
  return url.slice(url.indexOf('#') + 1);
}

const pendingOf = async (app: App, accessToken: string, email: string) => {
  const list = await request(app).get('/api/users').set('Authorization', `Bearer ${accessToken}`);
  const users = (list.body as { data: { email: string; passwordResetPending: boolean }[] }).data;
  return users.find((user) => user.email === email)?.passwordResetPending;
};

const openResets = (userId: string) =>
  testPrisma.accessLink.count({
    where: { userId, purpose: 'PASSWORD_RESET', usedAt: null, revokedAt: null },
  });

/** Un colegio con su administrador y un miembro. */
async function setup(options?: {
  invitationAttemptsMax?: number;
  passwordResetAttemptsMax?: number;
}) {
  const real = realApp(options);
  const admin = await registerAdmin(real.app, 'CEIP Uno', 'admin@example.com');
  const memberId = await addUser(real.app, admin.accessToken, 'miembro@example.com', 'MEMBER');
  return { ...real, admin, memberId };
}

describe('password reset against the test database', () => {
  it('lets the administrator generate the link, the user look it up without consuming it and set a new password', async () => {
    const { app, admin, memberId } = await setup();
    const token = await generateToken(app, admin.accessToken, memberId);
    expect(await pendingOf(app, admin.accessToken, 'miembro@example.com')).toBe(true);

    for (let i = 0; i < 3; i += 1) {
      const looked = await lookup(app, { token });
      expect(looked.status).toBe(200);
      expect(looked.headers['cache-control']).toBe('no-store');
      expect((looked.body as { data: unknown }).data).toEqual({
        school: { name: 'CEIP Uno' },
        email: 'm***@example.com',
      });
    }
    expect(await openResets(memberId)).toBe(1);

    const confirmed = await confirm(app, { token, password: NEW_PASSWORD });

    expect(confirmed.status).toBe(204);
    expect(confirmed.headers['set-cookie']).toBeUndefined();
    expect(await openResets(memberId)).toBe(0);
    expect(await pendingOf(app, admin.accessToken, 'miembro@example.com')).toBe(false);
    expect((await logIn(app, 'miembro@example.com', NEW_PASSWORD)).status).toBe(204);
    expect((await logIn(app, 'miembro@example.com', PASSWORD)).status).toBe(401);
    expect((await lookup(app, { token })).status).toBe(410);
    expect((await confirm(app, { token, password: NEW_PASSWORD })).status).toBe(410);
  });

  it('closes the sessions that were open: their refresh cookie and their access token stop working', async () => {
    const { app, admin } = await setup();
    const secondAdminId = await addUser(app, admin.accessToken, 'segundo@example.com', 'ADMIN');
    const session = await logIn(app, 'segundo@example.com', PASSWORD);
    const listed = () =>
      request(app).get('/api/users').set('Authorization', `Bearer ${session.accessToken}`);
    expect((await listed()).status).toBe(200);
    const token = await generateToken(app, admin.accessToken, secondAdminId);
    expect((await listed()).status).toBe(200);

    expect((await confirm(app, { token, password: NEW_PASSWORD })).status).toBe(204);

    expect((await listed()).status).toBe(401);
    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', TEST_APP_ORIGIN)
      .set('Cookie', session.cookie);
    expect(refreshed.status).toBe(401);
    // La sesión del administrador que generó el enlace no se toca.
    expect(
      (await request(app).get('/api/users').set('Authorization', `Bearer ${admin.accessToken}`))
        .status,
    ).toBe(200);
  });

  it('lets an administrator reset their own password', async () => {
    const { app, admin } = await setup();

    const token = await generateToken(app, admin.accessToken, admin.userId);

    expect((await confirm(app, { token, password: NEW_PASSWORD })).status).toBe(204);
    expect((await logIn(app, 'admin@example.com', NEW_PASSWORD)).status).toBe(204);
  });

  it('invalidates the previous link when another one is generated, also after the first one expired', async () => {
    const { app, admin, memberId } = await setup();
    const first = await generateToken(app, admin.accessToken, memberId);
    const second = await generateToken(app, admin.accessToken, memberId);

    expect((await lookup(app, { token: first })).status).toBe(410);
    expect((await lookup(app, { token: second })).status).toBe(200);

    // Caducado sin revocar: el índice único parcial lo sigue contando.
    await testPrisma.accessLink.updateMany({
      where: { userId: memberId, purpose: 'PASSWORD_RESET' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await pendingOf(app, admin.accessToken, 'miembro@example.com')).toBe(false);
    const third = await generateToken(app, admin.accessToken, memberId);

    expect((await lookup(app, { token: second })).status).toBe(410);
    expect((await lookup(app, { token: third })).status).toBe(200);
    expect(await openResets(memberId)).toBe(1);
  });

  it('leaves a single pending link when two administrators generate at the same time', async () => {
    const { app, admin, memberId } = await setup();

    const responses = await Promise.all([
      generate(app, admin.accessToken, memberId),
      generate(app, admin.accessToken, memberId),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await openResets(memberId)).toBe(1);
    const urls = responses.map((response) => (response.body as { data: { url: string } }).data.url);
    const working = await Promise.all(
      urls.map((url) => lookup(app, { token: url.slice(url.indexOf('#') + 1) })),
    );
    expect(working.map((response) => response.status).sort()).toEqual([200, 410]);
  });

  it('revokes the pending link, and revoking again is idempotent', async () => {
    const { app, admin, memberId } = await setup();
    const token = await generateToken(app, admin.accessToken, memberId);

    const revoked = await revoke(app, admin.accessToken, memberId);

    expect(revoked.status).toBe(204);
    expect(await pendingOf(app, admin.accessToken, 'miembro@example.com')).toBe(false);
    expect((await lookup(app, { token })).status).toBe(410);
    expect((await revoke(app, admin.accessToken, memberId)).status).toBe(204);
  });

  it('answers 409 USER_NOT_ACTIVE for a suspended user and generates nothing', async () => {
    const { app, admin, memberId } = await setup();
    const suspended = await request(app)
      .post(`/api/users/${memberId}/suspend`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(suspended.status).toBe(200);

    const response = await generate(app, admin.accessToken, memberId);

    expect(response.status).toBe(409);
    expect(code(response)).toBe('USER_NOT_ACTIVE');
    expect(await testPrisma.accessLink.count({ where: { purpose: 'PASSWORD_RESET' } })).toBe(0);
  });

  it('answers 410 when the user was suspended after the link was generated, and keeps the password', async () => {
    const { app, admin, memberId } = await setup();
    const token = await generateToken(app, admin.accessToken, memberId);
    await request(app)
      .post(`/api/users/${memberId}/suspend`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    const before = (await testPrisma.user.findUniqueOrThrow({ where: { id: memberId } }))
      .passwordHash;

    expect((await lookup(app, { token })).status).toBe(410);
    expect((await confirm(app, { token, password: NEW_PASSWORD })).status).toBe(410);

    expect(
      (await testPrisma.user.findUniqueOrThrow({ where: { id: memberId } })).passwordHash,
    ).toBe(before);
  });

  it('lets only one of two simultaneous confirmations of the same link succeed', async () => {
    const { app, admin, memberId } = await setup();
    const token = await generateToken(app, admin.accessToken, memberId);

    const responses = await Promise.all([
      confirm(app, { token, password: NEW_PASSWORD }),
      confirm(app, { token, password: 'Otra98765!z' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([204, 410]);
  });

  it('answers 400 to a weak password and keeps the link pending', async () => {
    const { app, admin, memberId } = await setup();
    const token = await generateToken(app, admin.accessToken, memberId);

    const response = await confirm(app, { token, password: 'sin-variedad' });

    expect(response.status).toBe(400);
    expect((response.body as { error: { details: unknown } }).error.details).toEqual([
      { field: 'password', code: 'WEAK_PASSWORD' },
    ]);
    expect((await lookup(app, { token })).status).toBe(200);
  });

  it('checks the link before the password: an invalid link with a weak password is a 410', async () => {
    const { app } = await setup();

    expect((await confirm(app, { token: 'no-existe', password: 'x' })).status).toBe(410);
  });

  it('keeps the schools apart: another school cannot generate, revoke or read the link', async () => {
    const { app, admin, memberId } = await setup();
    const other = await registerAdmin(app, 'CEIP Dos', 'otro@example.com');
    const token = await generateToken(app, admin.accessToken, memberId);

    const generated = await generate(app, other.accessToken, memberId);
    const revoked = await revoke(app, other.accessToken, memberId);

    expect(generated.status).toBe(404);
    expect(revoked.status).toBe(404);
    expect(await pendingOf(app, other.accessToken, 'miembro@example.com')).toBeUndefined();
    expect((await lookup(app, { token })).status).toBe(200);
  });

  it('answers 404 to an id that is not a UUID or does not exist', async () => {
    const { app, admin } = await setup();

    expect((await generate(app, admin.accessToken, 'no-es-un-uuid')).status).toBe(404);
    expect(
      (await generate(app, admin.accessToken, '0192f5a0-0000-7000-8000-0000000000ff')).status,
    ).toBe(404);
    expect((await revoke(app, admin.accessToken, 'no-es-un-uuid')).status).toBe(404);
  });

  it('answers 403 to a member and 401 without a token', async () => {
    const { app, admin, memberId } = await setup();
    const member = await logIn(app, 'miembro@example.com', PASSWORD);

    const forbidden = await generate(app, member.accessToken, admin.userId);
    const unauthenticated = await request(app).post(`/api/users/${memberId}/password-reset`);

    expect(forbidden.status).toBe(403);
    expect(unauthenticated.status).toBe(401);
    expect((await revoke(app, member.accessToken, admin.userId)).status).toBe(403);
  });

  describe('the attempt limit', () => {
    it('is exhausted by links that are not valid, answers 429 with Retry-After and is independent of the invitations', async () => {
      const { app, admin, memberId } = await setup({
        invitationAttemptsMax: 2,
        passwordResetAttemptsMax: 3,
      });
      const token = await generateToken(app, admin.accessToken, memberId);

      for (let i = 0; i < 3; i += 1) {
        expect((await lookup(app, { token: `desconocido-${i}` })).status).toBe(410);
      }
      const blocked = await lookup(app, { token });

      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await confirm(app, { token, password: NEW_PASSWORD })).status).toBe(429);
      // El contador de las invitaciones no se ha tocado.
      const invitation = await request(app).post('/api/invitations/lookup').send({ token: 'x' });
      expect(invitation.status).toBe(410);
    });

    it('is not consumed by the invitations either', async () => {
      const { app, admin, memberId } = await setup({
        invitationAttemptsMax: 2,
        passwordResetAttemptsMax: 2,
      });
      const token = await generateToken(app, admin.accessToken, memberId);

      for (let i = 0; i < 2; i += 1) {
        await request(app)
          .post('/api/invitations/lookup')
          .send({ token: `desconocido-${i}` });
      }

      expect((await lookup(app, { token })).status).toBe(200);
    });

    it('does not count valid links, even when the password is rejected', async () => {
      const { app, admin, memberId } = await setup({ passwordResetAttemptsMax: 2 });
      const token = await generateToken(app, admin.accessToken, memberId);

      for (let i = 0; i < 4; i += 1) {
        expect((await confirm(app, { token, password: 'corta' })).status).toBe(400);
        expect((await lookup(app, { token })).status).toBe(200);
      }
    });
  });

  it('logs the events and never the token, its hash, the link, the password or the email', async () => {
    const { app, admin, memberId, logOutput } = await setup();
    const token = await generateToken(app, admin.accessToken, memberId);
    await lookup(app, { token });
    await confirm(app, { token: 'otro-token', password: NEW_PASSWORD });
    await confirm(app, { token, password: NEW_PASSWORD });
    const second = await generateToken(app, admin.accessToken, memberId);
    await revoke(app, admin.accessToken, memberId);

    const output = logOutput();
    for (const event of [
      'PASSWORD_RESET_LINK_CREATED',
      'PASSWORD_RESET_LINK_REVOKED',
      'PASSWORD_RESET_COMPLETED',
      'PASSWORD_RESET_REJECTED',
    ]) {
      expect(output).toContain(event);
    }
    const hashes = [token, second, 'otro-token'].map((value) =>
      createHash('sha256').update(value).digest('hex'),
    );
    for (const secret of [token, second, 'otro-token', ...hashes, NEW_PASSWORD, 'restablecer#']) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain('miembro@example.com');
  });
});

describe('password reset with a database that closes the connection', () => {
  let closingServer: Server;
  const sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => closingServer.close(resolve));
  });

  it('answers 503 DATABASE_UNAVAILABLE to the lookup and to the confirmation', async () => {
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
    const { app } = realApp({ prisma });

    for (const response of [
      await lookup(app, { token: 'cualquiera' }),
      await confirm(app, { token: 'cualquiera', password: NEW_PASSWORD }),
    ]) {
      expect(response.status).toBe(503);
      expect(code(response)).toBe('DATABASE_UNAVAILABLE');
    }
    await prisma.$disconnect();
  });
});
