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

const createStudent = (app: App, accessToken: string, body: unknown) =>
  request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

const listStudents = (app: App, accessToken: string) =>
  request(app).get('/api/students').set('Authorization', `Bearer ${accessToken}`);

const createCourse = (app: App, accessToken: string, body: unknown) =>
  request(app)
    .post('/api/courses')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

interface CourseBody {
  id: string;
  name: string;
  classes: { id: string; name: string }[];
}

interface StudentBody {
  id: string;
  firstName: string;
  lastName: string;
  course: { id: string; name: string } | null;
  class: { id: string; name: string } | null;
  cafeteria: boolean;
  scholarship: boolean | null;
  foodType?: string | null;
  observations?: string | null;
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

const classOf = (course: CourseBody, name: string) =>
  course.classes.find((schoolClass) => schoolClass.name === name)?.id ?? '';

const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;

describe('students against the test database', () => {
  it('creates a student with class, cafeteria, scholarship, food type and observations, and lists it without the sensitive data', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A', 'B']);

    const created = await createStudent(app, accessToken, {
      firstName: '  Juan   Carlos ',
      lastName: 'García',
      courseId: course.id,
      classId: classOf(course, 'A'),
      cafeteria: true,
      scholarship: true,
      foodType: 'Alérgico a frutos secos',
      observations: 'Necesita apoyo',
    });

    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const { student } = (created.body as { data: { student: StudentBody } }).data;
    expect(student).toMatchObject({
      firstName: 'Juan Carlos',
      lastName: 'García',
      course: { id: course.id, name: '1º Primaria' },
      class: { id: classOf(course, 'A'), name: 'A' },
      cafeteria: true,
      scholarship: true,
      foodType: 'Alérgico a frutos secos',
      observations: 'Necesita apoyo',
    });
    expect(await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } })).toMatchObject(
      { schoolId, courseId: course.id, classId: classOf(course, 'A') },
    );

    const listed = await listStudents(app, accessToken);

