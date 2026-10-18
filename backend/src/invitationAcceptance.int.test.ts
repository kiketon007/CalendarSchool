import { createHash } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';
const INVITEE = {
  firstName: 'Ana',
  lastName: 'Pérez-Gil',
  email: 'ana.perez@example.com',
  password: PASSWORD,
  privacyPolicyAccepted: true,
};

type App = ReturnType<typeof realApp>['app'];

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

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

/** Genera una invitación por la API y devuelve su id y el token del enlace. */
async function generateInvitation(app: App, accessToken: string, role: 'ADMIN' | 'MEMBER') {
  const response = await request(app)
    .post('/api/invitations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ role });
  expect(response.status).toBe(201);
  const data = (response.body as { data: { invitation: { id: string }; url: string } }).data;
  return { id: data.invitation.id, token: data.url.slice(data.url.indexOf('#') + 1) };
}

const lookup = (app: App, body: unknown) =>
  request(app)
    .post('/api/invitations/lookup')
    .send(body as object);
const accept = (app: App, body: unknown) =>
  request(app)
    .post('/api/invitations/accept')
    .send(body as object);

const code = (response: request.Response) =>
  (response.body as { error: { code: string } }).error.code;
const usersWithEmail = (email: string) => testPrisma.user.count({ where: { email } });

/** Un colegio con su administrador y una invitación pendiente. */
async function setup(
  role: 'ADMIN' | 'MEMBER' = 'MEMBER',
  options?: { invitationAttemptsMax: number },
) {
  const real = realApp(options);
  const admin = await registerAdmin(real.app, 'CEIP Uno', 'admin@example.com');
  const invitation = await generateInvitation(real.app, admin.accessToken, role);
  return { ...real, admin, invitation };
}

describe('invitation acceptance against the test database', () => {
  it('lets the invitee look the link up without consuming it, create the account and log in', async () => {
    const { app, invitation, admin } = await setup('MEMBER');

    for (let i = 0; i < 3; i += 1) {
      const response = await lookup(app, { token: invitation.token });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect((response.body as { data: unknown }).data).toEqual({
        school: { name: 'CEIP Uno' },
        role: 'MEMBER',
      });
    }
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt,
    ).toBeNull();

    const accepted = await accept(app, { token: invitation.token, ...INVITEE });

    expect(accepted.status).toBe(201);
    expect(accepted.headers['set-cookie']).toBeUndefined();
    expect((accepted.body as { data: unknown }).data).toEqual({
      user: expect.objectContaining({
        email: 'ana.perez@example.com',
        role: 'MEMBER',
      }) as unknown,
      school: { id: admin.schoolId, name: 'CEIP Uno' },
    });
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'ana.perez@example.com' },
    });
    expect(user).toMatchObject({
      schoolId: admin.schoolId,
      role: 'MEMBER',
      status: 'ACTIVE',
      firstName: 'Ana',
      lastName: 'Pérez-Gil',
    });
    expect(user.privacyPolicyAcceptedAt).not.toBeNull();
    expect(user.privacyPolicyVersion).not.toBeNull();
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt,
    ).not.toBeNull();

    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_APP_ORIGIN)
      .send({ email: INVITEE.email, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } });
    expect(login.status).toBe(204);
  });

  it('creates an administrator when the invitation is for an administrator', async () => {
    const { app, invitation } = await setup('ADMIN');

    const response = await accept(app, { token: invitation.token, ...INVITEE });

    expect(response.status).toBe(201);
    expect((response.body as { data: { user: { role: string } } }).data.user.role).toBe('ADMIN');
  });

  it('takes the role and the school from the invitation, not from the body', async () => {
    const { app, invitation, admin } = await setup('MEMBER');
    const other = await registerAdmin(app, 'CEIP Dos', 'otro@example.com');

    const response = await accept(app, {
      token: invitation.token,
      ...INVITEE,
      role: 'ADMIN',
      schoolId: other.schoolId,
    });

    expect(response.status).toBe(201);
    expect(
      await testPrisma.user.findUniqueOrThrow({ where: { email: INVITEE.email } }),
    ).toMatchObject({ role: 'MEMBER', schoolId: admin.schoolId });
  });

  it('accepts the invitation of an administrator that has been suspended', async () => {
    const { app, invitation, admin } = await setup('MEMBER');
    await testPrisma.user.update({ where: { id: admin.userId }, data: { status: 'SUSPENDED' } });

    const response = await accept(app, { token: invitation.token, ...INVITEE });

    expect(response.status).toBe(201);
  });

  it('answers 409 to an email already registered and leaves the invitation pending', async () => {
    const { app, invitation } = await setup('MEMBER');

    const response = await accept(app, {
      token: invitation.token,
      ...INVITEE,
      email: 'ADMIN@example.com',
    });

    expect(response.status).toBe(409);
    expect(code(response)).toBe('EMAIL_ALREADY_REGISTERED');
    expect((await lookup(app, { token: invitation.token })).status).toBe(200);
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt,
    ).toBeNull();
  });

  it('answers 400 to invalid fields and leaves the invitation pending', async () => {
    const { app, invitation } = await setup('MEMBER');

    const response = await accept(app, {
      token: invitation.token,
      ...INVITEE,
      password: 'sin-variedad',
      privacyPolicyAccepted: false,
    });

    expect(response.status).toBe(400);
    expect(code(response)).toBe('VALIDATION_ERROR');
    expect((response.body as { error: { details: unknown } }).error.details).toEqual([
      { field: 'password', code: 'WEAK_PASSWORD' },
      { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
    ]);
    expect((await lookup(app, { token: invitation.token })).status).toBe(200);
  });

  describe('a link that is not valid answers 410 ACCESS_LINK_INVALID to the lookup and to the acceptance', () => {
    async function expectInvalid(app: App, token: unknown) {
      const looked = await lookup(app, { token });
      const accepted = await accept(app, { token, ...INVITEE });
      for (const response of [looked, accepted]) {
        expect(response.status).toBe(410);
        expect(code(response)).toBe('ACCESS_LINK_INVALID');
      }
      expect(await usersWithEmail(INVITEE.email)).toBe(0);
    }

    it('when it is expired', async () => {
      const { app, invitation } = await setup();
      await testPrisma.accessLink.update({
        where: { id: invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expectInvalid(app, invitation.token);
    });

    it('when it is revoked', async () => {
      const { app, invitation, admin } = await setup();
      const revoked = await request(app)
        .post(`/api/invitations/${invitation.id}/revoke`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(revoked.status).toBe(204);

      await expectInvalid(app, invitation.token);
    });

    it('when it is already used', async () => {
      const { app, invitation } = await setup();
      expect((await accept(app, { token: invitation.token, ...INVITEE })).status).toBe(201);

      const again = await accept(app, {
        token: invitation.token,
        ...INVITEE,
        email: 'otra@example.com',
      });
      expect(again.status).toBe(410);
      expect(await usersWithEmail('otra@example.com')).toBe(0);
    });

    it('when it does not exist, the token is missing or it is not a string', async () => {
      const { app } = await setup();

      await expectInvalid(app, 'un-token-que-no-existe');
      await expectInvalid(app, undefined);
      await expectInvalid(app, 42);
    });

    it('when it belongs to a password reset', async () => {
      const { app, admin } = await setup();
      await testPrisma.accessLink.create({
        data: {
          id: crypto.randomUUID(),
          schoolId: admin.schoolId,
          purpose: 'PASSWORD_RESET',
          tokenHash: createHash('sha256').update('token-de-restablecimiento').digest('hex'),
          userId: admin.userId,
          createdById: admin.userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      await expectInvalid(app, 'token-de-restablecimiento');
    });
  });

  it('checks the link before the fields: a revoked link with invalid fields or a registered email is a 410', async () => {
    const { app, invitation, admin } = await setup();
    await request(app)
      .post(`/api/invitations/${invitation.id}/revoke`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    const invalidFields = await accept(app, { token: invitation.token, firstName: '' });
    const registeredEmail = await accept(app, {
      token: invitation.token,
      ...INVITEE,
      email: 'admin@example.com',
    });

    expect(invalidFields.status).toBe(410);
    expect(registeredEmail.status).toBe(410);
  });

  it('creates a single user when the same link is accepted twice at the same time', async () => {
    const { app, invitation } = await setup();

    const responses = await Promise.all([
      accept(app, { token: invitation.token, ...INVITEE, email: 'uno@example.com' }),
      accept(app, { token: invitation.token, ...INVITEE, email: 'dos@example.com' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 410]);
    expect(
      (await usersWithEmail('uno@example.com')) + (await usersWithEmail('dos@example.com')),
    ).toBe(1);
  });

  describe('the attempt limit', () => {
    it('is exhausted by links that are not valid and then answers 429 with Retry-After, even to a valid link', async () => {
      const { app, invitation } = await setup('MEMBER', { invitationAttemptsMax: 3 });

      for (let i = 0; i < 3; i += 1) {
        expect((await lookup(app, { token: `desconocido-${i}` })).status).toBe(410);
      }
      const blocked = await lookup(app, { token: invitation.token });

      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(code(blocked)).toBe('TOO_MANY_REQUESTS');
      expect((await accept(app, { token: invitation.token, ...INVITEE })).status).toBe(429);
    });

    it('does not count valid links, even when the fields are rejected', async () => {
      const { app, invitation } = await setup('MEMBER', { invitationAttemptsMax: 3 });

      for (let i = 0; i < 5; i += 1) {
        const response = await accept(app, { token: invitation.token, firstName: '' });
        expect(response.status).toBe(400);
      }
      for (let i = 0; i < 5; i += 1) {
        expect((await lookup(app, { token: invitation.token })).status).toBe(200);
      }
    });

    it('does not count an email already registered', async () => {
      const { app, invitation } = await setup('MEMBER', { invitationAttemptsMax: 2 });

      for (let i = 0; i < 4; i += 1) {
        const response = await accept(app, {
          token: invitation.token,
          ...INVITEE,
          email: 'admin@example.com',
        });
        expect(response.status).toBe(409);
      }
    });
  });

  it('logs the acceptance and never the token, its hash or the password', async () => {
    const { app, invitation, logOutput } = await setup();
    await accept(app, { token: invitation.token, ...INVITEE, email: 'admin@example.com' });
    await accept(app, { token: invitation.token, ...INVITEE });
    await accept(app, { token: 'otro-token', ...INVITEE });

    const output = logOutput();
    expect(output).toContain('INVITATION_ACCEPTED');
    expect(output).toContain('INVITATION_ACCEPT_REJECTED');
    expect(output).not.toContain(invitation.token);
    expect(output).not.toContain('otro-token');
    expect(output).not.toContain(PASSWORD);
  });
});

describe('invitation acceptance with a database that closes the connection', () => {
  let closingServer: Server;
  const sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => closingServer.close(resolve));
  });

  it('answers 503 DATABASE_UNAVAILABLE to the lookup and to the acceptance', async () => {
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
      await accept(app, { token: 'cualquiera', ...INVITEE }),
    ]) {
      expect(response.status).toBe(503);
      expect(code(response)).toBe('DATABASE_UNAVAILABLE');
    }
    await prisma.$disconnect();
  });
});
