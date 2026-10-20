import { createServer, type Server, type Socket } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';

type App = ReturnType<typeof realApp>['app'];

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio con su administrador y devuelve su access token y los ids. */
async function adminOf(app: App, schoolName: string, email: string) {
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
  const data = (registered.body as { data: { school: { id: string } } }).data;
  const refreshed = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookieOf(registered));
  expect(refreshed.status).toBe(200);
  const accessToken = (refreshed.body as { data: { session: { accessToken: string } } }).data
    .session.accessToken;
  return { accessToken, schoolId: data.school.id };
}

const createProfessor = (app: App, accessToken: string, body: unknown) =>
  request(app)
    .post('/api/professors')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

const listProfessors = (app: App, accessToken: string) =>
  request(app).get('/api/professors').set('Authorization', `Bearer ${accessToken}`);

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
  classes: {
    id: string;
    name: string;
    tutor: { id: string; firstName: string; lastName: string } | null;
  }[];
}

interface ProfessorBody {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  subjects: unknown[];
  tutoredClass: { id: string; name: string; courseId: string; courseName: string } | null;
}

/** Crea un curso con las clases dadas y devuelve su cuerpo. */
async function courseWith(app: App, accessToken: string, name: string, classNames: string[]) {
  const response = await createCourse(app, accessToken, {
    name,
    classes: classNames.map((className) => ({ name: className })),
  });
  expect(response.status).toBe(201);
  return (response.body as { data: { course: CourseBody } }).data.course;
}

