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

const authorized = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

const createCourse = async (app: App, accessToken: string, name: string, calendarId?: string) => {
  const response = await request(app)
    .post('/api/courses')
    .set(authorized(accessToken))
    .send({ name, classes: [{ name: 'A' }] });
  expect(response.status).toBe(201);
  const id = (response.body as { data: { course: { id: string } } }).data.course.id;
  if (calendarId !== undefined) {
    await testPrisma.course.update({ where: { id }, data: { calendarId } });
  }
  return id;
};

/** Un calendario de una jornada con tantas sesiones como se pidan, separadas por un recreo si son más de dos. */
const createCalendar = async (app: App, accessToken: string, name: string, sessions: number) => {
  const periods = Array.from({ length: sessions }, (_, index) => {
    const hour = 9 + index;
    return {
      type: 'SESSION' as const,
      startTime: `${String(hour).padStart(2, '0')}:00`,
      endTime: `${String(hour).padStart(2, '0')}:45`,
    };
  });
  const response = await request(app)
    .post('/api/calendars')
    .set(authorized(accessToken))
    .send({ name, periods });
  expect(response.status).toBe(201);
  return (response.body as { data: { calendar: { id: string } } }).data.calendar.id;
};

const createSubject = async (
  app: App,
  accessToken: string,
  name: string,
  courseIds: string[],
  sessionsPerWeek = 3,
  extra: Record<string, unknown> = {},
) => {
  const response = await request(app)
    .post('/api/subjects')
    .set(authorized(accessToken))
    .send({
      name,
      type: 'CORE',
      status: 'ACTIVE',
      color: 'blue',
      courses: courseIds.map((courseId) => ({ courseId, sessionsPerWeek })),
      ...extra,
    });
  expect(response.status).toBe(201);
  return (response.body as { data: { subject: { id: string } } }).data.subject.id;
};

const getWorkload = (app: App, accessToken: string, courseId: string) =>
  request(app).get(`/api/courses/${courseId}/workload`).set(authorized(accessToken));

const patchWorkload = (app: App, accessToken: string, courseId: string, body: unknown) =>
  request(app)
    .patch(`/api/courses/${courseId}/workload`)
    .set(authorized(accessToken))
    .send(body as object);

interface WorkloadBody {
  course: { id: string; name: string };
  calendar: { id: string; name: string; sessionsPerDay: number } | null;
  subjects: {
    id: string;
    name: string;
    code: string | null;
    color: string;
    status: string;
    sessionsPerWeek: number | null;
  }[];
  assignedSessions: number;
  availableSessions: number | null;
  warnings: { code: string; assigned?: number; available?: number }[];
}

const workloadOf = (response: request.Response) =>
  (response.body as { data: { workload: WorkloadBody } }).data.workload;
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;
const sessionsOf = (workload: WorkloadBody) =>
  Object.fromEntries(workload.subjects.map((subject) => [subject.name, subject.sessionsPerWeek]));

const rowCount = () => testPrisma.subjectCourse.count();

