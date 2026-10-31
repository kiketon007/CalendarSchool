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

/** Fija el máximo y el bloque de una asignatura en un curso (la fila entera, con sus sesiones). */
const setRules = async (
  app: App,
  accessToken: string,
  courseId: string,
  subjectId: string,
  change: { sessionsPerWeek: number; maxPerDay: number | null; blockSize: number | null },
) => {
  const response = await request(app)
    .patch(`/api/courses/${courseId}/workload`)
    .set(authorized(accessToken))
    .send({ changes: [{ subjectId, ...change }] });
  expect(response.status).toBe(200);
};

type Cell = { dayOfWeek: number; sessionNumber: number };
const cells = (days: number[], sessions: number[]): Cell[] =>
  days.flatMap((dayOfWeek) => sessions.map((sessionNumber) => ({ dayOfWeek, sessionNumber })));

const putSlots = async (
  app: App,
  accessToken: string,
  courseId: string,
  subjectId: string,
  segment: 'forbidden-slots' | 'preferred-slots',
  slots: Cell[],
) => {
  const response = await request(app)
    .put(`/api/courses/${courseId}/subjects/${subjectId}/${segment}`)
    .set(authorized(accessToken))
    .send({ slots });
  expect(response.status).toBe(200);
};

const getConstraints = (app: App, accessToken: string) =>
  request(app).get('/api/constraints').set(authorized(accessToken));

interface ConstraintBody {
  id: string;
  type: string;
  course: { id: string; name: string };
  subject: { id: string; name: string; code: string | null; color: string; status: string };
  maxPerDay: number | null;
  blockSize: number | null;
  slotCount: number | null;
  warnings: { code: string; count?: number }[];
}

const constraintsOf = (response: request.Response) =>
  (response.body as { data: { constraints: ConstraintBody[] } }).data.constraints;
const codes = (warnings: { code: string }[]) => warnings.map(({ code }) => code);