describe('professors against the test database', () => {
  it('creates a professor without class and lists it with no subjects and no class', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const created = await createProfessor(app, accessToken, {
      firstName: '  José   María ',
      lastName: 'García López',
    });

    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const { professor } = (created.body as { data: { professor: ProfessorBody } }).data;
    expect(professor).toMatchObject({
      firstName: 'José María',
      lastName: 'García López',
      position: null,
      subjects: [],
      tutoredClass: null,
    });
    const stored = await testPrisma.professor.findUniqueOrThrow({ where: { id: professor.id } });
    expect(stored.schoolId).toBe(schoolId);

    const listed = await listProfessors(app, accessToken);
    expect(listed.status).toBe(200);
    expect((listed.body as { data: { professors: ProfessorBody[] } }).data.professors).toEqual([
      professor,
    ]);
  });

  it('creates a professor with position and class, and the class shows its tutor in GET /api/courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A', 'B']);
    const classA = course.classes.find(({ name }) => name === 'A');

    const created = await createProfessor(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
      position: 'JEFE_ESTUDIOS',
      classId: classA?.id,
    });

    expect(created.status).toBe(201);
    const { professor } = (created.body as { data: { professor: ProfessorBody } }).data;
    expect(professor.position).toBe('JEFE_ESTUDIOS');
    expect(professor.tutoredClass).toEqual({
      id: classA?.id,
      name: 'A',
      courseId: course.id,
      courseName: '1º Primaria',
    });

    const listed = await listCourses(app, accessToken);
    const [listedCourse] = (listed.body as { data: { courses: CourseBody[] } }).data.courses;
    expect(listedCourse?.classes.map(({ name, tutor }) => [name, tutor])).toEqual([
      ['A', { id: professor.id, firstName: 'Ana', lastName: 'García' }],
      ['B', null],
    ]);
  });

  it('lists the professors ordered by last name and then first name, only those of the school', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    for (const [firstName, lastName] of [
      ['Luis', 'Pérez'],
      ['Ana', 'García'],
      ['Beatriz', 'García'],
    ]) {
      expect((await createProfessor(app, one.accessToken, { firstName, lastName })).status).toBe(
        201,
      );
    }
    await createProfessor(app, two.accessToken, { firstName: 'Eva', lastName: 'Otra' });

    const listed = await listProfessors(app, one.accessToken);

    const names = (listed.body as { data: { professors: ProfessorBody[] } }).data.professors.map(
      ({ firstName, lastName }) => `${firstName} ${lastName}`,
    );
    expect(names).toEqual(['Ana García', 'Beatriz García', 'Luis Pérez']);
  });

  it('answers 409 CLASS_ALREADY_HAS_TUTOR for a class with a tutor, keeps that tutor and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);
    const classId = course.classes[0]?.id;
    const first = await createProfessor(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
      classId,
    });
    expect(first.status).toBe(201);

    const second = await createProfessor(app, accessToken, {
      firstName: 'Luis',
      lastName: 'Pérez',
      classId,
    });

    expect(second.status).toBe(409);
    expect((second.body as { error: { code: string } }).error.code).toBe('CLASS_ALREADY_HAS_TUTOR');
    expect(await testPrisma.professor.count()).toBe(1);
  });

  it('answers 400 VALIDATION_ERROR with NOT_FOUND on classId for a class of another school, and creates nothing', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreign = await courseWith(app, two.accessToken, '1º Primaria', ['A']);

    const response = await createProfessor(app, one.accessToken, {
      firstName: 'Ana',
      lastName: 'García',
      classId: foreign.classes[0]?.id,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'classId', code: 'NOT_FOUND' }] },
    });
    expect(await testPrisma.professor.count()).toBe(0);
    const stored = await testPrisma.schoolClass.findUniqueOrThrow({
      where: { id: foreign.classes[0]?.id ?? '' },
    });
    expect(stored.tutorId).toBeNull();
  });

  it('answers 400 VALIDATION_ERROR with the invalid fields and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await createProfessor(app, accessToken, {
      firstName: '',
      lastName: 'García',
      position: 'PORTERO',
      classId: 'no-es-uuid',
    });

    expect(response.status).toBe(400);
    const details = (response.body as { error: { details: { field: string }[] } }).error.details;
    expect(details.map(({ field }) => field)).toEqual(['firstName', 'position', 'classId']);
    expect(await testPrisma.professor.count()).toBe(0);
  });

  it('creates only one professor when two arrive at the same time for the same class', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);
    const classId = course.classes[0]?.id;

    const [first, second] = await Promise.all([
      createProfessor(app, accessToken, { firstName: 'Ana', lastName: 'García', classId }),
      createProfessor(app, accessToken, { firstName: 'Luis', lastName: 'Pérez', classId }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await testPrisma.professor.count()).toBe(1);
  });

  it('keeps the tutors when the course is edited and frees the professors when it is deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A', 'B']);
    const [classA, classB] = course.classes;
    const created = await createProfessor(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
      classId: classA?.id,
    });
    const professorId = (created.body as { data: { professor: ProfessorBody } }).data.professor.id;

    const edited = await request(app)
      .put(`/api/courses/${course.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: '1º Primaria',
        classes: [
          { id: classA?.id, name: 'Grupo A' },
          { id: classB?.id, name: 'B' },
        ],
      });

    expect(edited.status).toBe(200);
    const editedClasses = (edited.body as { data: { course: CourseBody } }).data.course.classes;
    expect(editedClasses.find(({ id }) => id === classA?.id)).toMatchObject({
      name: 'Grupo A',
      tutor: { id: professorId, firstName: 'Ana', lastName: 'García' },
    });

    const removed = await request(app)
      .delete(`/api/courses/${course.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(removed.status).toBe(200);
    const listed = await listProfessors(app, accessToken);
    expect((listed.body as { data: { professors: ProfessorBody[] } }).data.professors).toEqual([
      expect.objectContaining({ id: professorId, tutoredClass: null }),
    ]);
  });

  it('lets a member create and list professors', async () => {
    const { app, tokenIssuer } = realApp();
    const { schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const member = await testPrisma.user.create({
      data: {
        id: crypto.randomUUID(),
        schoolId,
        email: 'miembro@example.com',
        passwordHash: '$2b$12$'.padEnd(60, 'x'),
        firstName: 'Miembro',
        lastName: 'Colegio',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    });
    const refresh = await testPrisma.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: member.id,
        tokenHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const accessToken = await tokenIssuer.issueAccessToken({
      userId: member.id,
      schoolId,
      role: 'MEMBER',
      sessionId: refresh.id,
    });

    const created = await createProfessor(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
    });
    const listed = await listProfessors(app, accessToken);

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect((listed.body as { data: { professors: unknown[] } }).data.professors).toHaveLength(1);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const created = await request(app)
      .post('/api/professors')
      .send({ firstName: 'Ana', lastName: 'García' });
    const listed = await request(app).get('/api/professors');

    expect(created.status).toBe(401);
    expect(listed.status).toBe(401);
    expect(created.headers['www-authenticate']).toBe('Bearer');
    expect(await testPrisma.professor.count()).toBe(0);
  });
});

describe('professors with a database that closes the connection', () => {
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

    const created = await createProfessor(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
    });
    const listed = await listProfessors(app, accessToken);

    expect(created.status).toBe(503);
    expect(listed.status).toBe(503);
    expect((listed.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    await prisma.$disconnect();
  });
});
