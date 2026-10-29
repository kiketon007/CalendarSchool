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

const getSubject = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/subjects/${id}`).set('Authorization', `Bearer ${accessToken}`);

const updateSubject = (app: App, accessToken: string, id: string, body: unknown) =>
  request(app)
    .put(`/api/subjects/${id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

/** Crea la asignatura y devuelve su cuerpo. */
async function createdSubject(app: App, accessToken: string, body: unknown) {
  const response = await createSubject(app, accessToken, body);
  expect(response.status).toBe(201);
  return subjectOf(response);
}

describe('reading and editing one subject against the test database', () => {
  it('reads a subject with its courses in natural order and edits every field, saving the final state', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await createCourse(app, accessToken, '1º Primaria');
    const second = await createCourse(app, accessToken, '2º Primaria');
    const tenth = await createCourse(app, accessToken, '10º Primaria');
    const subject = await createdSubject(
      app,
      accessToken,
      bodyOf('Inglés', [tenth, first], { code: 'ING', description: 'Lengua extranjera' }),
    );

    const read = await getSubject(app, accessToken, subject.id);
    const edited = await updateSubject(app, accessToken, subject.id, {
      name: '  Inglés  avanzado ',
      code: '  ',
      type: 'ELECTIVE',
      status: 'INACTIVE',
      description: '',
      color: 'green',
      courses: [
        { courseId: tenth, sessionsPerWeek: 2 },
        { courseId: second, sessionsPerWeek: 5 },
      ],
    });
    const again = await getSubject(app, accessToken, subject.id);

    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(subjectOf(read).courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '10º Primaria',
    ]);
    expect(edited.status).toBe(200);
    expect(edited.headers['cache-control']).toBe('no-store');
    expect(subjectOf(edited)).toEqual({
      id: subject.id,
      name: 'Inglés avanzado',
      code: null,
      type: 'ELECTIVE',
      status: 'INACTIVE',
      description: null,
      color: 'green',
      createdAt: subject.createdAt,
      courses: [
        { id: second, name: '2º Primaria', sessionsPerWeek: 5 },
        { id: tenth, name: '10º Primaria', sessionsPerWeek: 2 },
      ],
    });
    expect(subjectOf(again)).toEqual(subjectOf(edited));
    expect(subjectsOf(await listSubjects(app, accessToken))).toEqual([subjectOf(edited)]);
  });

  it('answers 200 to an identical PUT and to a change of capitalization of its own name and code', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const subject = await createdSubject(
      app,
      accessToken,
      bodyOf('Inglés', [course], { code: 'ING' }),
    );

    const identical = await updateSubject(
      app,
      accessToken,
      subject.id,
      bodyOf('Inglés', [course], { code: 'ING' }),
    );
    const capitalized = await updateSubject(
      app,
      accessToken,
      subject.id,
      bodyOf('INGLÉS', [course], { code: 'ing' }),
    );

    expect(identical.status).toBe(200);
    expect(subjectOf(identical)).toEqual(subject);
    expect(capitalized.status).toBe(200);
    expect(subjectOf(capitalized)).toMatchObject({ name: 'INGLÉS', code: 'ing' });
  });

  it('answers 409 for the name or the code of another subject, each with its own code, and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createdSubject(
      app,
      accessToken,
      bodyOf('Inglés', [course], { code: 'ING' }),
    );
    await createdSubject(app, accessToken, bodyOf('Programación', [course], { code: 'PRG' }));

    const name = await updateSubject(
      app,
      accessToken,
      english.id,
      bodyOf('programación ', [course], { code: 'ING' }),
    );
    const code = await updateSubject(
      app,
      accessToken,
      english.id,
      bodyOf('Inglés', [course], { code: 'prg' }),
    );

    expect(name.status).toBe(409);
    expect(errorOf(name).code).toBe('SUBJECT_ALREADY_EXISTS');
    expect(code.status).toBe(409);
    expect(errorOf(code).code).toBe('SUBJECT_CODE_ALREADY_EXISTS');
    expect(subjectOf(await getSubject(app, accessToken, english.id))).toMatchObject({
      name: 'Inglés',
      code: 'ING',
    });
  });

  it('answers 400 with the fields of the creation, and 400 NOT_FOUND at the position of a missing course, changing nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const subject = await createdSubject(app, accessToken, bodyOf('Inglés', [course]));

    const invalid = await updateSubject(app, accessToken, subject.id, {
      name: '',
      code: 'IN G',
      type: 'OTHER',
      status: 'ACTIVE',
      color: 'magenta',
      courses: [{ courseId: course, sessionsPerWeek: 6 }],
    });
    const missing = await updateSubject(
      app,
      accessToken,
      subject.id,
      bodyOf('Otro', [course, crypto.randomUUID()]),
    );

    expect(invalid.status).toBe(400);
    expect(errorOf(invalid).details).toEqual([
      { field: 'name', code: 'REQUIRED' },
      { field: 'code', code: 'INVALID_CHARACTERS' },
      { field: 'type', code: 'INVALID_FORMAT' },
      { field: 'color', code: 'INVALID_FORMAT' },
      { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
    ]);
    expect(missing.status).toBe(400);
    expect(errorOf(missing).details).toEqual([{ field: 'courses[1].courseId', code: 'NOT_FOUND' }]);
    expect(subjectOf(await getSubject(app, accessToken, subject.id))).toMatchObject({
      name: 'Inglés',
      courses: [{ id: course, sessionsPerWeek: 3 }],
    });
  });

  it('does not let a subject that lost all its courses be saved without one, and saves it with one', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const only = await createCourse(app, accessToken, '1º Primaria');
    const other = await createCourse(app, accessToken, '2º Primaria');
    const subject = await createdSubject(app, accessToken, bodyOf('Inglés', [only]));
    await request(app).delete(`/api/courses/${only}`).set('Authorization', `Bearer ${accessToken}`);
    expect(subjectOf(await getSubject(app, accessToken, subject.id)).courses).toEqual([]);

    const without = await updateSubject(app, accessToken, subject.id, bodyOf('Inglés 2', []));
    const withOne = await updateSubject(app, accessToken, subject.id, bodyOf('Inglés 2', [other]));

    expect(without.status).toBe(400);
    expect(errorOf(without).details).toEqual([{ field: 'courses', code: 'REQUIRED' }]);
    expect(withOne.status).toBe(200);
    expect(subjectOf(withOne)).toMatchObject({
      name: 'Inglés 2',
      courses: [{ id: other, name: '2º Primaria', sessionsPerWeek: 3 }],
    });
  });

  it('answers 404 NOT_FOUND, without distinguishing, to an id that is malformed, missing or from another school', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const otherCourse = await createCourse(app, otherToken, '1º Primaria');
    const foreign = await createdSubject(app, otherToken, bodyOf('Francés', [otherCourse]));
    const course = await createCourse(app, accessToken, '1º Primaria');

    for (const id of ['no-es-un-uuid', crypto.randomUUID(), foreign.id]) {
      const read = await getSubject(app, accessToken, id);
      const edited = await updateSubject(app, accessToken, id, bodyOf('Cambiada', [course]));
      expect(read.status).toBe(404);
      expect(errorOf(read).code).toBe('NOT_FOUND');
      expect(edited.status).toBe(404);
      expect(errorOf(edited).code).toBe('NOT_FOUND');
    }
    // La asignatura ajena no cambió, y un curso ajeno en el cuerpo no se acepta.
    expect(subjectOf(await getSubject(app, otherToken, foreign.id)).name).toBe('Francés');
    const crossed = await createdSubject(app, accessToken, bodyOf('Inglés', [course]));
    const withForeignCourse = await updateSubject(
      app,
      accessToken,
      crossed.id,
      bodyOf('Inglés', [otherCourse]),
    );
    expect(withForeignCourse.status).toBe(400);
    expect(errorOf(withForeignCourse).details).toEqual([
      { field: 'courses[0].courseId', code: 'NOT_FOUND' },
    ]);
  });

  it('takes the school from the identity even if the body names another one', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { schoolId: otherSchoolId } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const subject = await createdSubject(app, accessToken, bodyOf('Inglés', [course]));

    const edited = await updateSubject(
      app,
      accessToken,
      subject.id,
      bodyOf('Inglés 2', [course], { schoolId: otherSchoolId, id: crypto.randomUUID() }),
    );

    expect(edited.status).toBe(200);
    expect(subjectOf(edited).id).toBe(subject.id);
    await expect(
      testPrisma.subject.findUniqueOrThrow({ where: { id: subject.id } }),
    ).resolves.toMatchObject({ schoolId, name: 'Inglés 2' });
  });

  it('lets a member read a subject but answers 403 FORBIDDEN to its edition, even with a missing id or an invalid body, changing nothing', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken: adminToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, adminToken, '1º Primaria');
    const subject = await createdSubject(app, adminToken, bodyOf('Inglés', [course]));
    const memberToken = await memberOf(realApps, schoolId);

    const read = await getSubject(app, memberToken, subject.id);
    const edited = await updateSubject(app, memberToken, subject.id, bodyOf('Cambiada', [course]));
    const missing = await updateSubject(app, memberToken, crypto.randomUUID(), {});
    const malformed = await updateSubject(app, memberToken, 'no-es-un-uuid', {});

    expect(read.status).toBe(200);
    expect(subjectOf(read).name).toBe('Inglés');
    for (const response of [edited, missing, malformed]) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe('FORBIDDEN');
    }
    expect(subjectOf(await getSubject(app, adminToken, subject.id)).name).toBe('Inglés');
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const read = await request(app).get(`/api/subjects/${id}`);
    const edited = await request(app).put(`/api/subjects/${id}`).send(bodyOf('Inglés', []));

    expect(read.status).toBe(401);
    expect(edited.status).toBe(401);
    expect(edited.headers['www-authenticate']).toBe('Bearer');
  });

  it('writes the update events and the rejections without names, codes or descriptions', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await createCourse(app, accessToken, '1º Primaria');
    const second = await createCourse(app, accessToken, '2º Primaria');
    const english = await createdSubject(
      app,
      accessToken,
      bodyOf('Inglés', [first], { code: 'IGL', description: 'Lengua extranjera' }),
    );
    await createdSubject(app, accessToken, bodyOf('Francés', [first], { code: 'FRA' }));

    await updateSubject(
      app,
      accessToken,
      english.id,
      bodyOf('Inglés avanzado', [first, second], {
        code: 'IGL',
        description: 'Lengua extranjera',
        status: 'INACTIVE',
      }),
    );
    await updateSubject(app, accessToken, english.id, bodyOf('francés', [first]));
    await updateSubject(app, accessToken, english.id, bodyOf('Inglés 3', [first], { code: 'fra' }));
    await updateSubject(app, accessToken, english.id, bodyOf('Inglés 3', [crypto.randomUUID()]));
    await updateSubject(app, accessToken, crypto.randomUUID(), bodyOf('Otra', [first]));
    await updateSubject(
      app,
      await memberOf(realApps, schoolId),
      english.id,
      bodyOf('Otra', [first]),
    );

    const log = logOutput();

    expect(log).toContain('"event":"SUBJECT_UPDATED"');
    expect(log).toContain('"changed_fields":["name","status","courses"]');
    expect(log).toContain('"courses_added":1');
    expect(log).toContain('"event":"SUBJECT_UPDATE_REJECTED"');
    for (const reason of ['duplicate_name', 'duplicate_code', 'course_not_found', 'not_found']) {
      expect(log).toContain(`"reason":"${reason}"`);
    }
    expect(log).toContain('"event":"AUTHORIZATION_DENIED"');
    for (const secret of [
      'Inglés',
      'Francés',
      'francés',
      'IGL',
      'fra',
      'FRA',
      'Lengua extranjera',
      '1º Primaria',
    ]) {
      expect(log).not.toContain(secret);
    }
  });
});