    expect(listed.status).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    const { students } = (listed.body as { data: { students: StudentBody[] } }).data;
    expect(students).toHaveLength(1);
    expect(students[0]).toEqual({
      id: student.id,
      firstName: 'Juan Carlos',
      lastName: 'García',
      course: { id: course.id, name: '1º Primaria' },
      class: { id: classOf(course, 'A'), name: 'A' },
      cafeteria: true,
      scholarship: true,
    });
    expect(JSON.stringify(listed.body)).not.toContain('frutos');
    expect(JSON.stringify(listed.body)).not.toContain('apoyo');
  });

  it('creates a student without class and without cafeteria', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);

    const created = await createStudent(app, accessToken, {
      firstName: 'Ana',
      lastName: 'Álvarez',
      courseId: course.id,
      cafeteria: false,
    });

    expect(created.status).toBe(201);
    expect((created.body as { data: { student: StudentBody } }).data.student).toMatchObject({
      class: null,
      cafeteria: false,
      scholarship: null,
      foodType: null,
      observations: null,
    });
  });

  it('lists the students ordered by last name and first name, and only those of the school', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const courseOne = await courseWith(app, one.accessToken, '1º Primaria', ['A']);
    const courseTwo = await courseWith(app, two.accessToken, '1º Primaria', ['A']);
    for (const [first, last] of [
      ['Juan', 'García'],
      ['Ana', 'Álvarez'],
      ['Eva', 'García'],
    ] as const) {
      await createStudent(app, one.accessToken, {
        firstName: first,
        lastName: last,
        courseId: courseOne.id,
        cafeteria: false,
      });
    }
    await createStudent(app, two.accessToken, {
      firstName: 'Otro',
      lastName: 'Colegio',
      courseId: courseTwo.id,
      cafeteria: false,
    });

    const listed = await listStudents(app, one.accessToken);

    const students = (listed.body as { data: { students: StudentBody[] } }).data.students;
    expect(students.map(({ firstName, lastName }) => `${lastName}, ${firstName}`)).toEqual([
      'Álvarez, Ana',
      'García, Eva',
      'García, Juan',
    ]);
  });

  it('answers an empty list for a school without students', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const listed = await listStudents(app, accessToken);

    expect(listed.status).toBe(200);
    expect((listed.body as { data: unknown }).data).toEqual({ students: [] });
  });

  it('answers 400 with the invalid fields, in order, and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await createStudent(app, accessToken, {
      firstName: '',
      lastName: '<b>',
      courseId: 'abc',
      cafeteria: false,
      scholarship: true,
      foodType: 'Sin gluten',
    });

    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'lastName', code: 'INVALID_CHARACTERS' },
        { field: 'courseId', code: 'INVALID_FORMAT' },
        { field: 'scholarship', code: 'NOT_ALLOWED' },
        { field: 'foodType', code: 'NOT_ALLOWED' },
      ],
    });
    expect(await testPrisma.student.count()).toBe(0);
  });

  it('answers 400 REQUIRED for the scholarship of a student with cafeteria', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);

    const response = await createStudent(app, accessToken, {
      firstName: 'Juan',
      lastName: 'García',
      courseId: course.id,
      cafeteria: true,
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([{ field: 'scholarship', code: 'REQUIRED' }]);
  });

  it('answers 400 NOT_FOUND for a course that does not exist and for a course of another school', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreign = await courseWith(app, two.accessToken, '1º Primaria', ['A']);

    for (const courseId of [crypto.randomUUID(), foreign.id]) {
      const response = await createStudent(app, one.accessToken, {
        firstName: 'Juan',
        lastName: 'García',
        courseId,
        cafeteria: false,
      });

      expect(response.status).toBe(400);
      expect(errorOf(response).details).toEqual([{ field: 'courseId', code: 'NOT_FOUND' }]);
    }
    expect(await testPrisma.student.count()).toBe(0);
  });

  it('answers 400 NOT_FOUND for a class of another course, of another school or that does not exist', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const first = await courseWith(app, one.accessToken, '1º Primaria', ['A']);
    const second = await courseWith(app, one.accessToken, '2º Primaria', ['A']);
    const foreign = await courseWith(app, two.accessToken, '1º Primaria', ['A']);

    for (const classId of [classOf(second, 'A'), classOf(foreign, 'A'), crypto.randomUUID()]) {
      const response = await createStudent(app, one.accessToken, {
        firstName: 'Juan',
        lastName: 'García',
        courseId: first.id,
        classId,
        cafeteria: false,
      });

      expect(response.status).toBe(400);
      expect(errorOf(response).details).toEqual([{ field: 'classId', code: 'NOT_FOUND' }]);
    }
    expect(await testPrisma.student.count()).toBe(0);
  });

  it('ignores a school, a status and an email in the body: the student belongs to the school of the identity', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await courseWith(app, one.accessToken, '1º Primaria', ['A']);

    const created = await createStudent(app, one.accessToken, {
      firstName: 'Juan',
      lastName: 'García',
      courseId: course.id,
      cafeteria: false,
      schoolId: two.schoolId,
      status: 'GRADUATED',
      email: 'juan@example.com',
    });

    expect(created.status).toBe(201);
    const stored = await testPrisma.student.findFirstOrThrow();
    expect(stored.schoolId).toBe(one.schoolId);
  });

  it('writes the events without names, food type or observations', async () => {
    const { app, logOutput } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);
    await createStudent(app, accessToken, {
      firstName: 'Juan',
      lastName: 'Zamorano',
      courseId: course.id,
      classId: classOf(course, 'A'),
      cafeteria: true,
      scholarship: false,
      foodType: 'Alérgico a frutos secos',
      observations: 'Diabetes tipo 1',
    });
    await createStudent(app, accessToken, {
      firstName: 'Ana',
      lastName: 'Rechazada',
      courseId: crypto.randomUUID(),
      cafeteria: false,
    });

    const log = logOutput();

    expect(log).toContain('"event":"STUDENT_CREATED"');
    expect(log).toContain('"has_class":true');
    expect(log).toContain('"event":"STUDENT_CREATION_REJECTED"');
    expect(log).toContain('"reason":"course_not_found"');
    for (const text of ['Zamorano', 'Rechazada', 'frutos', 'Diabetes']) {
      expect(log).not.toContain(text);
    }
  });

  it('lets a member create and list students', async () => {
    const { app, tokenIssuer } = realApp();
    const { accessToken: adminToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, adminToken, '1º Primaria', ['A']);
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

    const created = await createStudent(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
      courseId: course.id,
      cafeteria: false,
    });
    const listed = await listStudents(app, accessToken);

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect((listed.body as { data: { students: unknown[] } }).data.students).toHaveLength(1);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const created = await request(app)
      .post('/api/students')
      .send({ firstName: 'Ana', lastName: 'García' });
    const listed = await request(app).get('/api/students');

    expect(created.status).toBe(401);
    expect(listed.status).toBe(401);
    expect(created.headers['www-authenticate']).toBe('Bearer');
    expect(await testPrisma.student.count()).toBe(0);
  });

  it('answers 400 or 201 but never 500 when a student is created while its course is deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    for (let round = 0; round < 5; round += 1) {
      const course = await courseWith(app, accessToken, `Curso ${String(round)}`, ['A']);

      const [created, deleted] = await Promise.all([
        createStudent(app, accessToken, {
          firstName: 'Juan',
          lastName: `García ${String(round)}`,
          courseId: course.id,
          classId: classOf(course, 'A'),
          cafeteria: false,
        }),
        request(app)
          .delete(`/api/courses/${course.id}`)
          .set('Authorization', `Bearer ${accessToken}`),
      ]);

      expect(deleted.status).toBe(200);
      expect([201, 400]).toContain(created.status);
      if (created.status === 400) {
        expect(errorOf(created).details).toEqual([{ field: 'courseId', code: 'NOT_FOUND' }]);
      }
    }
    // Los alumnos que se crearon antes del borrado se quedan sin curso ni clase.
    for (const stored of await testPrisma.student.findMany()) {
      expect(stored).toMatchObject({ courseId: null, classId: null });
    }
  });
});

