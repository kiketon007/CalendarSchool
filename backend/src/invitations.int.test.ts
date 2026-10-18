import { createHash } from 'node:crypto';
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

interface InvitationBody {
  id: string;
  role: string;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  expiresAt: string;
}

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

/** Registra un colegio y devuelve su administrador con un access token ya emitido. */
async function registerAdmin(app: App, schoolName: string, email: string) {
  const admin = await register(app, schoolName, email);
  return { ...admin, accessToken: await accessTokenFor(app, admin.cookie) };
}

const createInvitation = (app: App, accessToken: string, role: string) =>
  request(app)
    .post('/api/invitations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ role });

const listInvitations = (app: App, accessToken: string) =>
  request(app).get('/api/invitations').set('Authorization', `Bearer ${accessToken}`);

const revokeInvitation = (app: App, accessToken: string, id: string) =>
  request(app).post(`/api/invitations/${id}/revoke`).set('Authorization', `Bearer ${accessToken}`);

function created(response: request.Response) {
  return (response.body as { data: { invitation: InvitationBody; url: string } }).data;
}

function listed(response: request.Response) {
  return (response.body as { data: InvitationBody[] }).data;
}

function code(response: request.Response): string {
  return (response.body as { error: { code: string } }).error.code;
}

/** Token del fragmento del enlace (`<origen>/invitacion#<token>`). */
function tokenOf(url: string): string {
  return url.slice(url.indexOf('#') + 1);
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Crea un usuario del colegio con una sesión real (la que lee `AuthenticateRequest`) y su access token. */
async function addUserWithSession(
  tokenIssuer: ReturnType<typeof realApp>['tokenIssuer'],
  schoolId: string,
  email: string,
  role: 'ADMIN' | 'MEMBER',
) {
  const userId = crypto.randomUUID();
  await testPrisma.user.create({
    data: {
      id: userId,
      schoolId,
      email,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: 'Persona',
      lastName: 'Prueba',
      role,
      status: 'ACTIVE',
    },
  });
  const sessionId = crypto.randomUUID();
  await testPrisma.refreshToken.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: sha256(sessionId),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const accessToken = await tokenIssuer.issueAccessToken({ userId, schoolId, role, sessionId });
  return { userId, accessToken };
}

describe('invitations against the test database', () => {
  it('generates an invitation whose url holds the token whose SHA-256 is the stored hash', async () => {
    const { app } = realApp();
    const { accessToken, userId, schoolId } = await registerAdmin(
      app,
      'CEIP Lluís Vives',
      'jose@example.com',
    );

    const response = await createInvitation(app, accessToken, 'MEMBER');

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { invitation, url } = created(response);
    expect(url.startsWith(`${TEST_APP_ORIGIN}/invitacion#`)).toBe(true);
    const row = await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row).toMatchObject({
      schoolId,
      purpose: 'INVITATION',
      role: 'MEMBER',
      createdById: userId,
      userId: null,
      usedAt: null,
      revokedAt: null,
    });
    expect(row.tokenHash).toBe(sha256(tokenOf(url)));
    expect(row.tokenHash).not.toContain(tokenOf(url));
  });

  it('lists the pending invitations, newest first, without the link', async () => {
    const { app } = realApp();
    const { accessToken, userId } = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');
    const first = created(await createInvitation(app, accessToken, 'MEMBER'));
    const second = created(await createInvitation(app, accessToken, 'ADMIN'));

    const response = await listInvitations(app, accessToken);

    expect(response.status).toBe(200);
    expect(listed(response).map((invitation) => invitation.id)).toEqual([
      second.invitation.id,
      first.invitation.id,
    ]);
    expect(listed(response)[0]).toMatchObject({
      role: 'ADMIN',
      createdBy: { id: userId, firstName: 'José María', lastName: 'García-López' },
    });
    expect(JSON.stringify(response.body)).not.toContain(tokenOf(first.url));
    expect(JSON.stringify(response.body)).not.toContain('url');
    expect(JSON.stringify(response.body)).not.toContain('tokenHash');
  });

  it('revokes an invitation, which then leaves the list, and revoking it again answers 204', async () => {
    const { app } = realApp();
    const { accessToken } = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');
    const { invitation } = created(await createInvitation(app, accessToken, 'MEMBER'));

    const first = await revokeInvitation(app, accessToken, invitation.id);
    const firstRevokedAt = (
      await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })
    ).revokedAt;
    const second = await revokeInvitation(app, accessToken, invitation.id);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(firstRevokedAt).not.toBeNull();
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })).revokedAt,
    ).toEqual(firstRevokedAt);
    expect(listed(await listInvitations(app, accessToken))).toEqual([]);
  });

  it('isolates two schools: neither lists nor revokes the invitations of the other', async () => {
    const { app } = realApp();
    const first = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');
    const second = await registerAdmin(app, 'CEIP Dos', 'dos@example.com');
    const { invitation } = created(await createInvitation(app, first.accessToken, 'MEMBER'));

    expect(listed(await listInvitations(app, second.accessToken))).toEqual([]);
    const crossRevoke = await revokeInvitation(app, second.accessToken, invitation.id);

    expect(crossRevoke.status).toBe(404);
    expect(code(crossRevoke)).toBe('NOT_FOUND');
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })).revokedAt,
    ).toBeNull();
    expect(listed(await listInvitations(app, first.accessToken))).toHaveLength(1);
  });

  it('answers 404 to an id that does not exist or is not a UUID', async () => {
    const { app } = realApp();
    const { accessToken } = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');

    const missing = await revokeInvitation(app, accessToken, crypto.randomUUID());
    const malformed = await revokeInvitation(app, accessToken, 'not-a-uuid');

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
  });

  it('does not revoke a password reset inserted with SQL through this route', async () => {
    const { app } = realApp();
    const { accessToken, userId, schoolId } = await registerAdmin(
      app,
      'CEIP Uno',
      'uno@example.com',
    );
    const resetId = crypto.randomUUID();
    await testPrisma.accessLink.create({
      data: {
        id: resetId,
        schoolId,
        purpose: 'PASSWORD_RESET',
        tokenHash: sha256('reset'),
        userId,
        createdById: userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const response = await revokeInvitation(app, accessToken, resetId);

    expect(response.status).toBe(404);
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: resetId } })).revokedAt,
    ).toBeNull();
    expect(listed(await listInvitations(app, accessToken))).toEqual([]);
  });

  it('keeps listing the invitation of an administrator that has been suspended', async () => {
    const { app, tokenIssuer } = realApp();
    const creator = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');
    const { invitation } = created(await createInvitation(app, creator.accessToken, 'MEMBER'));
    const other = await addUserWithSession(
      tokenIssuer,
      creator.schoolId,
      'otro@example.com',
      'ADMIN',
    );
    await testPrisma.user.update({ where: { id: creator.userId }, data: { status: 'SUSPENDED' } });

    const response = await listInvitations(app, other.accessToken);

    expect(response.status).toBe(200);
    expect(listed(response)).toEqual([
      expect.objectContaining({
        id: invitation.id,
        createdBy: expect.objectContaining({ id: creator.userId }) as unknown,
      }),
    ]);
  });

  it('answers 403 to a member and 401 without a token, on the three routes', async () => {
    const { app, tokenIssuer } = realApp();
    const { accessToken, schoolId } = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');
    const { invitation } = created(await createInvitation(app, accessToken, 'MEMBER'));
    const member = await addUserWithSession(tokenIssuer, schoolId, 'miembro@example.com', 'MEMBER');

    for (const response of [
      await createInvitation(app, member.accessToken, 'MEMBER'),
      await listInvitations(app, member.accessToken),
      await revokeInvitation(app, member.accessToken, invitation.id),
    ]) {
      expect(response.status).toBe(403);
      expect(code(response)).toBe('FORBIDDEN');
    }
    for (const response of [
      await request(app).post('/api/invitations').send({ role: 'MEMBER' }),
      await request(app).get('/api/invitations'),
      await request(app).post(`/api/invitations/${invitation.id}/revoke`),
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
    expect(
      (await testPrisma.accessLink.findUniqueOrThrow({ where: { id: invitation.id } })).revokedAt,
    ).toBeNull();
  });

  it('never logs the token, its hash or the url', async () => {
    const { app, logOutput } = realApp();
    const { accessToken } = await registerAdmin(app, 'CEIP Uno', 'uno@example.com');

    const { invitation, url } = created(await createInvitation(app, accessToken, 'MEMBER'));
    await listInvitations(app, accessToken);
    await revokeInvitation(app, accessToken, invitation.id);

    const output = logOutput();
    expect(output).toContain('INVITATION_CREATED');
    expect(output).toContain('INVITATION_REVOKED');
    expect(output).not.toContain(tokenOf(url));
    expect(output).not.toContain(sha256(tokenOf(url)));
    expect(output).not.toContain(url);
  });
});

describe('invitations with a database that closes the connection', () => {
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

    for (const response of [
      await createInvitation(app, accessToken, 'MEMBER'),
      await listInvitations(app, accessToken),
      await revokeInvitation(app, accessToken, crypto.randomUUID()),
    ]) {
      expect(response.status).toBe(503);
      expect(code(response)).toBe('DATABASE_UNAVAILABLE');
    }
    await prisma.$disconnect();
  });
});
