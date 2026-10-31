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

/** Un calendario con los periodos dados (`S` sesión y `B` recreo), de 45 minutos y seguidos. */
const createCalendar = async (app: App, accessToken: string, name: string, layout: string) => {
  const periods = [...layout].map((letter, index) => {
    const start = 9 * 60 + index * 45;
    const hhmm = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return {
      type: letter === 'B' ? ('BREAK' as const) : ('SESSION' as const),
      startTime: hhmm(start),
      endTime: hhmm(start + 45),
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
  sessionsPerWeek = 2,
) => {
  const response = await request(app)
    .post('/api/subjects')
    .set(authorized(accessToken))
    .send({
      name,
      type: 'CORE',
      status: 'ACTIVE',
      color: 'purple',
      courses: courseIds.map((courseId) => ({ courseId, sessionsPerWeek })),
    });
  expect(response.status).toBe(201);
  return (response.body as { data: { subject: { id: string } } }).data.subject.id;
};

const slotsUrl = (courseId: string, subjectId: string) =>
  `/api/courses/${courseId}/subjects/${subjectId}/forbidden-slots`;
const getSlots = (app: App, accessToken: string, courseId: string, subjectId: string) =>
  request(app).get(slotsUrl(courseId, subjectId)).set(authorized(accessToken));
const putSlots = (
  app: App,
  accessToken: string,
  courseId: string,
  subjectId: string,
  body: unknown,
) =>
  request(app)
    .put(slotsUrl(courseId, subjectId))
    .set(authorized(accessToken))
    .send(body as object);
const getWorkload = (app: App, accessToken: string, courseId: string) =>
  request(app).get(`/api/courses/${courseId}/workload`).set(authorized(accessToken));

interface Cell {
  dayOfWeek: number;
  sessionNumber: number;
}
interface SlotRuleBody {
  course: { id: string; name: string };
  subject: {
    id: string;
    sessionsPerWeek: number;
    maxPerDay: number | null;
    blockSize: number | null;
  };
  calendar: {
    id: string;
    name: string;
    periods: { type: string; startTime: string; endTime: string }[];
  } | null;
  slots: Cell[];
  forbiddenSlots?: Cell[];
  outsideCalendarCount: number;
  warnings: { code: string; count?: number }[];
}

const ruleOf = (response: request.Response) =>
  (response.body as { data: { slotRule: SlotRuleBody } }).data.slotRule;
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;
const cell = (dayOfWeek: number, sessionNumber: number): Cell => ({ dayOfWeek, sessionNumber });
const wholeDays = (days: number[], sessions: number): Cell[] =>
  days.flatMap((day) => Array.from({ length: sessions }, (_, index) => cell(day, index + 1)));

const cellCount = () => testPrisma.schedulingConstraintSlot.count();
const ruleCount = () => testPrisma.schedulingConstraint.count();

/** Un colegio con un curso de seis sesiones y el recreo tras la 3ª, y «Religión» impartida en él. */
async function setup(realApps = realApp()) {
  const { app } = realApps;
  const admin = await adminOf(app, 'CEIP Uno', 'uno@example.com');
  const calendar = await createCalendar(app, admin.accessToken, 'Jornada', 'SSSBSSS');
  const course = await createCourse(app, admin.accessToken, '1º Primaria', calendar);
  const religion = await createSubject(app, admin.accessToken, 'Religión', [course], 2);
  return { realApps, app, ...admin, calendar, course, religion };
}

describe('the forbidden slots against the test database', () => {
  it('reads the grid of a course with a break and no slots', async () => {
    const { app, accessToken, course, religion } = await setup();

    const response = await getSlots(app, accessToken, course, religion);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const rule = ruleOf(response);
    expect(rule.course).toEqual({ id: course, name: '1º Primaria' });
    expect(rule.subject).toMatchObject({
      id: religion,
      sessionsPerWeek: 2,
      maxPerDay: null,
      blockSize: null,
    });
    expect(rule.calendar?.periods.map(({ type }) => type)).toEqual([
      'SESSION',
      'SESSION',
      'SESSION',
      'BREAK',
      'SESSION',
      'SESSION',
      'SESSION',
    ]);
    expect(rule.slots).toEqual([]);
    expect(rule.outsideCalendarCount).toBe(0);
    expect(rule.warnings).toEqual([]);
  });

  it('marks three whole days, shows them in the workload, and empties them again', async () => {
    const { app, accessToken, course, religion } = await setup();

    const saved = await putSlots(app, accessToken, course, religion, {
      slots: wholeDays([1, 3, 5], 6),
    });

    expect(saved.status).toBe(200);
    expect(saved.headers['cache-control']).toBe('no-store');
    expect(ruleOf(saved).slots).toHaveLength(18);
    await expect(ruleCount()).resolves.toBe(1);
    await expect(cellCount()).resolves.toBe(18);
    const workload = await getWorkload(app, accessToken, course);
    const subject = (
      workload.body as {
        data: {
          workload: {
            calendar: { sessionGroups: number[] };
            subjects: { id: string; forbiddenSlots: Cell[]; constraintCount: number }[];
          };
        };
      }
    ).data.workload;
    expect(subject.calendar.sessionGroups).toEqual([3, 3]);
    expect(subject.subjects[0]).toMatchObject({ id: religion, constraintCount: 1 });
    expect(subject.subjects[0]?.forbiddenSlots).toHaveLength(18);

    const emptied = await putSlots(app, accessToken, course, religion, { slots: [] });

    expect(emptied.status).toBe(200);
    expect(ruleOf(emptied).slots).toEqual([]);
    await expect(ruleCount()).resolves.toBe(0);
    await expect(cellCount()).resolves.toBe(0);
  });

  it('warns that a subject does not fit when three whole days are forbidden, and still saves', async () => {
    const { app, accessToken, course } = await setup();
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);

    const response = await putSlots(app, accessToken, course, english, {
      slots: wholeDays([1, 2, 3], 6),
    });

    expect(response.status).toBe(200);
    expect(ruleOf(response).warnings).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    const workload = await getWorkload(app, accessToken, course);
    const warnings = (
      workload.body as { data: { workload: { subjects: { id: string; warnings: unknown[] }[] } } }
    ).data.workload.subjects.find((subject) => subject.id === english)?.warnings;
    expect(warnings).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });

  it('says that a block does not fit when the break cuts it', async () => {
    const { app, accessToken, course } = await setup();
    const plastica = await createSubject(app, accessToken, 'Plástica', [course], 2);
    const patched = await request(app)
      .patch(`/api/courses/${course}/workload`)
      .set(authorized(accessToken))
      .send({
        changes: [{ subjectId: plastica, sessionsPerWeek: 2, maxPerDay: null, blockSize: 2 }],
      });
    expect(patched.status).toBe(200);
    // Todas las sesiones prohibidas salvo la 3ª y la 4ª, que quedan a los dos lados del recreo.
    const free = [3, 4];
    const forbidden = [1, 2, 3, 4, 5].flatMap((day) =>
      [1, 2, 3, 4, 5, 6]
        .filter((session) => !free.includes(session))
        .map((session) => cell(day, session)),
    );

    const response = await putSlots(app, accessToken, course, plastica, { slots: forbidden });

    expect(response.status).toBe(200);
    expect(ruleOf(response).warnings).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });

  it('ignores the cells outside the calendar when it changes, warns about them and removes them on saving', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, {
      slots: [...[1, 2, 3, 4, 5].map((day) => cell(day, 6)), cell(1, 1)],
    });
    const shorter = await createCalendar(app, accessToken, 'Corta', 'SSSSS');
    await testPrisma.course.update({ where: { id: course }, data: { calendarId: shorter } });

    const read = await getSlots(app, accessToken, course, religion);

    expect(ruleOf(read).slots).toEqual([cell(1, 1)]);
    expect(ruleOf(read).outsideCalendarCount).toBe(5);
    expect(ruleOf(read).warnings).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }]);
    await expect(cellCount()).resolves.toBe(6);

    const saved = await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1)] });

    expect(ruleOf(saved).outsideCalendarCount).toBe(0);
    expect(ruleOf(saved).warnings).toEqual([]);
    await expect(cellCount()).resolves.toBe(1);
  });

  it('answers 400 with the invalid fields and changes nothing', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1)] });

    const shape = await putSlots(app, accessToken, course, religion, {
      slots: [cell(6, 1), cell(1, 9), cell(2, 3), cell(2, 3)],
    });
    const calendar = await putSlots(app, accessToken, course, religion, { slots: [cell(1, 7)] });
    const missing = await putSlots(app, accessToken, course, religion, {});

    expect(shape.status).toBe(400);
    expect(errorOf(shape).details).toEqual([
      { field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' },
      { field: 'slots[1].sessionNumber', code: 'OUT_OF_RANGE' },
      { field: 'slots[3]', code: 'DUPLICATE' },
    ]);
    expect(calendar.status).toBe(400);
    expect(errorOf(calendar).details).toEqual([
      { field: 'slots[0].sessionNumber', code: 'OUT_OF_RANGE' },
    ]);
    expect(missing.status).toBe(400);
    expect(errorOf(missing).details).toEqual([{ field: 'slots', code: 'REQUIRED' }]);
    await expect(cellCount()).resolves.toBe(1);
  });

  it('answers 409 COURSE_HAS_NO_CALENDAR for a course without a calendar, and writes nothing', async () => {
    const { app, accessToken } = await setup();
    const bare = await createCourse(app, accessToken, '2º Primaria');
    const music = await createSubject(app, accessToken, 'Música', [bare], 2);

    const response = await putSlots(app, accessToken, bare, music, { slots: [cell(1, 1)] });
    const read = await getSlots(app, accessToken, bare, music);

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe('COURSE_HAS_NO_CALENDAR');
    expect(read.status).toBe(200);
    expect(ruleOf(read).calendar).toBeNull();
    await expect(ruleCount()).resolves.toBe(0);
  });

  it('answers 404 NOT_FOUND, without distinguishing, for ids that are malformed, missing, of another school or not taught', async () => {
    const realApps = realApp();
    const { app, accessToken, course, religion } = await setup(realApps);
    const other = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreignCourse = await createCourse(app, other.accessToken, '1º Primaria');
    const music = await createSubject(
      app,
      accessToken,
      'Música',
      [await createCourse(app, accessToken, '3º Primaria')],
      2,
    );

    for (const [courseId, subjectId] of [
      ['no-es-un-uuid', religion],
      [course, 'no-es-un-uuid'],
      [crypto.randomUUID(), religion],
      [course, crypto.randomUUID()],
      [foreignCourse, religion],
      [course, music],
    ] as const) {
      expect((await getSlots(app, accessToken, courseId, subjectId)).status).toBe(404);
      const put = await putSlots(app, accessToken, courseId, subjectId, { slots: [cell(1, 1)] });
      expect(put.status).toBe(404);
      expect(errorOf(put).code).toBe('NOT_FOUND');
    }
    await expect(ruleCount()).resolves.toBe(0);
  });

  it('lets a member read the grid but answers 403 FORBIDDEN to a save, even with a missing id or an invalid body', async () => {
    const realApps = realApp();
    const { app, schoolId, accessToken, course, religion } = await setup(realApps);
    await putSlots(app, accessToken, course, religion, { slots: [cell(2, 2)] });
    const member = await memberOf(realApps, schoolId);

    const read = await getSlots(app, member, course, religion);
    const denied = await putSlots(app, member, course, religion, { slots: [] });
    const deniedMissing = await putSlots(app, member, crypto.randomUUID(), religion, {
      slots: 'x',
    });

    expect(read.status).toBe(200);
    expect(ruleOf(read).slots).toEqual([cell(2, 2)]);
    expect(denied.status).toBe(403);
    expect(deniedMissing.status).toBe(403);
    await expect(cellCount()).resolves.toBe(1);
  });

  it('answers 401 without a token', async () => {
    const { app, course, religion } = await setup();

    expect((await request(app).get(slotsUrl(course, religion))).status).toBe(401);
    expect((await request(app).put(slotsUrl(course, religion)).send({ slots: [] })).status).toBe(
      401,
    );
  });

  it('deletes the cells when the subject is removed from the course from its edition', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1), cell(2, 2)] });

    const edited = await request(app)
      .put(`/api/subjects/${religion}`)
      .set(authorized(accessToken))
      .send({
        name: 'Religión',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'purple',
        courses: [
          { courseId: await createCourse(app, accessToken, '2º Primaria'), sessionsPerWeek: 2 },
        ],
      });

    expect(edited.status).toBe(200);
    await expect(cellCount()).resolves.toBe(0);
    await expect(ruleCount()).resolves.toBe(0);
  });

  it('keeps the cells when the subject is saved without touching its courses', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1), cell(2, 2)] });

    const edited = await request(app)
      .put(`/api/subjects/${religion}`)
      .set(authorized(accessToken))
      .send({
        name: 'Religión nueva',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'purple',
        courses: [{ courseId: course, sessionsPerWeek: 2 }],
      });

    expect(edited.status).toBe(200);
    await expect(cellCount()).resolves.toBe(2);
  });

  it('deletes the cells when the subject stops being taught from the workload, and counts the rule', async () => {
    const realApps = realApp();
    const { app, accessToken, course, religion } = await setup(realApps);
    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1), cell(2, 2)] });

    const response = await request(app)
      .patch(`/api/courses/${course}/workload`)
      .set(authorized(accessToken))
      .send({
        changes: [{ subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null }],
      });

    expect(response.status).toBe(200);
    await expect(cellCount()).resolves.toBe(0);
    expect(realApps.logOutput()).toContain('"constraints_removed":1');
  });

  it('deletes the cells with the subject and with the course, and reports them in the impact', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1), cell(2, 2)] });

    const impact = await request(app)
      .get(`/api/courses/${course}/impact`)
      .set(authorized(accessToken));
    expect(
      (impact.body as { data: { impact: { constraintCount: number } } }).data.impact
        .constraintCount,
    ).toBe(1);

    const deletedCourse = await request(app)
      .delete(`/api/courses/${course}`)
      .set(authorized(accessToken));

    expect(deletedCourse.status).toBe(200);
    expect(
      (deletedCourse.body as { data: { deleted: { constraintCount: number } } }).data.deleted
        .constraintCount,
    ).toBe(1);
    await expect(cellCount()).resolves.toBe(0);

    const another = await createCourse(
      app,
      accessToken,
      '3º Primaria',
      await createCalendar(app, accessToken, 'Otra', 'SSS'),
    );
    const history = await createSubject(app, accessToken, 'Historia', [another], 2);
    await putSlots(app, accessToken, another, history, { slots: [cell(1, 1)] });
    await request(app).delete(`/api/subjects/${history}`).set(authorized(accessToken));
    await expect(cellCount()).resolves.toBe(0);
  });

  it('writes the update and the rejections without names, codes or courses', async () => {
    const realApps = realApp();
    const { app, accessToken, course, religion } = await setup(realApps);
    const bare = await createCourse(app, accessToken, '2º Primaria');
    const music = await createSubject(app, accessToken, 'Música', [bare], 2);

    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1), cell(2, 2)] });
    await putSlots(app, accessToken, course, religion, { slots: [cell(2, 2), cell(1, 1)] });
    await putSlots(app, accessToken, bare, music, { slots: [cell(1, 1)] });
    await putSlots(app, accessToken, course, crypto.randomUUID(), { slots: [cell(1, 1)] });

    const log = realApps.logOutput();

    expect(log.split('"event":"SUBJECT_SLOTS_UPDATED"').length - 1).toBe(1);
    expect(log).toContain('"slot_count":2');
    expect(log).toContain('"type":"FORBIDDEN_SLOTS"');
    expect(log).toContain('"reason":"no_calendar"');
    expect(log).toContain('"reason":"not_found"');
    for (const secret of ['Religión', 'Música', '1º Primaria', 'CEIP Uno']) {
      expect(log).not.toContain(secret);
    }
  });
});