const getStudent = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/students/${id}`).set('Authorization', `Bearer ${accessToken}`);

const updateStudent = (app: App, accessToken: string, id: string, body: unknown) =>
  request(app)
    .put(`/api/students/${id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

const studentOf = (response: request.Response) =>
  (response.body as { data: { student: StudentBody } }).data.student;

/** Crea un alumno de «Juan García» en la clase indicada, con comedor, beca y datos sensibles. */
async function seededStudent(app: App, accessToken: string, course: CourseBody, className: string) {
  const created = await createStudent(app, accessToken, {
    firstName: 'Juan',
    lastName: 'García',
    courseId: course.id,
    classId: classOf(course, className),
    cafeteria: true,
    scholarship: true,
    foodType: 'Alérgico a frutos secos',
    observations: 'Diabetes tipo 1',
  });
  expect(created.status).toBe(201);
  return studentOf(created);
}

/** Cuerpo de `PUT` que deja al alumno de `seededStudent` igual, para cambiar solo lo que se prueba. */
const sameBody = (course: CourseBody, className: string | null) => ({
  firstName: 'Juan',
  lastName: 'García',
  courseId: course.id,
  classId: className === null ? null : classOf(course, className),
  cafeteria: true,
  scholarship: true,
  foodType: 'Alérgico a frutos secos',
  observations: 'Diabetes tipo 1',
});

describe('reading and editing students against the test database', () => {
  it('reads a student with its sensitive data and never caches it', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A', 'B']);
    const student = await seededStudent(app, accessToken, course, 'B');

    const response = await getStudent(app, accessToken, student.id);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(studentOf(response)).toEqual({
      id: student.id,
      firstName: 'Juan',
      lastName: 'García',
      course: { id: course.id, name: '1º Primaria' },
      class: { id: classOf(course, 'B'), name: 'B' },
      cafeteria: true,
      scholarship: true,
      foodType: 'Alérgico a frutos secos',
      observations: 'Diabetes tipo 1',
    });
  });

  it('edits the name, the course, the class and the cafeteria and shows the change when reading and listing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await courseWith(app, accessToken, '1º Primaria', ['A']);
    const second = await courseWith(app, accessToken, '2º Primaria', ['A', 'B']);
    const student = await seededStudent(app, accessToken, first, 'A');

    const edited = await updateStudent(app, accessToken, student.id, {
      firstName: '  Juanito ',
      lastName: 'García López',
      courseId: second.id,
      classId: classOf(second, 'B'),
      cafeteria: false,
      observations: '',
    });

    expect(edited.status).toBe(200);
    expect(edited.headers['cache-control']).toBe('no-store');
    const expected = {
      id: student.id,
      firstName: 'Juanito',
      lastName: 'García López',
      course: { id: second.id, name: '2º Primaria' },
      class: { id: classOf(second, 'B'), name: 'B' },
      cafeteria: false,
      scholarship: null,
      foodType: null,
      observations: null,
    };
    expect(studentOf(edited)).toEqual(expected);
    expect(studentOf(await getStudent(app, accessToken, student.id))).toEqual(expected);
    const listed = (await listStudents(app, accessToken)).body as {
      data: { students: StudentBody[] };
    };
    expect(listed.data.students).toEqual([
      {
        id: student.id,
        firstName: 'Juanito',
        lastName: 'García López',
        course: { id: second.id, name: '2º Primaria' },
        class: { id: classOf(second, 'B'), name: 'B' },
        cafeteria: false,
        scholarship: null,
      },
    ]);
  });

  it('treats the body as the final state: the class, the food type and the observations that are missing end up empty', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);
    const student = await seededStudent(app, accessToken, course, 'A');

    const edited = await updateStudent(app, accessToken, student.id, {
      firstName: 'Juan',
      lastName: 'García',
      courseId: course.id,
      cafeteria: true,
      scholarship: false,
    });

    expect(studentOf(edited)).toMatchObject({
      class: null,
      scholarship: false,
      foodType: null,
      observations: null,
    });
  });

  it('assigns a course to a student whose course was deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const gone = await courseWith(app, accessToken, '1º Primaria', ['A']);
    const other = await courseWith(app, accessToken, '2º Primaria', ['A']);
    const student = await seededStudent(app, accessToken, gone, 'A');
    const deleted = await request(app)
      .delete(`/api/courses/${gone.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleted.status).toBe(200);
    expect(studentOf(await getStudent(app, accessToken, student.id))).toMatchObject({
      course: null,
      class: null,
    });

    const edited = await updateStudent(app, accessToken, student.id, sameBody(other, 'A'));

    expect(edited.status).toBe(200);
    expect(studentOf(edited)).toMatchObject({
      course: { id: other.id, name: '2º Primaria' },
      class: { id: classOf(other, 'A'), name: 'A' },
    });
  });

  it('answers 400 with the invalid fields, in order, and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A']);
    const student = await seededStudent(app, accessToken, course, 'A');

    const edited = await updateStudent(app, accessToken, student.id, {
      firstName: '',
      lastName: '<b>G</b>',
      courseId: 'abc',
      cafeteria: false,
      scholarship: true,
      foodType: 'Sin gluten',
    });

    expect(edited.status).toBe(400);
    expect(errorOf(edited)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'lastName', code: 'INVALID_CHARACTERS' },
        { field: 'courseId', code: 'INVALID_FORMAT' },
        { field: 'scholarship', code: 'NOT_ALLOWED' },
        { field: 'foodType', code: 'NOT_ALLOWED' },
      ],
    });
    expect(studentOf(await getStudent(app, accessToken, student.id))).toMatchObject({
      firstName: 'Juan',
      scholarship: true,
    });
  });

  it('answers 400 NOT_FOUND for a course of another school or unknown and for a class of another course, and changes nothing', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const first = await courseWith(app, one.accessToken, '1º Primaria', ['A']);
    const second = await courseWith(app, one.accessToken, '2º Primaria', ['A']);
    const foreign = await courseWith(app, two.accessToken, '1º Primaria', ['A']);
    const student = await seededStudent(app, one.accessToken, first, 'A');

    for (const courseId of [foreign.id, crypto.randomUUID()]) {
      const edited = await updateStudent(app, one.accessToken, student.id, {
        ...sameBody(first, 'A'),
        courseId,
      });
      expect(edited.status).toBe(400);
      expect(errorOf(edited).details).toEqual([{ field: 'courseId', code: 'NOT_FOUND' }]);
    }
    for (const classId of [classOf(second, 'A'), classOf(foreign, 'A'), crypto.randomUUID()]) {
      const edited = await updateStudent(app, one.accessToken, student.id, {
        ...sameBody(first, 'A'),
        classId,
      });
      expect(edited.status).toBe(400);
      expect(errorOf(edited).details).toEqual([{ field: 'classId', code: 'NOT_FOUND' }]);
    }

    expect(studentOf(await getStudent(app, one.accessToken, student.id))).toMatchObject({
      course: { id: first.id },
      class: { id: classOf(first, 'A') },
    });
  });

  it('answers 404 for a student of another school, one that does not exist and an id that is not a UUID, and changes nothing', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await courseWith(app, one.accessToken, '1º Primaria', ['A']);
    const foreignCourse = await courseWith(app, two.accessToken, '1º Primaria', ['A']);
    const student = await seededStudent(app, one.accessToken, course, 'A');

    for (const id of [student.id, crypto.randomUUID(), 'abc']) {
      const read = await getStudent(app, two.accessToken, id);
      const edited = await updateStudent(app, two.accessToken, id, {
        ...sameBody(foreignCourse, 'A'),
        firstName: 'Intruso',
      });

      expect(read.status).toBe(404);
      expect(edited.status).toBe(404);
      expect(errorOf(read).code).toBe('NOT_FOUND');
      expect(errorOf(edited).code).toBe('NOT_FOUND');
    }
    expect(studentOf(await getStudent(app, one.accessToken, student.id))).toMatchObject({
      firstName: 'Juan',
    });
  });

  it('ignores an id, a school and a status in the body', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await courseWith(app, one.accessToken, '1º Primaria', ['A']);
    const student = await seededStudent(app, one.accessToken, course, 'A');

    const edited = await updateStudent(app, one.accessToken, student.id, {
      ...sameBody(course, 'A'),
      firstName: 'Juanito',
      id: crypto.randomUUID(),
      schoolId: two.schoolId,
      status: 'GRADUATED',
    });

    expect(edited.status).toBe(200);
    const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(stored).toMatchObject({ id: student.id, schoolId: one.schoolId, firstName: 'Juanito' });
  });

  it('writes the events without names, food type or observations', async () => {
    const { app, logOutput } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, accessToken, '1º Primaria', ['A', 'B']);
    const student = await seededStudent(app, accessToken, course, 'A');
    await updateStudent(app, accessToken, student.id, {
      ...sameBody(course, 'B'),
      firstName: 'Nombre Secreto',
      observations: 'Observaciones nuevas',
    });
    await updateStudent(app, accessToken, crypto.randomUUID(), sameBody(course, 'A'));
    await updateStudent(app, accessToken, student.id, {
      ...sameBody(course, 'A'),
      courseId: crypto.randomUUID(),
    });

    const log = logOutput();

    expect(log).toContain('"event":"STUDENT_UPDATED"');
    expect(log).toContain('"changed_fields":["firstName","classId","observations"]');
    expect(log).toContain('"event":"STUDENT_UPDATE_REJECTED"');
    expect(log).toContain('"reason":"not_found"');
    expect(log).toContain('"reason":"course_not_found"');
    for (const text of [
      'Nombre Secreto',
      'Zamorano',
      'frutos',
      'Diabetes',
      'Observaciones nuevas',
    ]) {
      expect(log).not.toContain(text);
    }
  });

  it('lets a member read and edit students', async () => {
    const { app, tokenIssuer } = realApp();
    const { accessToken: adminToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await courseWith(app, adminToken, '1º Primaria', ['A']);
    const student = await seededStudent(app, adminToken, course, 'A');
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

    const read = await getStudent(app, accessToken, student.id);
    const edited = await updateStudent(app, accessToken, student.id, {
      ...sameBody(course, 'A'),
      firstName: 'Juanito',
    });

    expect(read.status).toBe(200);
    expect(edited.status).toBe(200);
    expect(studentOf(edited).firstName).toBe('Juanito');
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const read = await request(app).get(`/api/students/${id}`);
    const edited = await request(app).put(`/api/students/${id}`).send({});

    expect(read.status).toBe(401);
    expect(edited.status).toBe(401);
    expect(read.headers['www-authenticate']).toBe('Bearer');
    expect(edited.headers['www-authenticate']).toBe('Bearer');
  });

  it('answers 200 or 400 but never 500 when a student is moved to a course that is being deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const origin = await courseWith(app, accessToken, 'Origen', ['A']);
    const student = await seededStudent(app, accessToken, origin, 'A');

    for (let round = 0; round < 5; round += 1) {
      const target = await courseWith(app, accessToken, `Destino ${String(round)}`, ['A']);

      const [edited, deleted] = await Promise.all([
        updateStudent(app, accessToken, student.id, {
          ...sameBody(origin, 'A'),
          courseId: target.id,
          classId: classOf(target, 'A'),
        }),
        request(app)
          .delete(`/api/courses/${target.id}`)
          .set('Authorization', `Bearer ${accessToken}`),
      ]);

      expect(deleted.status).toBe(200);
      expect([200, 400]).toContain(edited.status);
      if (edited.status === 400) {
        expect(errorOf(edited).details).toEqual([{ field: 'courseId', code: 'NOT_FOUND' }]);
      }
      // Gane quien gane, el alumno no apunta nunca a un curso borrado: o sigue en el origen o se quedó
      // sin curso ni clase; se devuelve al origen para la ronda siguiente.
      const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      expect([origin.id, null]).toContain(stored.courseId);
      const restored = await updateStudent(app, accessToken, student.id, sameBody(origin, 'A'));
      expect(restored.status).toBe(200);
    }
  });
});

describe('students with a database that closes the connection', () => {
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

    const created = await createStudent(app, accessToken, {
      firstName: 'Ana',
      lastName: 'García',
    });
    const listed = await listStudents(app, accessToken);

    expect(created.status).toBe(503);
    expect(listed.status).toBe(503);
    expect((listed.body as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    await prisma.$disconnect();
  });
});