const deleteSubject = (app: App, accessToken: string, id: string) =>
  request(app).delete(`/api/subjects/${id}`).set('Authorization', `Bearer ${accessToken}`);

const deletedOf = (response: request.Response) =>
  (response.body as { data: { deleted: { id: string } } }).data.deleted;

describe('deleting a subject against the test database', () => {
  it('deletes a subject with courses: the courses stay, the list and the read no longer have it and the name and the code are free', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await createCourse(app, accessToken, '1º Primaria');
    const second = await createCourse(app, accessToken, '2º Primaria');
    const english = await createdSubject(
      app,
      accessToken,
      bodyOf('Inglés', [first, second], { code: 'ING' }),
    );
    const music = await createdSubject(app, accessToken, bodyOf('Música', [first]));

    const deleted = await deleteSubject(app, accessToken, english.id);

    expect(deleted.status).toBe(200);
    expect(deleted.headers['cache-control']).toBe('no-store');
    expect(deletedOf(deleted)).toEqual({ id: english.id });
    expect(subjectsOf(await listSubjects(app, accessToken)).map(({ id }) => id)).toEqual([
      music.id,
    ]);
    expect((await getSubject(app, accessToken, english.id)).status).toBe(404);
    expect(await testPrisma.course.count()).toBe(2);
    expect(await testPrisma.subjectCourse.count()).toBe(1);
    const again = await createSubject(app, accessToken, bodyOf('Inglés', [first], { code: 'ING' }));
    expect(again.status).toBe(201);
  });

  it('deletes a subject without courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const subject = await createdSubject(app, accessToken, bodyOf('Plástica', [course]));
    // El alta exige un curso; sin cursos queda al borrar el suyo.
    await request(app)
      .delete(`/api/courses/${course}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(subjectOf(await getSubject(app, accessToken, subject.id)).courses).toEqual([]);

    const deleted = await deleteSubject(app, accessToken, subject.id);

    expect(deleted.status).toBe(200);
    expect(deletedOf(deleted)).toEqual({ id: subject.id });
    expect(subjectsOf(await listSubjects(app, accessToken))).toEqual([]);
  });

  it('answers 404 NOT_FOUND, without distinguishing, to an id that is malformed, missing, from another school or already deleted, and a deleted subject cannot be edited', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const otherCourse = await createCourse(app, otherToken, '1º Primaria');
    const foreign = await createdSubject(app, otherToken, bodyOf('Francés', [otherCourse]));
    const course = await createCourse(app, accessToken, '1º Primaria');
    const gone = await createdSubject(app, accessToken, bodyOf('Inglés', [course]));
    expect((await deleteSubject(app, accessToken, gone.id)).status).toBe(200);

    for (const id of ['no-es-un-uuid', crypto.randomUUID(), foreign.id, gone.id]) {
      const response = await deleteSubject(app, accessToken, id);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
    }
    const edited = await updateSubject(app, accessToken, gone.id, bodyOf('Inglés', [course]));
    expect(edited.status).toBe(404);
    // La asignatura ajena sigue entera.
    expect(subjectOf(await getSubject(app, otherToken, foreign.id)).name).toBe('Francés');
  });

  it('answers 403 FORBIDDEN to a member, even with a missing or malformed id, deleting nothing', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken: adminToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, adminToken, '1º Primaria');
    const subject = await createdSubject(app, adminToken, bodyOf('Inglés', [course]));
    const memberToken = await memberOf(realApps, schoolId);

    for (const id of [subject.id, crypto.randomUUID(), 'no-es-un-uuid']) {
      const response = await deleteSubject(app, memberToken, id);
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe('FORBIDDEN');
    }
    expect(subjectOf(await getSubject(app, adminToken, subject.id)).name).toBe('Inglés');
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const response = await request(app).delete(`/api/subjects/${crypto.randomUUID()}`);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('answers 200 and 404 to two simultaneous deletions of the same subject', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const subject = await createdSubject(app, accessToken, bodyOf('Inglés', [course]));

    const responses = await Promise.all([
      deleteSubject(app, accessToken, subject.id),
      deleteSubject(app, accessToken, subject.id),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 404]);
    expect(subjectsOf(await listSubjects(app, accessToken))).toEqual([]);
  });

  it('writes SUBJECT_DELETED without names, codes or courses, and nothing for a 404', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const subject = await createdSubject(
      app,
      accessToken,
      bodyOf('Inglés', [course], { code: 'IGL', description: 'Lengua extranjera' }),
    );
    await deleteSubject(app, accessToken, subject.id);
    const eventsAfterDelete = logOutput().split('"event":"SUBJECT_DELETED"').length - 1;
    await deleteSubject(app, accessToken, subject.id);

    const log = logOutput();

    expect(eventsAfterDelete).toBe(1);
    expect(log.split('"event":"SUBJECT_DELETED"').length - 1).toBe(1);
    expect(log).toContain(`"subject_id":"${subject.id}"`);
    for (const secret of ['Inglés', 'IGL', 'Lengua extranjera', '1º Primaria']) {
      expect(log).not.toContain(secret);
    }
  });
});