describe('the list of constraints against the test database', () => {
  it('lists every rule of the school ordered by course, subject and type, also for a member', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const calendar = await createCalendar(app, accessToken, 'Jornada', 6);
    const first = await createCourse(app, accessToken, '1º Primaria', calendar);
    const second = await createCourse(app, accessToken, '2º Primaria', calendar);
    const english = await createSubject(app, accessToken, 'Inglés', [first, second], 3, {
      code: 'ING',
    });
    const religion = await createSubject(app, accessToken, 'Religión', [first], 2);
    await setRules(app, accessToken, first, english, {
      sessionsPerWeek: 3,
      maxPerDay: 2,
      blockSize: 2,
    });
    await setRules(app, accessToken, second, english, {
      sessionsPerWeek: 3,
      maxPerDay: 3,
      blockSize: null,
    });
    await putSlots(
      app,
      accessToken,
      first,
      religion,
      'forbidden-slots',
      cells([1, 2, 3], [1, 2, 3, 4, 5, 6]),
    );

    const adminResponse = await getConstraints(app, accessToken);
    const memberResponse = await getConstraints(app, await memberOf(apps, schoolId));

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.headers['cache-control']).toBe('no-store');
    const list = constraintsOf(adminResponse);
    expect(
      list.map(({ course, subject, type }) => `${course.name}/${subject.name}/${type}`),
    ).toEqual([
      '1º Primaria/Inglés/MAX_PER_DAY',
      '1º Primaria/Inglés/BLOCK',
      '1º Primaria/Religión/FORBIDDEN_SLOTS',
      '2º Primaria/Inglés/MAX_PER_DAY',
    ]);
    expect(
      list.map(({ maxPerDay, blockSize, slotCount }) => [maxPerDay, blockSize, slotCount]),
    ).toEqual([
      [2, null, null],
      [null, 2, null],
      [null, null, 18],
      [3, null, null],
    ]);
    expect(list[0]?.subject).toEqual({
      id: english,
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
    });
    expect(list.every(({ warnings }) => warnings.length === 0)).toBe(true);
    expect(memberResponse.status).toBe(200);
    expect(constraintsOf(memberResponse)).toEqual(list);
  });

  it('lists nothing when the school has subjects in courses but no rules', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    await createSubject(app, accessToken, 'Inglés', [course]);

    const response = await getConstraints(app, accessToken);

    expect(response.status).toBe(200);
    expect(constraintsOf(response)).toEqual([]);
  });

  it('counts the cells outside the calendar of each grid on its own after the calendar gets shorter', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const long = await createCalendar(app, accessToken, 'Larga', 6);
    const short = await createCalendar(app, accessToken, 'Corta', 5);
    const course = await createCourse(app, accessToken, '1º Primaria', long);
    const crafts = await createSubject(app, accessToken, 'Plástica', [course], 2);
    await putSlots(app, accessToken, course, crafts, 'forbidden-slots', [
      { dayOfWeek: 1, sessionNumber: 1 },
      { dayOfWeek: 1, sessionNumber: 6 },
      { dayOfWeek: 2, sessionNumber: 6 },
    ]);
    await putSlots(app, accessToken, course, crafts, 'preferred-slots', [
      { dayOfWeek: 3, sessionNumber: 2 },
      { dayOfWeek: 3, sessionNumber: 6 },
    ]);
    await testPrisma.course.update({ where: { id: course }, data: { calendarId: short } });

    const list = constraintsOf(await getConstraints(app, accessToken));

    const forbidden = list.find(({ type }) => type === 'FORBIDDEN_SLOTS');
    const preferred = list.find(({ type }) => type === 'PREFERRED_SLOTS');
    expect(forbidden?.slotCount).toBe(1);
    expect(forbidden?.warnings).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 2 }]);
    expect(preferred?.slotCount).toBe(1);
    expect(preferred?.warnings).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 1 }]);
  });

  it('warns in every rule that a course without a calendar cannot be checked', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const calendar = await createCalendar(app, accessToken, 'Jornada', 6);
    const course = await createCourse(app, accessToken, '1º Primaria', calendar);
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    await setRules(app, accessToken, course, english, {
      sessionsPerWeek: 3,
      maxPerDay: 2,
      blockSize: null,
    });
    await putSlots(app, accessToken, course, english, 'forbidden-slots', cells([1], [1, 2]));
    await testPrisma.course.update({ where: { id: course }, data: { calendarId: null } });

    const list = constraintsOf(await getConstraints(app, accessToken));

    expect(list.map(({ type, warnings }) => [type, codes(warnings)])).toEqual([
      ['MAX_PER_DAY', ['COURSE_WITHOUT_CALENDAR']],
      ['FORBIDDEN_SLOTS', ['COURSE_WITHOUT_CALENDAR']],
    ]);
    expect(list[1]?.slotCount).toBe(0);
  });

  it('gives each rule the warnings of its own and the union is the one of the workload of the course', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const calendar = await createCalendar(app, accessToken, 'Jornada', 6);
    const course = await createCourse(app, accessToken, '1º Primaria', calendar);
    const maths = await createSubject(app, accessToken, 'Matemáticas', [course], 5);
    await setRules(app, accessToken, course, maths, {
      sessionsPerWeek: 5,
      maxPerDay: 2,
      blockSize: null,
    });
    await putSlots(
      app,
      accessToken,
      course,
      maths,
      'forbidden-slots',
      cells([1, 2, 3, 4], [1, 2, 3, 4, 5, 6]),
    );
    await putSlots(app, accessToken, course, maths, 'preferred-slots', [
      ...cells([5], [1, 2, 3]),
      { dayOfWeek: 1, sessionNumber: 1 },
    ]);

    const list = constraintsOf(await getConstraints(app, accessToken));
    const workload = await request(app)
      .get(`/api/courses/${course}/workload`)
      .set(authorized(accessToken));

    const byType = Object.fromEntries(list.map(({ type, warnings }) => [type, warnings]));
    expect(codes(byType.MAX_PER_DAY ?? [])).toEqual(['SUBJECT_DOES_NOT_FIT']);
    expect(codes(byType.FORBIDDEN_SLOTS ?? [])).toEqual(['SUBJECT_DOES_NOT_FIT']);
    expect(byType.PREFERRED_SLOTS).toEqual([{ code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 }]);
    const subject = (
      workload.body as {
        data: { workload: { subjects: { name: string; warnings: { code: string }[] }[] } };
      }
    ).data.workload.subjects.find(({ name }) => name === 'Matemáticas');
    const union = new Set(list.flatMap(({ warnings }) => codes(warnings)));
    expect(union).toEqual(new Set(codes(subject?.warnings ?? [])));
  });

  it('does not list the rules of another school', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const courseOne = await createCourse(app, one.accessToken, '1º Primaria');
    const courseTwo = await createCourse(app, two.accessToken, '3º Primaria');
    const english = await createSubject(app, one.accessToken, 'Inglés', [courseOne]);
    const music = await createSubject(app, two.accessToken, 'Música', [courseTwo]);
    await setRules(app, one.accessToken, courseOne, english, {
      sessionsPerWeek: 3,
      maxPerDay: 2,
      blockSize: null,
    });
    await setRules(app, two.accessToken, courseTwo, music, {
      sessionsPerWeek: 3,
      maxPerDay: 3,
      blockSize: null,
    });

    const first = constraintsOf(await getConstraints(app, one.accessToken));
    const second = constraintsOf(await getConstraints(app, two.accessToken));

    expect(first.map(({ subject }) => subject.name)).toEqual(['Inglés']);
    expect(second.map(({ subject }) => subject.name)).toEqual(['Música']);
  });

  it('removes the rules of a subject taken out of a course', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const english = await createSubject(app, accessToken, 'Inglés', [course]);
    await setRules(app, accessToken, course, english, {
      sessionsPerWeek: 3,
      maxPerDay: 2,
      blockSize: null,
    });
    await request(app)
      .patch(`/api/courses/${course}/workload`)
      .set(authorized(accessToken))
      .send({
        changes: [{ subjectId: english, sessionsPerWeek: null, maxPerDay: null, blockSize: null }],
      })
      .expect(200);

    expect(constraintsOf(await getConstraints(app, accessToken))).toEqual([]);
  });

  it('responds 401 without a session', async () => {
    const { app } = realApp();

    const response = await request(app).get('/api/constraints');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
});
