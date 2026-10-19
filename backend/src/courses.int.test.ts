import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';

type App = ReturnType<typeof realApp>['app'];

function registerBody(schoolName: string, email: string) {
  return {
    schoolName,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
    email,
    password: PASSWORD,
    privacyPolicyAccepted: true,
    captcha: { version: 'v3', token: 'token-provisional' },
  };
}

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio con su administrador y devuelve su cookie y los ids. */
async function register(app: App, schoolName: string, email: string) {
  const response = await request(app)
    .post('/api/auth/register')
    .send(registerBody(schoolName, email));
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

/** Registra un colegio y devuelve el access token de su administrador. */
async function adminOf(app: App, schoolName: string, email: string) {
  const school = await register(app, schoolName, email);
  return { ...school, accessToken: await accessTokenFor(app, school.cookie) };
}

const createCourse = (app: App, accessToken: string, body: unknown) =>
  request(app)
    .post('/api/courses')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

const listCourses = (app: App, accessToken: string) =>
  request(app).get('/api/courses').set('Authorization', `Bearer ${accessToken}`);

interface CourseBody {
  id: string;
  name: string;
  classes: { id: string; name: string; tutor: null }[];
}

async function addMember(schoolId: string, email: string) {
  await testPrisma.user.create({
    data: {
      id: crypto.randomUUID(),
      schoolId,
      email,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: 'Miembro',
      lastName: 'Colegio',
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });
}

describe('courses against the test database', () => {
  it('creates a course with its classes and stores them under the school of the identity', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await createCourse(app, accessToken, {
      name: '  1º   Primaria ',
      classes: [{ name: 'B' }, { name: ' A ' }],
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { course } = (response.body as { data: { course: CourseBody } }).data;
    expect(course.name).toBe('1º Primaria');
    expect(course.classes.map(({ name, tutor }) => [name, tutor])).toEqual([
      ['B', null],
      ['A', null],
    ]);
    const stored = await testPrisma.course.findUniqueOrThrow({
      where: { id: course.id },
      include: { classes: true },
    });
    expect(stored.schoolId).toBe(schoolId);
    expect(stored.normalizedName).toBe('1º primaria');
    expect(stored.classes.map(({ name }) => name).sort()).toEqual(['A', 'B']);
  });

  it('ignores a school or a tutor sent in the body', async () => {
    const { app } = realApp();
    const first = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const second = await register(app, 'CEIP Dos', 'dos@example.com');

    const response = await createCourse(app, first.accessToken, {
      name: '1º Primaria',
      schoolId: second.schoolId,
      classes: [{ name: 'A', tutorId: crypto.randomUUID() }],
    });

    expect(response.status).toBe(201);
    const { course } = (response.body as { data: { course: CourseBody } }).data;
    const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.schoolId).toBe(first.schoolId);
  });

  it('lists only the courses of the school, with their classes, in natural order', async () => {
    const { app } = realApp();
    const first = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const second = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    for (const name of ['10º Curso', '2º Primaria', '1º Primaria']) {
      await createCourse(app, first.accessToken, { name, classes: [{ name: 'B' }, { name: 'A' }] });
    }
    await createCourse(app, second.accessToken, { name: '3º Primaria', classes: [{ name: 'A' }] });

    const response = await listCourses(app, first.accessToken);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { courses } = (response.body as { data: { courses: CourseBody[] } }).data;
    expect(courses.map(({ name }) => name)).toEqual(['1º Primaria', '2º Primaria', '10º Curso']);
    expect(courses[0]?.classes.map(({ name }) => name)).toEqual(['A', 'B']);
  });

  it('lists an empty array for a school without courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await listCourses(app, accessToken);

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown }).data).toEqual({ courses: [] });
  });

  it('answers 409 COURSE_ALREADY_EXISTS for the same name with other case or spaces, and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    await createCourse(app, accessToken, { name: '1º Primaria', classes: [{ name: 'A' }] });

    const response = await createCourse(app, accessToken, {
      name: '  1º   PRIMARIA ',
      classes: [{ name: 'A' }, { name: 'B' }],
    });

    expect(response.status).toBe(409);
    expect((response.body as { error: { code: string } }).error.code).toBe('COURSE_ALREADY_EXISTS');
    expect(await testPrisma.course.count()).toBe(1);
    expect(await testPrisma.schoolClass.count()).toBe(1);
  });

  it('allows the same course name in another school', async () => {
    const { app } = realApp();
    const first = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const second = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    await createCourse(app, first.accessToken, { name: '1º Primaria', classes: [{ name: 'A' }] });

    const response = await createCourse(app, second.accessToken, {
      name: '1º Primaria',
      classes: [{ name: 'A' }],
    });

    expect(response.status).toBe(201);
    expect(await testPrisma.course.count()).toBe(2);
  });

  it('creates a single course when two identical requests arrive at the same time', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const body = { name: '1º Primaria', classes: [{ name: 'A' }, { name: 'B' }] };

    const [first, second] = await Promise.all([
      createCourse(app, accessToken, body),
      createCourse(app, accessToken, body),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await testPrisma.course.count()).toBe(1);
    expect(await testPrisma.schoolClass.count()).toBe(2);
  });

  it('answers 400 VALIDATION_ERROR with the invalid fields and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await createCourse(app, accessToken, {
      name: '',
      classes: [{ name: 'A' }, { name: ' a ' }, { name: 'B/' }],
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'name', code: 'REQUIRED' },
          { field: 'classes[1].name', code: 'DUPLICATE' },
          { field: 'classes[2].name', code: 'INVALID_CHARACTERS' },
        ],
      },
    });
    expect(await testPrisma.course.count()).toBe(0);
  });

  it('lets a member create and list courses', async () => {
    const { app, tokenIssuer } = realApp();
    const { schoolId } = await register(app, 'CEIP Uno', 'uno@example.com');
    await addMember(schoolId, 'miembro@example.com');
    // El miembro entra con su propio token: se emite para su sesión y se lee su rol de la base de datos.
    const memberSession = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'miembro@example.com' },
    });
    const refresh = await testPrisma.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: memberSession.id,
        tokenHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const accessToken = await tokenIssuer.issueAccessToken({
      userId: memberSession.id,
      schoolId,
      role: 'MEMBER',
      sessionId: refresh.id,
    });

    const created = await createCourse(app, accessToken, {
      name: '1º Primaria',
      classes: [{ name: 'A' }],
    });
    const listed = await listCourses(app, accessToken);

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect((listed.body as { data: { courses: unknown[] } }).data.courses).toHaveLength(1);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const created = await request(app).post('/api/courses').send({ name: 'x', classes: [] });
    const listed = await request(app).get('/api/courses');

    expect(created.status).toBe(401);
    expect(listed.status).toBe(401);
    expect(listed.headers['www-authenticate']).toBe('Bearer');
  });

  it('answers 401 for the token of a session that has been logged out', async () => {
    const { app } = realApp();
    const { accessToken, cookie } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    await request(app)
      .post('/api/auth/logout')
      .set('Origin', TEST_APP_ORIGIN)
      .set('Cookie', cookie)
      .expect(204);

    expect((await listCourses(app, accessToken)).status).toBe(401);
    expect(
      (await createCourse(app, accessToken, { name: '1º', classes: [{ name: 'A' }] })).status,
    ).toBe(401);
  });
});

describe('courses with a database that closes the connection', () => {
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

    const created = await createCourse(app, accessToken, {
      name: '1º Primaria',
      classes: [{ name: 'A' }],
    });
    const listed = await listCourses(app, accessToken);

    expect(created.status).toBe(503);
    expect(listed.status).toBe(503);
    expect((listed.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    await prisma.$disconnect();
  });
});
