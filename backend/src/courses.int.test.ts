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

const courseImpact = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/courses/${id}/impact`).set('Authorization', `Bearer ${accessToken}`);

const deleteCourse = (app: App, accessToken: string, id: string) =>
  request(app).delete(`/api/courses/${id}`).set('Authorization', `Bearer ${accessToken}`);

describe('deleting a course against the test database', () => {
  it('reports the impact without changing anything and then deletes the course with its classes', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B', 'C']);
    await createdCourse(app, accessToken, '2º Primaria', ['A']);

    const impact = await courseImpact(app, accessToken, course.id);

    expect(impact.status).toBe(200);
    expect(impact.headers['cache-control']).toBe('no-store');
    expect((impact.body as { data: unknown }).data).toEqual({
      impact: { classCount: 3, studentCount: 0 },
    });
    expect(await testPrisma.course.count()).toBe(2);

    const response = await deleteCourse(app, accessToken, course.id);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((response.body as { data: unknown }).data).toEqual({
      deleted: { classCount: 3, studentCount: 0 },
    });
    expect(await testPrisma.course.findUnique({ where: { id: course.id } })).toBeNull();
    expect(await storedClasses(course.id)).toEqual({});
    expect(await testPrisma.course.count()).toBe(1);
    expect(await testPrisma.schoolClass.count()).toBe(1);
  });

  it('counts the students of the course in the impact and in the delete, and leaves them without course nor class', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const other = await createdCourse(app, accessToken, '2º Primaria', ['A']);
    const students = [
      { courseId: course.id, classId: ids.A },
      { courseId: course.id, classId: ids.A },
      { courseId: course.id, classId: null },
      { courseId: other.course.id, classId: other.ids.A },
    ];
    const created = await Promise.all(
      students.map(({ courseId, classId }, index) =>
        testPrisma.student.create({
          data: {
            id: crypto.randomUUID(),
            schoolId,
            courseId,
            classId,
            firstName: `Alumno ${String(index)}`,
            lastName: 'García',
            cafeteria: false,
          },
        }),
      ),
    );

    const impact = await courseImpact(app, accessToken, course.id);

    expect((impact.body as { data: unknown }).data).toEqual({
      impact: { classCount: 2, studentCount: 3 },
    });

    const response = await deleteCourse(app, accessToken, course.id);

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown }).data).toEqual({
      deleted: { classCount: 2, studentCount: 3 },
    });
    const stored = await testPrisma.student.findMany({ orderBy: { firstName: 'asc' } });
    expect(stored.map(({ id }) => id).sort()).toEqual(created.map(({ id }) => id).sort());
    expect(stored.map(({ courseId, classId }) => ({ courseId, classId }))).toEqual([
      { courseId: null, classId: null },
      { courseId: null, classId: null },
      { courseId: null, classId: null },
      { courseId: other.course.id, classId: other.ids.A },
    ]);
  });

  it('keeps the students of a class that is removed from the course, now without class', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const student = await testPrisma.student.create({
      data: {
        id: crypto.randomUUID(),
        schoolId,
        courseId: course.id,
        classId: ids.A,
        firstName: 'Juan',
        lastName: 'García',
        cafeteria: false,
      },
    });

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.B, name: 'B' }],
    });

    expect(response.status).toBe(200);
    expect(
      await testPrisma.student.findUniqueOrThrow({
        where: { id: student.id },
        select: { courseId: true, classId: true },
      }),
    ).toEqual({ courseId: course.id, classId: null });
  });

  it('answers 404 to everything about a course that was already deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A']);
    await deleteCourse(app, accessToken, course.id).expect(200);

    const again = await deleteCourse(app, accessToken, course.id);
    const impact = await courseImpact(app, accessToken, course.id);
    const read = await getCourse(app, accessToken, course.id);
    const edited = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.A, name: 'A' }],
    });

    expect([again.status, impact.status, read.status, edited.status]).toEqual([404, 404, 404, 404]);
    expect(errorCodeOf(again)).toBe('NOT_FOUND');
  });

  it('answers 404 to the impact and the delete of a course of another school, a missing one or an id that is not a UUID, and deletes nothing', async () => {
    const { app } = realApp();
    const first = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const second = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const { course } = await createdCourse(app, second.accessToken, '1º Primaria', ['A', 'B']);

    for (const id of [course.id, crypto.randomUUID(), 'abc']) {
      const impact = await courseImpact(app, first.accessToken, id);
      const removed = await deleteCourse(app, first.accessToken, id);
      expect([impact.status, removed.status]).toEqual([404, 404]);
      expect([errorCodeOf(impact), errorCodeOf(removed)]).toEqual(['NOT_FOUND', 'NOT_FOUND']);
    }
    expect(await testPrisma.course.count()).toBe(1);
    expect(await testPrisma.schoolClass.count()).toBe(2);
  });

  it('deletes the course once when two requests arrive at the same time', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);

    const [first, second] = await Promise.all([
      deleteCourse(app, accessToken, course.id),
      deleteCourse(app, accessToken, course.id),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 404]);
    expect(await testPrisma.course.count()).toBe(0);
    expect(await testPrisma.schoolClass.count()).toBe(0);
  });

  it('never answers 500 when an edit and a delete of the same course arrive at the same time', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);

    const [removed, edited] = await Promise.all([
      deleteCourse(app, accessToken, course.id),
      updateCourse(app, accessToken, course.id, {
        name: '1º Primaria Tarde',
        classes: [
          { id: ids.A, name: 'A' },
          { id: ids.B, name: 'B' },
        ],
      }),
    ]);

    expect(removed.status).toBe(200);
    expect([200, 404]).toContain(edited.status);
    expect(await testPrisma.course.count()).toBe(0);
    expect(await testPrisma.schoolClass.count()).toBe(0);
  });

  it('lets a member see the impact and delete a course', async () => {
    const { app, tokenIssuer } = realApp();
    const admin = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course } = await createdCourse(app, admin.accessToken, '1º Primaria', ['A']);
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

    const impact = await courseImpact(app, accessToken, course.id);
    const removed = await deleteCourse(app, accessToken, course.id);

    expect(impact.status).toBe(200);
    expect(removed.status).toBe(200);
    expect(await testPrisma.course.count()).toBe(0);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const impact = await request(app).get(`/api/courses/${id}/impact`);
    const removed = await request(app).delete(`/api/courses/${id}`);

    expect(impact.status).toBe(401);
    expect(removed.status).toBe(401);
    expect(removed.headers['www-authenticate']).toBe('Bearer');
  });
});

describe('choosing the tutors from the course edition against the test database', () => {
  interface TutoredClassBody {
    id: string;
    name: string;
    tutor: { id: string; firstName: string; lastName: string } | null;
  }

  const createProfessor = async (app: App, accessToken: string, firstName: string) => {
    const response = await request(app)
      .post('/api/professors')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName, lastName: 'García' });
    expect(response.status).toBe(201);
    return (response.body as { data: { professor: { id: string } } }).data.professor.id;
  };

  const tutorsOf = (response: request.Response) =>
    Object.fromEntries(
      (
        response.body as { data: { course: { classes: TutoredClassBody[] } } }
      ).data.course.classes.map(({ name, tutor }) => [name, tutor?.id ?? null]),
    );

  const storedTutors = async (courseId: string) => {
    const classes = await testPrisma.schoolClass.findMany({ where: { courseId } });
    return Object.fromEntries(classes.map(({ name, tutorId }) => [name, tutorId]));
  };

  it('assigns a tutor and sees it in the list of courses and in the list of professors', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const ana = await createProfessor(app, accessToken, 'Ana');

    const edited = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A', tutorId: ana },
        { id: ids.B, name: 'B' },
      ],
    });

    expect(edited.status).toBe(200);
    expect(tutorsOf(edited)).toEqual({ A: ana, B: null });
    const listed = await listCourses(app, accessToken);
    const listedClasses = (listed.body as { data: { courses: { classes: TutoredClassBody[] }[] } })
      .data.courses[0]?.classes;
    expect(listedClasses?.find(({ name }) => name === 'A')?.tutor).toMatchObject({ id: ana });
    const professors = await request(app)
      .get('/api/professors')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(
      (professors.body as { data: { professors: { tutoredClass: { name: string } | null }[] } })
        .data.professors[0]?.tutoredClass,
    ).toMatchObject({ name: 'A' });
  });

  it('swaps the tutors of two classes and removes one in the following edit', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const ana = await createProfessor(app, accessToken, 'Ana');
    const luis = await createProfessor(app, accessToken, 'Luis');
    await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A', tutorId: ana },
        { id: ids.B, name: 'B', tutorId: luis },
      ],
    });

    const swapped = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A', tutorId: luis },
        { id: ids.B, name: 'B', tutorId: ana },
      ],
    });
    const removed = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A', tutorId: null },
        { id: ids.B, name: 'B' },
      ],
    });

    expect(tutorsOf(swapped)).toEqual({ A: luis, B: ana });
    expect(tutorsOf(removed)).toEqual({ A: null, B: ana });
  });

  it('answers 409 PROFESSOR_ALREADY_TUTOR for a professor of another course and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A']);
    const { course: other, ids: otherIds } = await createdCourse(app, accessToken, '2º Primaria', [
      'A',
    ]);
    const ana = await createProfessor(app, accessToken, 'Ana');
    await updateCourse(app, accessToken, other.id, {
      name: '2º Primaria',
      classes: [{ id: otherIds.A, name: 'A', tutorId: ana }],
    });

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria Tarde',
      classes: [{ id: ids.A, name: 'A', tutorId: ana }],
    });

    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('PROFESSOR_ALREADY_TUTOR');
    const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.name).toBe('1º Primaria');
    expect(await storedTutors(course.id)).toEqual({ A: null });
    expect(await storedTutors(other.id)).toEqual({ A: ana });
  });

  it('answers 400 NOT_FOUND on the tutorId of the class for a professor of another school', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const other = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const foreign = await createProfessor(app, other.accessToken, 'Marta');

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A' },
        { id: ids.B, name: 'B', tutorId: foreign },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'classes[1].tutorId', code: 'NOT_FOUND' }],
      },
    });
    expect(await storedTutors(course.id)).toEqual({ A: null, B: null });
  });

  it('answers 400 VALIDATION_ERROR for a tutorId that is not valid or is repeated, and saves nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const ana = await createProfessor(app, accessToken, 'Ana');

    const invalid = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.A, name: 'A', tutorId: 'abc' }],
    });
    const repeated = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A', tutorId: ana },
        { id: ids.B, name: 'B', tutorId: ana },
      ],
    });

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      error: { details: [{ field: 'classes[0].tutorId', code: 'INVALID_FORMAT' }] },
    });
    expect(repeated.status).toBe(400);
    expect(repeated.body).toMatchObject({
      error: { details: [{ field: 'classes[1].tutorId', code: 'DUPLICATE' }] },
    });
    expect(await storedTutors(course.id)).toEqual({ A: null, B: null });
  });

  it('keeps the tutors when the edition carries no tutorId', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, accessToken, '1º Primaria', ['A', 'B']);
    const ana = await createProfessor(app, accessToken, 'Ana');
    await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [
        { id: ids.A, name: 'A', tutorId: ana },
        { id: ids.B, name: 'B' },
      ],
    });

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria Tarde',
      classes: [{ id: ids.A, name: 'Grupo A' }, { id: ids.B, name: 'B' }, { name: 'C' }],
    });

    expect(response.status).toBe(200);
    expect(tutorsOf(response)).toEqual({ 'Grupo A': ana, B: null, C: null });
  });

  it('never answers 500 when two courses give the same professor a class at the same time', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course: first, ids: firstIds } = await createdCourse(app, accessToken, '1º Primaria', [
      'A',
    ]);
    const { course: second, ids: secondIds } = await createdCourse(
      app,
      accessToken,
      '2º Primaria',
      ['A'],
    );
    const ana = await createProfessor(app, accessToken, 'Ana');

    const responses = await Promise.all([
      updateCourse(app, accessToken, first.id, {
        name: '1º Primaria',
        classes: [{ id: firstIds.A, name: 'A', tutorId: ana }],
      }),
      updateCourse(app, accessToken, second.id, {
        name: '2º Primaria',
        classes: [{ id: secondIds.A, name: 'A', tutorId: ana }],
      }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const loser = responses.find(({ status }) => status === 409);
    expect(errorCodeOf(loser as request.Response)).toBe('PROFESSOR_ALREADY_TUTOR');
    expect(await testPrisma.schoolClass.count({ where: { tutorId: ana } })).toBe(1);
  });

  it('lets a member choose the tutors', async () => {
    const { app, tokenIssuer } = realApp();
    const admin = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { course, ids } = await createdCourse(app, admin.accessToken, '1º Primaria', ['A']);
    const ana = await createProfessor(app, admin.accessToken, 'Ana');
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

    const response = await updateCourse(app, accessToken, course.id, {
      name: '1º Primaria',
      classes: [{ id: ids.A, name: 'A', tutorId: ana }],
    });

    expect(response.status).toBe(200);
    expect(tutorsOf(response)).toEqual({ A: ana });
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
      classes: [{ name: 'A', tutorId: crypto.randomUUID() }],
    });

    expect(created.status).toBe(503);
    expect(listed.status).toBe(503);
    const impact = await courseImpact(app, accessToken, crypto.randomUUID());
    const removed = await deleteCourse(app, accessToken, crypto.randomUUID());

    expect(read.status).toBe(503);
    expect(edited.status).toBe(503);
    expect(impact.status).toBe(503);
    expect(removed.status).toBe(503);
    expect((listed.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    await prisma.$disconnect();
  });
});