const preferredUrl = (courseId: string, subjectId: string) =>
  `/api/courses/${courseId}/subjects/${subjectId}/preferred-slots`;
const getPreferred = (app: App, accessToken: string, courseId: string, subjectId: string) =>
  request(app).get(preferredUrl(courseId, subjectId)).set(authorized(accessToken));
const putPreferred = (
  app: App,
  accessToken: string,
  courseId: string,
  subjectId: string,
  body: unknown,
) =>
  request(app)
    .put(preferredUrl(courseId, subjectId))
    .set(authorized(accessToken))
    .send(body as object);

interface WorkloadSubjectBody {
  id: string;
  constraintCount: number;
  forbiddenSlots: Cell[];
  preferredSlotCount: number;
  warnings: { code: string; count?: number }[];
}
const workloadSubject = async (app: App, accessToken: string, course: string, id: string) => {
  const response = await getWorkload(app, accessToken, course);
  const subjects = (response.body as { data: { workload: { subjects: WorkloadSubjectBody[] } } })
    .data.workload.subjects;
  return subjects.find((subject) => subject.id === id);
};
const typesStored = async () =>
  (await testPrisma.schedulingConstraint.findMany()).map(({ type }) => type).sort();

describe('the preferred slots against the test database', () => {
  it('reads the grid with the forbidden cells of the pair apart, and none on the forbidden route', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, { slots: [cell(1, 1), cell(5, 6)] });

    const preferred = await getPreferred(app, accessToken, course, religion);
    const forbidden = await getSlots(app, accessToken, course, religion);

    expect(preferred.status).toBe(200);
    expect(preferred.headers['cache-control']).toBe('no-store');
    expect(ruleOf(preferred).slots).toEqual([]);
    expect(ruleOf(preferred).forbiddenSlots).toEqual([cell(1, 1), cell(5, 6)]);
    expect(ruleOf(forbidden).slots).toEqual([cell(1, 1), cell(5, 6)]);
    expect(ruleOf(forbidden)).not.toHaveProperty('forbiddenSlots');
  });

  it('marks the first two sessions of every day, counts them in the workload, and empties them', async () => {
    const { app, accessToken, course, religion } = await setup();
    const maths = await createSubject(app, accessToken, 'Matemáticas', [course], 4);
    const ten = [1, 2, 3, 4, 5].flatMap((day) => [cell(day, 1), cell(day, 2)]);

    const saved = await putPreferred(app, accessToken, course, maths, { slots: ten });

    expect(saved.status).toBe(200);
    expect(ruleOf(saved).slots).toHaveLength(10);
    expect(await typesStored()).toEqual(['PREFERRED_SLOTS']);
    await expect(cellCount()).resolves.toBe(10);
    const subject = await workloadSubject(app, accessToken, course, maths);
    expect(subject).toMatchObject({ preferredSlotCount: 10, constraintCount: 1 });
    expect(subject?.forbiddenSlots).toEqual([]);
    expect((await workloadSubject(app, accessToken, course, religion))?.preferredSlotCount).toBe(0);

    const emptied = await putPreferred(app, accessToken, course, maths, { slots: [] });

    expect(emptied.status).toBe(200);
    expect(ruleOf(emptied).slots).toEqual([]);
    await expect(ruleCount()).resolves.toBe(0);
    await expect(cellCount()).resolves.toBe(0);
  });

  it('accepts a preferred cell that is forbidden, warns in both places, and the warning goes when it is unmarked', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putSlots(app, accessToken, course, religion, { slots: wholeDays([1], 6) });

    const saved = await putPreferred(app, accessToken, course, religion, {
      slots: [cell(1, 1), cell(2, 1)],
    });

    expect(saved.status).toBe(200);
    expect(ruleOf(saved).warnings).toEqual([{ code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 }]);
    expect((await workloadSubject(app, accessToken, course, religion))?.warnings).toEqual([
      { code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 },
    ]);

    const fixed = await putPreferred(app, accessToken, course, religion, { slots: [cell(2, 1)] });

    expect(ruleOf(fixed).warnings).toEqual([]);
    expect((await workloadSubject(app, accessToken, course, religion))?.warnings).toEqual([]);
  });

  it('shows the contradiction when the day is forbidden after being preferred', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putPreferred(app, accessToken, course, religion, { slots: [cell(2, 2)] });

    await putSlots(app, accessToken, course, religion, { slots: wholeDays([2], 6) });

    const read = await getPreferred(app, accessToken, course, religion);
    expect(ruleOf(read).slots).toEqual([cell(2, 2)]);
    expect(ruleOf(read).warnings).toEqual([{ code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 }]);
  });

  it('keeps the two rules apart: emptying one leaves the other, and only the forbidden ones decide if it fits', async () => {
    const { app, accessToken, course } = await setup();
    const english = await createSubject(app, accessToken, 'Inglés', [course], 3);
    await putSlots(app, accessToken, course, english, { slots: wholeDays([1, 2], 6) });
    await putPreferred(app, accessToken, course, english, { slots: wholeDays([3, 4, 5], 6) });

    expect(await typesStored()).toEqual(['FORBIDDEN_SLOTS', 'PREFERRED_SLOTS']);
    expect(ruleOf(await getPreferred(app, accessToken, course, english)).warnings).toEqual([]);

    await putPreferred(app, accessToken, course, english, { slots: [] });

    expect(await typesStored()).toEqual(['FORBIDDEN_SLOTS']);
    expect(ruleOf(await getSlots(app, accessToken, course, english)).slots).toHaveLength(12);
  });

  it('counts the cells outside the calendar of both rules in the workload and removes the preferred ones on saving', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putPreferred(app, accessToken, course, religion, { slots: [cell(1, 6), cell(2, 6)] });
    await putSlots(app, accessToken, course, religion, { slots: [cell(3, 6)] });
    const shorter = await createCalendar(app, accessToken, 'Corta', 'SSSSS');
    await testPrisma.course.update({ where: { id: course }, data: { calendarId: shorter } });

    const subject = await workloadSubject(app, accessToken, course, religion);
    expect(subject?.warnings).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 3 }]);
    expect(subject?.preferredSlotCount).toBe(0);
    const read = await getPreferred(app, accessToken, course, religion);
    expect(ruleOf(read).outsideCalendarCount).toBe(2);

    const saved = await putPreferred(app, accessToken, course, religion, { slots: [] });

    expect(ruleOf(saved).outsideCalendarCount).toBe(0);
    expect(await typesStored()).toEqual(['FORBIDDEN_SLOTS']);
  });

  it('answers 400 with the invalid fields and changes nothing', async () => {
    const { app, accessToken, course, religion } = await setup();

    const response = await putPreferred(app, accessToken, course, religion, {
      slots: [cell(6, 1), cell(1, 9), cell(2, 3), cell(2, 3)],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' },
      { field: 'slots[1].sessionNumber', code: 'OUT_OF_RANGE' },
      { field: 'slots[3]', code: 'DUPLICATE' },
    ]);
    await expect(cellCount()).resolves.toBe(0);
  });

  it('answers 409 for a course without a calendar and 404 for a subject that is not taught, writing nothing', async () => {
    const { app, accessToken, religion } = await setup();
    const bare = await createCourse(app, accessToken, '2º Primaria');
    const music = await createSubject(app, accessToken, 'Música', [bare], 2);

    const noCalendar = await putPreferred(app, accessToken, bare, music, { slots: [cell(1, 1)] });
    const notTaught = await putPreferred(app, accessToken, bare, religion, { slots: [] });
    const malformed = await getPreferred(app, accessToken, 'no-es-un-uuid', religion);

    expect(noCalendar.status).toBe(409);
    expect(errorOf(noCalendar).code).toBe('COURSE_HAS_NO_CALENDAR');
    expect(notTaught.status).toBe(404);
    expect(malformed.status).toBe(404);
    await expect(ruleCount()).resolves.toBe(0);
  });

  it('lets a member read the grid but answers 403 to a save, and 401 without a token', async () => {
    const realApps = realApp();
    const { app, schoolId, accessToken, course, religion } = await setup(realApps);
    await putPreferred(app, accessToken, course, religion, { slots: [cell(2, 2)] });
    const member = await memberOf(realApps, schoolId);

    const read = await getPreferred(app, member, course, religion);
    const denied = await putPreferred(app, member, course, religion, { slots: [] });
    const deniedMissing = await putPreferred(app, member, crypto.randomUUID(), religion, {
      slots: 'x',
    });

    expect(read.status).toBe(200);
    expect(ruleOf(read).slots).toEqual([cell(2, 2)]);
    expect(denied.status).toBe(403);
    expect(deniedMissing.status).toBe(403);
    await expect(cellCount()).resolves.toBe(1);
    expect((await request(app).get(preferredUrl(course, religion))).status).toBe(401);
    expect(
      (await request(app).put(preferredUrl(course, religion)).send({ slots: [] })).status,
    ).toBe(401);
  });

  it('deletes the cells of both rules when the subject stops being taught from the workload', async () => {
    const { app, accessToken, course, religion } = await setup();
    await putPreferred(app, accessToken, course, religion, { slots: [cell(1, 1)] });
    await putSlots(app, accessToken, course, religion, { slots: [cell(2, 2)] });
    await expect(cellCount()).resolves.toBe(2);

    const removed = await request(app)
      .patch(`/api/courses/${course}/workload`)
      .set(authorized(accessToken))
      .send({
        changes: [{ subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null }],
      });

    expect(removed.status).toBe(200);
    await expect(cellCount()).resolves.toBe(0);
    await expect(ruleCount()).resolves.toBe(0);
  });

  it('writes the update and the rejections with the type and without names', async () => {
    const realApps = realApp();
    const { app, accessToken, course, religion } = await setup(realApps);
    const bare = await createCourse(app, accessToken, '2º Primaria');
    const music = await createSubject(app, accessToken, 'Música', [bare], 2);

    await putPreferred(app, accessToken, course, religion, { slots: [cell(1, 1), cell(2, 2)] });
    await putPreferred(app, accessToken, course, religion, { slots: [cell(2, 2), cell(1, 1)] });
    await putPreferred(app, accessToken, bare, music, { slots: [cell(1, 1)] });
    await putPreferred(app, accessToken, course, crypto.randomUUID(), { slots: [cell(1, 1)] });

    const log = realApps.logOutput();

    expect(log.split('"event":"SUBJECT_SLOTS_UPDATED"').length - 1).toBe(1);
    expect(log).toContain('"type":"PREFERRED_SLOTS"');
    expect(log).not.toContain('"type":"FORBIDDEN_SLOTS"');
    expect(log).toContain('"slot_count":2');
    expect(log).toContain('"reason":"no_calendar"');
    expect(log).toContain('"reason":"not_found"');
    for (const secret of ['Religión', 'Música', '1º Primaria', 'CEIP Uno']) {
      expect(log).not.toContain(secret);
    }
  });
});
