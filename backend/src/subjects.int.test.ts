import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';

const PASSWORD = 'Secreta123!';

type App = ReturnType<typeof realApp>['app'];

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio con su administrador y devuelve su access token y el colegio. */
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

/** Crea un usuario `MEMBER` del colegio y devuelve su access token. */
async function memberOf(realApps: ReturnType<typeof realApp>, schoolId: string) {
  const member = await testPrisma.user.create({
    data: {
      id: crypto.randomUUID(),
      schoolId,
      email: `miembro.${crypto.randomUUID()}@example.com`,
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
  return realApps.tokenIssuer.issueAccessToken({
    userId: member.id,
    schoolId,
    role: 'MEMBER',
    sessionId: refresh.id,
  });
}

const createSubject = (app: App, accessToken: string, body: unknown) =>
  request(app)
    .post('/api/subjects')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

const listSubjects = (app: App, accessToken: string) =>
  request(app).get('/api/subjects').set('Authorization', `Bearer ${accessToken}`);

const createCourse = async (app: App, accessToken: string, name: string) => {
  const response = await request(app)
    .post('/api/courses')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, classes: [{ name: 'A' }] });
  expect(response.status).toBe(201);
  return (response.body as { data: { course: { id: string } } }).data.course.id;
};

interface SubjectBody {
  id: string;
  name: string;
  code: string | null;
  type: string;
  status: string;
  description: string | null;
  color: string;
  courses: { id: string; name: string; sessionsPerWeek: number }[];
  createdAt: string;
}

const subjectOf = (response: request.Response) =>
  (response.body as { data: { subject: SubjectBody } }).data.subject;
const subjectsOf = (response: request.Response) =>
  (response.body as { data: { subjects: SubjectBody[] } }).data.subjects;
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;

/** Cuerpo de una asignatura válida con los cursos dados, con 3 sesiones en cada uno. */
const bodyOf = (name: string, courseIds: string[], extra: Record<string, unknown> = {}) => ({
  name,
  type: 'CORE',
  status: 'ACTIVE',
  color: 'blue',
  courses: courseIds.map((courseId) => ({ courseId, sessionsPerWeek: 3 })),
  ...extra,
});

describe('subjects against the test database', () => {
  it('creates English in every course and Programming in some, and lists them in order with their courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await createCourse(app, accessToken, '1º Primaria');
    const second = await createCourse(app, accessToken, '2º Primaria');
    const tenth = await createCourse(app, accessToken, '10º Primaria');

    const english = await createSubject(
      app,
      accessToken,
      bodyOf('Inglés', [tenth, first, second], {
        code: ' ING ',
        description: 'Lengua extranjera',
        color: 'teal',
      }),
    );
    const programming = await createSubject(app, accessToken, {
      name: 'Programación',
      type: 'CUSTOM',
      status: 'ACTIVE',
      color: 'purple',
      courses: [
        { courseId: tenth, sessionsPerWeek: 4 },
        { courseId: second, sessionsPerWeek: 2 },
      ],
    });

    expect(english.status).toBe(201);
    expect(english.headers['cache-control']).toBe('no-store');
    expect(subjectOf(english)).toMatchObject({
      name: 'Inglés',
      code: 'ING',
      type: 'CORE',
      status: 'ACTIVE',
      description: 'Lengua extranjera',
      color: 'teal',
    });
    // La respuesta del alta ya trae los cursos en orden natural, no en el orden en que se enviaron.
    expect(subjectOf(english).courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '2º Primaria',
      '10º Primaria',
    ]);
    expect(programming.status).toBe(201);
    expect(subjectOf(programming)).toMatchObject({ code: null, description: null });
    const listed = await listSubjects(app, accessToken);
    expect(listed.status).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(subjectsOf(listed).map(({ name }) => name)).toEqual(['Inglés', 'Programación']);
    expect(
      subjectsOf(listed)[0]
        ?.courses.map(({ name }) => name)
        .sort(),
    ).toEqual(['10º Primaria', '1º Primaria', '2º Primaria']);
    expect(
      subjectsOf(listed)[1]?.courses.map(({ name, sessionsPerWeek }) => [name, sessionsPerWeek]),
    ).toEqual([
      ['2º Primaria', 2],
      ['10º Primaria', 4],
    ]);
  });

  it('returns an empty list for a school without subjects', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const listed = await listSubjects(app, accessToken);

    expect(listed.status).toBe(200);
    expect(subjectsOf(listed)).toEqual([]);
  });

  it('answers 409 for a repeated name and a repeated code, each with its own code, and creates nothing more', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    await createSubject(app, accessToken, bodyOf('Inglés', [course], { code: 'ING' }));

    const sameName = await createSubject(app, accessToken, bodyOf('  inglés ', [course]));
    const sameCode = await createSubject(
      app,
      accessToken,
      bodyOf('Inglés 2', [course], { code: 'ing' }),
    );
    const noCode = await createSubject(app, accessToken, bodyOf('Música', [course]));
    const noCodeAgain = await createSubject(app, accessToken, bodyOf('Plástica', [course]));

    expect(sameName.status).toBe(409);
    expect(errorOf(sameName).code).toBe('SUBJECT_ALREADY_EXISTS');
    expect(sameCode.status).toBe(409);
    expect(errorOf(sameCode).code).toBe('SUBJECT_CODE_ALREADY_EXISTS');
    expect(noCode.status).toBe(201);
    expect(noCodeAgain.status).toBe(201);
    await expect(testPrisma.subject.count()).resolves.toBe(3);
  });

  it('answers 400 with the invalid fields, in order, and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');

    const response = await createSubject(app, accessToken, {
      name: '',
      code: 'IN G',
      type: 'OTHER',
      status: 'ACTIVE',
      color: 'magenta',
      courses: [
        { courseId: course, sessionsPerWeek: 0 },
        { courseId: course, sessionsPerWeek: 6 },
      ],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'name', code: 'REQUIRED' },
        { field: 'code', code: 'INVALID_CHARACTERS' },
        { field: 'type', code: 'INVALID_FORMAT' },
        { field: 'color', code: 'INVALID_FORMAT' },
        { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
        { field: 'courses[1].courseId', code: 'DUPLICATE' },
        { field: 'courses[1].sessionsPerWeek', code: 'OUT_OF_RANGE' },
      ],
    });
    await expect(testPrisma.subject.count()).resolves.toBe(0);
  });

  it('answers 400 NOT_FOUND at the position of a course of another school or deleted, and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const own = await createCourse(app, accessToken, '1º Primaria');
    const foreign = await createCourse(app, otherToken, '1º Primaria');

    const response = await createSubject(
      app,
      accessToken,
      bodyOf('Inglés', [own, foreign, crypto.randomUUID()]),
    );

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'courses[1].courseId', code: 'NOT_FOUND' },
      { field: 'courses[2].courseId', code: 'NOT_FOUND' },
    ]);
    await expect(testPrisma.subject.count()).resolves.toBe(0);
    await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
  });

  it('creates the subject in the school of the identity even if the body names another one', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { schoolId: otherSchoolId } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');

    const response = await createSubject(
      app,
      accessToken,
      bodyOf('Inglés', [course], { schoolId: otherSchoolId, id: crypto.randomUUID() }),
    );

    expect(response.status).toBe(201);
    const stored = await testPrisma.subject.findUniqueOrThrow({
      where: { id: subjectOf(response).id },
    });
    expect(stored.schoolId).toBe(schoolId);
  });

  it('never shows the subjects of one school to another, and lets both have the same name and code', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const otherCourse = await createCourse(app, otherToken, '1º Primaria');

    const own = await createSubject(app, accessToken, bodyOf('Inglés', [course], { code: 'ING' }));
    const other = await createSubject(
      app,
      otherToken,
      bodyOf('Inglés', [otherCourse], { code: 'ING' }),
    );
    await createSubject(app, otherToken, bodyOf('Francés', [otherCourse]));

    expect(own.status).toBe(201);
    expect(other.status).toBe(201);
    expect(subjectsOf(await listSubjects(app, accessToken)).map(({ name }) => name)).toEqual([
      'Inglés',
    ]);
    expect(subjectsOf(await listSubjects(app, otherToken)).map(({ name }) => name)).toEqual([
      'Francés',
      'Inglés',
    ]);
  });

  it('lets a member list the subjects but answers 403 FORBIDDEN, creating nothing, when it tries to create one', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken: adminToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, adminToken, '1º Primaria');
    await createSubject(app, adminToken, bodyOf('Inglés', [course]));
    const memberToken = await memberOf(realApps, schoolId);

    const listed = await listSubjects(app, memberToken);
    const created = await createSubject(app, memberToken, bodyOf('Música', [course]));
    const invalid = await createSubject(app, memberToken, {});

    expect(listed.status).toBe(200);
    expect(subjectsOf(listed).map(({ name }) => name)).toEqual(['Inglés']);
    expect(created.status).toBe(403);
    expect(errorOf(created).code).toBe('FORBIDDEN');
    expect(invalid.status).toBe(403);
    await expect(testPrisma.subject.count()).resolves.toBe(1);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const created = await request(app).post('/api/subjects').send(bodyOf('Inglés', []));
    const listed = await request(app).get('/api/subjects');

    expect(created.status).toBe(401);
    expect(listed.status).toBe(401);
    expect(created.headers['www-authenticate']).toBe('Bearer');
  });

  it('writes the events and the denial without names, codes or descriptions', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    await createSubject(
      app,
      accessToken,
      bodyOf('Inglés', [course], { code: 'IGL', description: 'Lengua extranjera' }),
    );
    await createSubject(app, accessToken, bodyOf('Inglés', [course]));
    await createSubject(app, accessToken, bodyOf('Francés', [course], { code: 'igl' }));
    await createSubject(app, accessToken, bodyOf('Alemán', [crypto.randomUUID()]));
    await createSubject(app, await memberOf(realApps, schoolId), bodyOf('Música', [course]));

    const log = logOutput();

    expect(log).toContain('"event":"SUBJECT_CREATED"');
    expect(log).toContain('"course_count":1');
    expect(log).toContain('"reason":"duplicate_name"');
    expect(log).toContain('"reason":"duplicate_code"');
    expect(log).toContain('"reason":"course_not_found"');
    expect(log).toContain('"event":"AUTHORIZATION_DENIED"');
    for (const secret of ['Inglés', 'Francés', 'Alemán', 'IGL', 'igl', 'Lengua extranjera']) {
      expect(log).not.toContain(secret);
    }
  });

  it('does not change the courses API: reading them and deleting one answer as before, and the subject stays without that course', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const withSubject = await createCourse(app, accessToken, '1º Primaria');
    const withoutSubject = await createCourse(app, accessToken, '2º Primaria');
    const courses = () =>
      request(app).get('/api/courses').set('Authorization', `Bearer ${accessToken}`);
    const before = await courses();
    const created = await createSubject(app, accessToken, bodyOf('Inglés', [withSubject]));
    expect(created.status).toBe(201);

    const after = await courses();
    const withSubjectDeleted = await request(app)
      .delete(`/api/courses/${withSubject}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const withoutSubjectDeleted = await request(app)
      .delete(`/api/courses/${withoutSubject}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(after.status).toBe(200);
    expect(after.body).toEqual(before.body);
    expect(withSubjectDeleted.status).toBe(200);
    expect(Object.keys((withSubjectDeleted.body as { data: object }).data)).toEqual(
      Object.keys((withoutSubjectDeleted.body as { data: object }).data),
    );
    const listed = await listSubjects(app, accessToken);
    expect(subjectsOf(listed)).toEqual([expect.objectContaining({ name: 'Inglés', courses: [] })]);
  });
});
