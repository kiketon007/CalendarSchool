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
  createdAt: string;
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
    // La fecha de la respuesta es la que guardó la base de datos, en ISO 8601.
    expect(course.createdAt).toBe(stored.createdAt.toISOString());
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
    const stored = await testPrisma.course.findMany({ where: { schoolId: first.schoolId } });
    for (const listed of courses) {
      const row = stored.find(({ id }) => id === listed.id);
      expect(listed.createdAt).toBe(row?.createdAt.toISOString());
    }
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

const getCourse = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/courses/${id}`).set('Authorization', `Bearer ${accessToken}`);

const updateCourse = (app: App, accessToken: string, id: string, body: unknown) =>
  request(app)
    .put(`/api/courses/${id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

/** Crea un curso por la API y devuelve su cuerpo y el `id` de cada clase por nombre. */
async function createdCourse(app: App, accessToken: string, name: string, classNames: string[]) {
  const response = await createCourse(app, accessToken, {
    name,
    classes: classNames.map((className) => ({ name: className })),
  });
  expect(response.status).toBe(201);
  const { course } = (response.body as { data: { course: CourseBody } }).data;
  // Los tests solo usan las clases A, B, C y X: con claves fijas, indexar no devuelve `undefined`.
  const ids = Object.fromEntries(
    course.classes.map(({ id, name: className }) => [className, id]),
  ) as Record<'A' | 'B' | 'C' | 'X', string>;
  return { course, ids };
}

const errorCodeOf = (response: request.Response) =>
  (response.body as { error: { code: string } }).error.code;

const courseOf = (response: request.Response) =>
  (response.body as { data: { course: CourseBody } }).data.course;

/** Nombre de cada clase guardada del curso, por `id`. */
async function storedClasses(courseId: string) {
  const classes = await testPrisma.schoolClass.findMany({ where: { courseId } });
  return Object.fromEntries(classes.map(({ id, name }) => [id, name]));
}

describe('reading and editing a course against the test database', () => {
  it('reads a course of the school with its classes in natural order', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course } = await createdCourse(app, accessToken, '1º Primaria', ['B10', 'B2', 'A']);

    const response = await getCourse(app, accessToken, course.id);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const read = courseOf(response);
    expect(read).toMatchObject({ id: course.id, name: '1º Primaria', createdAt: course.createdAt });
    expect(read.classes.map(({ name, tutor }) => [name, tutor])).toEqual([
      ['A', null],
      ['B2', null],
      ['B10', null],
    ]);
  });

  it('answers 404 NOT_FOUND to read or edit a course of another school, one that does not exist, or an id that is not a UUID', async () => {
    const { app } = realApp();
    const first = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const second = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const { course, ids } = await createdCourse(app, second.accessToken, '1º Primaria', ['A']);
    const body = { name: 'Otro', classes: [{ id: ids.A, name: 'A' }] };

    for (const id of [course.id, crypto.randomUUID(), 'abc']) {
      const read = await getCourse(app, first.accessToken, id);
      const edited = await updateCourse(app, first.accessToken, id, body);
      expect([read.status, edited.status]).toEqual([404, 404]);
      expect([errorCodeOf(read), errorCodeOf(edited)]).toEqual(['NOT_FOUND', 'NOT_FOUND']);
    }
    const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.name).toBe('1º Primaria');
  });

  it('renames the course and a class keeping its id, and keeps the creation date', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '  1º   Primaria Tarde ',
      classes: [
        { id: ids.A, name: ' Grupo   A ' },
        { id: ids.B, name: 'B' },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const updated = courseOf(response);
    expect(updated).toMatchObject({
      id: course.id,
      name: '1º Primaria Tarde',
      createdAt: course.createdAt,
    });
    expect(updated.classes.map(({ id, name }) => [id, name])).toEqual([
      [ids.B, 'B'],
      [ids.A, 'Grupo A'],
    ]);
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'Grupo A', [ids.B]: 'B' });
    const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.normalizedName).toBe('1º primaria tarde');
  });

  it('adds a class, removes another and gives the new one a new id', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B', 'C']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.A, name: 'A' }, { id: ids.B, name: 'B' }, { name: 'D' }],
    });

    expect(response.status).toBe(200);
    const classes = await storedClasses(course.id);
    expect(Object.values(classes).sort()).toEqual(['A', 'B', 'D']);
    expect(classes[ids.C]).toBeUndefined();
    expect(courseOf(response).classes.map(({ name }) => name)).toEqual(['A', 'B', 'D']);
  });

  it('swaps the names of two classes and reuses the name of a removed one', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B', 'C']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.A, name: 'B' }, { id: ids.B, name: 'A' }, { name: 'C' }],
    });

    expect(response.status).toBe(200);
    const classes = await storedClasses(course.id);
    expect(classes[ids.A]).toBe('B');
    expect(classes[ids.B]).toBe('A');
    expect(classes[ids.C]).toBeUndefined();
    expect(Object.values(classes).sort()).toEqual(['A', 'B', 'C']);
  });

  it('accepts a name that only changes its capitals, which does not count against the course itself', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º primaria', ['A']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º PRIMARIA',
      classes: [{ id: ids.A, name: 'a' }],
    });

    expect(response.status).toBe(200);
    expect(courseOf(response).name).toBe('1º PRIMARIA');
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'a' });
  });

  it('answers 200 without changing anything to a request equal to the stored state', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const before = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A' },
        { id: ids.B, name: 'B' },
      ],
    });

    expect(response.status).toBe(200);
    const after = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B' });
  });

  it('answers 409 COURSE_ALREADY_EXISTS for the name of another course of the school and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    await createdCourse(app, accessToken, '6º Primaria', ['A']);
    const { course, ids } = await createdCourse(app, accessToken, '5º Primaria', ['A', 'B']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '  6º   primaria ',
      classes: [{ id: ids.A, name: 'Grupo A' }, { id: ids.B, name: 'B' }, { name: 'C' }],
    });

    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('COURSE_ALREADY_EXISTS');
    const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.name).toBe('5º Primaria');
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B' });
  });

  it('allows the name that a course of another school has', async () => {
    const { app } = realApp();
    const first = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const second = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    await createdCourse(app, second.accessToken, '6º Primaria', ['A']);
    const { course, ids } = await createdCourse(app, first.accessToken, '5º Primaria', ['A']);

    const response = await updateCourse(app, first.accessToken, course.id, {
      name: '6º Primaria',
      classes: [{ id: ids.A, name: 'A' }],
    });

    expect(response.status).toBe(200);
  });

  it('answers 409 COURSE_CHANGED for a class removed in the meantime and saves nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    // Otra persona quita la clase B mientras esta edita.
    await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.A, name: 'A' }],
    });

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria Tarde',
      classes: [
        { id: ids.A, name: 'Grupo A' },
        { id: ids.B, name: 'Grupo B' },
      ],
    });

    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('COURSE_CHANGED');
    const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.name).toBe('1º Primaria');
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A' });
  });

  it('answers 409 COURSE_CHANGED for a class of another course and touches neither course', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A']);
    const other = await createdCourse(app, accessToken, '2º Primaria', ['X']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A' },
        { id: other.ids.X, name: 'Y' },
      ],
    });

    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('COURSE_CHANGED');
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A' });
    expect(await storedClasses(other.course.id)).toEqual({ [other.ids.X]: 'X' });
  });

  it('answers 400 VALIDATION_ERROR with the invalid fields, including the class ids, and saves nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);

    const response = await updateCourse(app, accessToken, course.id, {
      name: '',
      classes: [
        { id: ids.A, name: 'A' },
        { id: ids.A, name: 'B' },
        { id: 'abc', name: 'C/' },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'name', code: 'REQUIRED' },
          { field: 'classes[1].id', code: 'DUPLICATE' },
          { field: 'classes[2].id', code: 'INVALID_FORMAT' },
          { field: 'classes[2].name', code: 'INVALID_CHARACTERS' },
        ],
      },
    });
    expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B' });
  });

  it('serializes two simultaneous edits of the same course: never a 500, and a removed class is not brought back', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);

    const [removing, renaming] = await Promise.all([
      updateCourse(app, accessToken, course.id, {
        name: '1º Primaria',
        classes: [{ id: ids.A, name: 'A' }],
      }),
      updateCourse(app, accessToken, course.id, {
        name: '1º Primaria',
        classes: [
          { id: ids.A, name: 'A' },
          { id: ids.B, name: 'Grupo B' },
        ],
      }),
    ]);

    expect(removing.status).toBe(200);
    expect([200, 409]).toContain(renaming.status);
    if (renaming.status === 409) {
      expect(errorCodeOf(renaming)).toBe('COURSE_CHANGED');
    }
    // Si el borrado va primero, el renombrado falla; si va después, el borrado quita la clase renombrada.
    expect(Object.keys(await storedClasses(course.id))).toEqual([ids.A]);
  });

  it('lets a member read and edit a course', async () => {
    const { app, tokenIssuer } = realApp();
    const admin = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, admin.accessToken, '1º Primaria', ['A']);
    await addMember(admin.schoolId, 'miembro@example.com');
    const member = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'miembro@example.com' },
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
      schoolId: admin.schoolId,
      role: 'MEMBER',
      sessionId: refresh.id,
    });

    const read = await getCourse(app, accessToken, course.id);
    const edited = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria Tarde',
      classes: [{ id: ids.A, name: 'A' }],
    });

    expect(read.status).toBe(200);
    expect(edited.status).toBe(200);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const read = await request(app).get(`/api/courses/${id}`);
    const edited = await request(app).put(`/api/courses/${id}`).send({ name: 'x', classes: [] });

    expect(read.status).toBe(401);
    expect(edited.status).toBe(401);
    expect(edited.headers['www-authenticate']).toBe('Bearer');
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
    const read = await getCourse(app, accessToken, crypto.randomUUID());
    const edited = await updateCourse(app, accessToken, crypto.randomUUID(), {
      name: '1º Primaria',
      classes: [{ name: 'A' }],
    });

    expect(created.status).toBe(503);
    expect(listed.status).toBe(503);
    expect(read.status).toBe(503);
    expect(edited.status).toBe(503);
    expect((listed.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    await prisma.$disconnect();
  });
});