describe('the workload of a course against the test database', () => {
  it('reads the balance with a calendar and the warning of a course without one, with every subject of the school by name', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const calendar = await createCalendar(app, accessToken, 'Jornada', 6);
    const first = await createCourse(app, accessToken, '1º Primaria', calendar);
    const second = await createCourse(app, accessToken, '2º Primaria');
    await createSubject(app, accessToken, 'Música', [second], 2);
    await createSubject(app, accessToken, 'Inglés', [first, second], 3, { code: 'ING' });

    const withCalendar = await getWorkload(app, accessToken, first);
    const withoutCalendar = await getWorkload(app, accessToken, second);

    expect(withCalendar.status).toBe(200);
    expect(withCalendar.headers['cache-control']).toBe('no-store');
    const workload = workloadOf(withCalendar);
    expect(workload.course).toEqual({ id: first, name: '1º Primaria' });
    expect(workload.calendar).toEqual({ id: calendar, name: 'Jornada', sessionsPerDay: 6 });
    expect(workload.subjects.map((subject) => subject.name)).toEqual(['Inglés', 'Música']);
    expect(sessionsOf(workload)).toEqual({ Inglés: 3, Música: null });
    expect(workload.subjects[0]).toMatchObject({ code: 'ING', color: 'blue', status: 'ACTIVE' });
    expect([workload.assignedSessions, workload.availableSessions]).toEqual([3, 30]);
    expect(workload.warnings).toEqual([]);
    const other = workloadOf(withoutCalendar);
    expect(other.calendar).toBeNull();
    expect(other.availableSessions).toBeNull();
    expect(other.assignedSessions).toBe(5);
    expect(other.warnings).toEqual([{ code: 'COURSE_WITHOUT_CALENDAR' }]);
  });

  it('raises, adds and removes subjects, answers with the load as it ended and shows it in the subjects API', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const calendar = await createCalendar(app, accessToken, 'Jornada', 6);
    const course = await createCourse(app, accessToken, '1º Primaria', calendar);
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    const language = await createSubject(app, accessToken, 'Lengua', [course], 5);
    const music = await createSubject(
      app,
      accessToken,
      'Música',
      [await createCourse(app, accessToken, '2º Primaria')],
      2,
    );

    const response = await patchWorkload(app, accessToken, course, {
      changes: [
        { subjectId: english, sessionsPerWeek: 4 },
        { subjectId: music, sessionsPerWeek: 2 },
        { subjectId: language, sessionsPerWeek: null },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const workload = workloadOf(response);
    expect(sessionsOf(workload)).toEqual({ Inglés: 4, Lengua: null, Música: 2 });
    expect([workload.assignedSessions, workload.availableSessions]).toEqual([6, 30]);
    const subjects = await request(app).get('/api/subjects').set(authorized(accessToken));
    const byName = new Map(
      (
        subjects.body as {
          data: {
            subjects: { name: string; courses: { id: string; sessionsPerWeek: number }[] }[];
          };
        }
      ).data.subjects.map((subject) => [subject.name, subject.courses]),
    );
    expect(byName.get('Inglés')?.find((c) => c.id === course)?.sessionsPerWeek).toBe(4);
    expect(byName.get('Lengua')).toEqual([]);
    expect(byName.get('Música')?.find((c) => c.id === course)?.sessionsPerWeek).toBe(2);
  });

  it('saves a load that does not fit the calendar and answers with the warning', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const calendar = await createCalendar(app, accessToken, 'Una sesión', 1);
    const course = await createCourse(app, accessToken, '1º Primaria', calendar);
    const english = await createSubject(app, accessToken, 'Inglés', [course], 2);
    const language = await createSubject(app, accessToken, 'Lengua', [course], 2);

    const response = await patchWorkload(app, accessToken, course, {
      changes: [
        { subjectId: english, sessionsPerWeek: 5 },
        { subjectId: language, sessionsPerWeek: 5 },
      ],
    });

    expect(response.status).toBe(200);
    expect(workloadOf(response).warnings).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 10, available: 5 },
    ]);
    expect(workloadOf(await getWorkload(app, accessToken, course)).assignedSessions).toBe(10);
  });

  it('lets a subject end without courses when its last course is removed from here', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const french = await createSubject(app, accessToken, 'Francés', [course], 2);

    const response = await patchWorkload(app, accessToken, course, {
      changes: [{ subjectId: french, sessionsPerWeek: null }],
    });

    expect(response.status).toBe(200);
    const read = await request(app).get(`/api/subjects/${french}`).set(authorized(accessToken));
    expect(read.status).toBe(200);
    expect(
      (read.body as { data: { subject: { courses: unknown[] } } }).data.subject.courses,
    ).toEqual([]);
  });

  it('answers 400 with the invalid fields in order and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    const before = await rowCount();

    const response = await patchWorkload(app, accessToken, course, {
      changes: [
        { subjectId: english, sessionsPerWeek: 0 },
        { subjectId: 'x', sessionsPerWeek: 9 },
        { subjectId: english, sessionsPerWeek: 2 },
      ],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
        { field: 'changes[1].subjectId', code: 'INVALID_FORMAT' },
        { field: 'changes[1].sessionsPerWeek', code: 'OUT_OF_RANGE' },
        { field: 'changes[2].subjectId', code: 'DUPLICATE' },
      ],
    });
    for (const body of [{}, { changes: [] }, { changes: 'x' }]) {
      expect((await patchWorkload(app, accessToken, course, body)).status).toBe(400);
    }
    await expect(rowCount()).resolves.toBe(before);
    expect(sessionsOf(workloadOf(await getWorkload(app, accessToken, course)))).toEqual({
      Inglés: 3,
    });
  });

  it('answers 400 NOT_FOUND at the position of a subject of another school or missing, and changes nothing, not even the valid ones', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const other = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    const foreignCourse = await createCourse(app, other.accessToken, '1º Primaria');
    const foreign = await createSubject(app, other.accessToken, 'Ajena', [foreignCourse], 3);

    const response = await patchWorkload(app, accessToken, course, {
      changes: [
        { subjectId: english, sessionsPerWeek: 5 },
        { subjectId: foreign, sessionsPerWeek: 2 },
        { subjectId: crypto.randomUUID(), sessionsPerWeek: null },
      ],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'changes[1].subjectId', code: 'NOT_FOUND' },
      { field: 'changes[2].subjectId', code: 'NOT_FOUND' },
    ]);
    expect(sessionsOf(workloadOf(await getWorkload(app, accessToken, course)))).toEqual({
      Inglés: 3,
    });
    await expect(
      testPrisma.subjectCourse.count({ where: { subjectId: foreign, courseId: course } }),
    ).resolves.toBe(0);
  });

  it('answers 404 NOT_FOUND, without distinguishing, to an id that is malformed, missing or from another school, reading and changing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const other = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    const foreignCourse = await createCourse(app, other.accessToken, '1º Primaria');
    const body = { changes: [{ subjectId: english, sessionsPerWeek: 5 }] };

    for (const id of ['no-es-un-uuid', crypto.randomUUID(), foreignCourse]) {
      const read = await getWorkload(app, accessToken, id);
      const change = await patchWorkload(app, accessToken, id, body);
      expect([read.status, change.status]).toEqual([404, 404]);
      expect([errorOf(read).code, errorOf(change).code]).toEqual(['NOT_FOUND', 'NOT_FOUND']);
    }
    expect(sessionsOf(workloadOf(await getWorkload(app, accessToken, course)))).toEqual({
      Inglés: 3,
    });
  });

  it('lets a member read the workload but answers 403 FORBIDDEN to a change, even with a missing id or an invalid body, changing nothing', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const member = await memberOf(realApps, schoolId);
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);

    const read = await getWorkload(app, member, course);
    const responses = [
      await patchWorkload(app, member, course, {
        changes: [{ subjectId: english, sessionsPerWeek: 5 }],
      }),
      await patchWorkload(app, member, crypto.randomUUID(), { changes: [] }),
      await patchWorkload(app, member, 'no-es-un-uuid', 'x'),
    ];

    expect(read.status).toBe(200);
    expect(sessionsOf(workloadOf(read))).toEqual({ Inglés: 3 });
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe('FORBIDDEN');
    }
    expect(sessionsOf(workloadOf(await getWorkload(app, accessToken, course)))).toEqual({
      Inglés: 3,
    });
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');

    const read = await request(app).get(`/api/courses/${course}/workload`);
    const change = await request(app)
      .patch(`/api/courses/${course}/workload`)
      .send({ changes: [{ subjectId: crypto.randomUUID(), sessionsPerWeek: 2 }] });

    expect([read.status, change.status]).toEqual([401, 401]);
  });

  it('takes the school from the identity even if the body or the query names another one', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const other = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);

    const response = await request(app)
      .patch(`/api/courses/${course}/workload?schoolId=${other.schoolId}`)
      .set(authorized(accessToken))
      .send({ schoolId: other.schoolId, changes: [{ subjectId: english, sessionsPerWeek: 4 }] });

    expect(response.status).toBe(200);
    expect(sessionsOf(workloadOf(response))).toEqual({ Inglés: 4 });
  });

  it('keeps both changes of two simultaneous requests on different subjects of the same course', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    const language = await createSubject(app, accessToken, 'Lengua', [course], 3);

    const responses = await Promise.all([
      patchWorkload(app, accessToken, course, {
        changes: [{ subjectId: english, sessionsPerWeek: 1 }],
      }),
      patchWorkload(app, accessToken, course, {
        changes: [{ subjectId: language, sessionsPerWeek: 5 }],
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(sessionsOf(workloadOf(await getWorkload(app, accessToken, course)))).toEqual({
      Inglés: 1,
      Lengua: 5,
    });
  });

  it('writes the update and the rejections without names, codes or courses', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3, { code: 'IGL' });
    const music = await createSubject(app, accessToken, 'Música', [course], 2);
    const member = await memberOf(realApps, schoolId);

    await patchWorkload(app, accessToken, course, {
      changes: [
        { subjectId: english, sessionsPerWeek: 4 },
        { subjectId: music, sessionsPerWeek: null },
      ],
    });
    const eventsAfterChange = logOutput().split('"event":"COURSE_WORKLOAD_UPDATED"').length - 1;
    await patchWorkload(app, accessToken, course, {
      changes: [{ subjectId: english, sessionsPerWeek: 4 }],
    });
    await patchWorkload(app, accessToken, course, {
      changes: [{ subjectId: crypto.randomUUID(), sessionsPerWeek: 2 }],
    });
    await patchWorkload(app, accessToken, crypto.randomUUID(), {
      changes: [{ subjectId: english, sessionsPerWeek: 2 }],
    });
    await patchWorkload(app, member, course, {
      changes: [{ subjectId: english, sessionsPerWeek: 1 }],
    });

    const log = logOutput();

    expect(eventsAfterChange).toBe(1);
    expect(log.split('"event":"COURSE_WORKLOAD_UPDATED"').length - 1).toBe(1);
    expect(log).toContain('"subjects_changed":1');
    expect(log).toContain('"subjects_removed":1');
    expect(log).toContain('"reason":"subject_not_found"');
    expect(log).toContain('"reason":"not_found"');
    expect(log).toContain('"event":"AUTHORIZATION_DENIED"');
    for (const secret of ['Inglés', 'Música', 'IGL', '1º Primaria']) {
      expect(log).not.toContain(secret);
    }
  });
});
