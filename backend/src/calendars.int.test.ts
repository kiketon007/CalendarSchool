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

const createCalendar = (app: App, accessToken: string, body: unknown) =>
  request(app)
    .post('/api/calendars')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

const listCalendars = (app: App, accessToken: string) =>
  request(app).get('/api/calendars').set('Authorization', `Bearer ${accessToken}`);

const createCourse = async (app: App, accessToken: string, name: string) => {
  const response = await request(app)
    .post('/api/courses')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, classes: [{ name: 'A' }] });
  expect(response.status).toBe(201);
  return (response.body as { data: { course: { id: string } } }).data.course.id;
};

interface CalendarBody {
  id: string;
  name: string;
  periods: { type: string; startTime: string; endTime: string }[];
  courses: { id: string; name: string }[];
  createdAt: string;
}

const calendarOf = (response: request.Response) =>
  (response.body as { data: { calendar: CalendarBody } }).data.calendar;
const calendarsOf = (response: request.Response) =>
  (response.body as { data: { calendars: CalendarBody[] } }).data.calendars;
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;

const PRIMARY = {
  name: 'Primaria',
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
    { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
    { type: 'BREAK', startTime: '11:15', endTime: '11:45' },
    { type: 'SESSION', startTime: '11:45', endTime: '12:30' },
    { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
    { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
  ],
};

const INFANT = {
  name: 'Infantil',
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
    { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
    { type: 'BREAK', startTime: '11:15', endTime: '12:00' },
    { type: 'SESSION', startTime: '12:00', endTime: '12:30' },
    { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
    { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
  ],
};

describe('calendars against the test database', () => {
  it('creates the primary and the infant calendars and lists them in order, with their periods and courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await createCourse(app, accessToken, '1º Primaria');
    const second = await createCourse(app, accessToken, '2º Primaria');
    const infantCourse = await createCourse(app, accessToken, 'Infantil 3 años');

    const primary = await createCalendar(app, accessToken, {
      ...PRIMARY,
      courseIds: [second, first],
    });
    const infant = await createCalendar(app, accessToken, { ...INFANT, courseIds: [infantCourse] });

    expect(primary.status).toBe(201);
    expect(primary.headers['cache-control']).toBe('no-store');
    expect(calendarOf(primary)).toMatchObject({
      name: 'Primaria',
      periods: PRIMARY.periods,
      courses: [
        { id: first, name: '1º Primaria' },
        { id: second, name: '2º Primaria' },
      ],
    });
    expect(infant.status).toBe(201);
    const listed = await listCalendars(app, accessToken);
    expect(listed.status).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(calendarsOf(listed).map(({ name }) => name)).toEqual(['Infantil', 'Primaria']);
    expect(calendarsOf(listed)[0]?.periods).toEqual(INFANT.periods);
  });

  it('answers an empty list for a school without calendars', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await listCalendars(app, accessToken);

    expect(response.status).toBe(200);
    expect(calendarsOf(response)).toEqual([]);
  });

  it('moves a course from one calendar to another', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const moved = await createCourse(app, accessToken, '1º Primaria');
    const stays = await createCourse(app, accessToken, '2º Primaria');
    await createCalendar(app, accessToken, { ...INFANT, courseIds: [moved, stays] });

    await createCalendar(app, accessToken, { ...PRIMARY, courseIds: [moved] });

    const byName = Object.fromEntries(
      calendarsOf(await listCalendars(app, accessToken)).map((calendar) => [
        calendar.name,
        calendar,
      ]),
    );
    expect(byName.Primaria?.courses.map(({ id }) => id)).toEqual([moved]);
    expect(byName.Infantil?.courses.map(({ id }) => id)).toEqual([stays]);
  });

  it('answers 400 with the invalid fields, in order, and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await createCalendar(app, accessToken, {
      name: '<b>',
      periods: [
        { type: 'SESSION', startTime: '09:00', endTime: '10:31' },
        { type: 'SESSION', startTime: '10:00', endTime: '10:45' },
      ],
      courseIds: ['abc'],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'name', code: 'INVALID_CHARACTERS' },
        { field: 'periods[0].endTime', code: 'TOO_LONG' },
        { field: 'courseIds[0]', code: 'INVALID_FORMAT' },
      ],
    });
    await expect(testPrisma.calendar.count()).resolves.toBe(0);
  });

  it('answers 400 NOT_FOUND on the course of another school or unknown, and creates nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const mine = await createCourse(app, accessToken, '1º Primaria');
    const foreign = await createCourse(app, otherToken, '1º Primaria');

    const response = await createCalendar(app, accessToken, {
      ...PRIMARY,
      courseIds: [mine, foreign, crypto.randomUUID()],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'courseIds[1]', code: 'NOT_FOUND' },
      { field: 'courseIds[2]', code: 'NOT_FOUND' },
    ]);
    await expect(testPrisma.calendar.count()).resolves.toBe(0);
    await expect(
      testPrisma.course.findUniqueOrThrow({ where: { id: foreign } }),
    ).resolves.toMatchObject({ calendarId: null });
  });

  it('answers 409 CALENDAR_ALREADY_EXISTS for the same name in the school, and lets another school use it', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    await createCalendar(app, accessToken, PRIMARY);

    const repeated = await createCalendar(app, accessToken, { ...PRIMARY, name: ' primaria ' });
    const elsewhere = await createCalendar(app, otherToken, PRIMARY);

    expect(repeated.status).toBe(409);
    expect(errorOf(repeated).code).toBe('CALENDAR_ALREADY_EXISTS');
    expect(elsewhere.status).toBe(201);
  });

  it('never lists the calendars of another school', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    await createCalendar(app, otherToken, PRIMARY);

    expect(calendarsOf(await listCalendars(app, accessToken))).toEqual([]);
  });

  it('ignores a school and an id in the body: the calendar belongs to the school of the identity', async () => {
    const { app } = realApp();
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { schoolId: otherSchoolId } = await adminOf(app, 'CEIP Dos', 'dos@example.com');

    const response = await createCalendar(app, accessToken, {
      ...PRIMARY,
      id: crypto.randomUUID(),
      schoolId: otherSchoolId,
    });

    expect(response.status).toBe(201);
    const stored = await testPrisma.calendar.findUniqueOrThrow({
      where: { id: calendarOf(response).id },
    });
    expect(stored.schoolId).toBe(schoolId);
  });

  it('lets a member list the calendars but answers 403 FORBIDDEN, creating nothing, when it tries to create one', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken: adminToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    await createCalendar(app, adminToken, PRIMARY);
    const memberToken = await memberOf(realApps, schoolId);

    const listed = await listCalendars(app, memberToken);
    const created = await createCalendar(app, memberToken, INFANT);
    const invalid = await createCalendar(app, memberToken, {});

    expect(listed.status).toBe(200);
    expect(calendarsOf(listed).map(({ name }) => name)).toEqual(['Primaria']);
    expect(created.status).toBe(403);
    expect(errorOf(created).code).toBe('FORBIDDEN');
    expect(invalid.status).toBe(403);
    await expect(testPrisma.calendar.count()).resolves.toBe(1);
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const created = await request(app).post('/api/calendars').send(PRIMARY);
    const listed = await request(app).get('/api/calendars');

    expect(created.status).toBe(401);
    expect(listed.status).toBe(401);
    expect(created.headers['www-authenticate']).toBe('Bearer');
  });

  it('writes the events and the denial without names', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    await createCalendar(app, accessToken, { ...PRIMARY, courseIds: [course] });
    await createCalendar(app, accessToken, PRIMARY);
    await createCalendar(app, accessToken, { ...INFANT, courseIds: [crypto.randomUUID()] });
    await createCalendar(app, await memberOf(realApps, schoolId), INFANT);

    const log = logOutput();

    expect(log).toContain('"event":"CALENDAR_CREATED"');
    expect(log).toContain('"session_count":6');
    expect(log).toContain('"break_count":1');
    expect(log).toContain('"course_count":1');
    expect(log).toContain('"reason":"duplicate"');
    expect(log).toContain('"reason":"course_not_found"');
    expect(log).toContain('"event":"AUTHORIZATION_DENIED"');
    expect(log).not.toContain('Primaria');
    expect(log).not.toContain('Infantil');
  });

  it('answers 200 or 400 but never 500 when a calendar is created for a course that is being deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    for (let round = 0; round < 4; round += 1) {
      const course = await createCourse(app, accessToken, `Curso ${String(round)}`);

      const [created, deleted] = await Promise.all([
        createCalendar(app, accessToken, {
          ...PRIMARY,
          name: `Calendario ${String(round)}`,
          courseIds: [course],
        }),
        request(app).delete(`/api/courses/${course}`).set('Authorization', `Bearer ${accessToken}`),
      ]);

      expect([201, 400]).toContain(created.status);
      expect(deleted.status).toBe(200);
    }
  });

  it('does not change the answers of the courses for a course that follows a calendar', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const before = await request(app)
      .get(`/api/courses/${course}`)
      .set('Authorization', `Bearer ${accessToken}`);
    await createCalendar(app, accessToken, { ...PRIMARY, courseIds: [course] });

    const listed = await request(app)
      .get('/api/courses')
      .set('Authorization', `Bearer ${accessToken}`);
    const read = await request(app)
      .get(`/api/courses/${course}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(read.body).toEqual(before.body);
    const [listedCourse] = (listed.body as { data: { courses: object[] } }).data.courses;
    expect(Object.keys(listedCourse ?? {}).sort()).toEqual(
      ['classes', 'createdAt', 'id', 'name', 'studentCount'].sort(),
    );
    expect(JSON.stringify(read.body)).not.toContain('calendar');
  });
});

const readCalendar = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/calendars/${id}`).set('Authorization', `Bearer ${accessToken}`);

const editCalendar = (app: App, accessToken: string, id: string, body: unknown) =>
  request(app)
    .put(`/api/calendars/${id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);

/** Crea un calendario y devuelve su id. */
async function createdId(app: App, accessToken: string, body: unknown): Promise<string> {
  const response = await createCalendar(app, accessToken, body);
  expect(response.status).toBe(201);
  return calendarOf(response).id;
}

describe('reading and editing a calendar against the test database', () => {
  it('reads a calendar of the school with its periods in order and its courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [course] });

    const response = await readCalendar(app, accessToken, id);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(calendarOf(response)).toMatchObject({
      id,
      name: 'Primaria',
      periods: PRIMARY.periods,
      courses: [{ id: course, name: '1º Primaria' }],
    });
  });

  it('renames, replaces the day and moves, adds and frees courses in one edit', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const kept = await createCourse(app, accessToken, '1º Primaria');
    const freed = await createCourse(app, accessToken, '2º Primaria');
    const moved = await createCourse(app, accessToken, '3º Primaria');
    const added = await createCourse(app, accessToken, '4º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [kept, freed] });
    const infant = await createdId(app, accessToken, { ...INFANT, courseIds: [moved] });

    const response = await editCalendar(app, accessToken, id, {
      name: 'Primaria 1º ciclo',
      periods: INFANT.periods,
      courseIds: [kept, moved, added],
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const edited = calendarOf(response);
    expect(edited).toMatchObject({ id, name: 'Primaria 1º ciclo', periods: INFANT.periods });
    expect(edited.courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '3º Primaria',
      '4º Primaria',
    ]);
    const listed = calendarsOf(await listCalendars(app, accessToken));
    expect(listed.find((calendar) => calendar.id === infant)?.courses).toEqual([]);
    expect(listed.flatMap(({ courses }) => courses).map(({ name }) => name)).not.toContain(
      '2º Primaria',
    );
    await expect(
      testPrisma.course.findUniqueOrThrow({ where: { id: freed } }),
    ).resolves.toMatchObject({ calendarId: null });
    await expect(testPrisma.calendarPeriod.count({ where: { calendarId: id } })).resolves.toBe(
      INFANT.periods.length,
    );
  });

  it('answers 200 with the same calendar when nothing changes', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [course] });
    const before = calendarOf(await readCalendar(app, accessToken, id));

    const response = await editCalendar(app, accessToken, id, { ...PRIMARY, courseIds: [course] });

    expect(response.status).toBe(200);
    expect(calendarOf(response)).toEqual(before);
  });

  it('leaves the calendar without courses when courseIds is missing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [course] });

    const response = await editCalendar(app, accessToken, id, PRIMARY);

    expect(response.status).toBe(200);
    expect(calendarOf(response).courses).toEqual([]);
  });

  it('answers 409 CALENDAR_ALREADY_EXISTS for the name of another calendar, and accepts the capital letters of its own', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const id = await createdId(app, accessToken, PRIMARY);
    await createdId(app, accessToken, INFANT);

    const taken = await editCalendar(app, accessToken, id, { ...PRIMARY, name: ' infantil ' });
    const own = await editCalendar(app, accessToken, id, { ...PRIMARY, name: 'PRIMARIA' });

    expect(taken.status).toBe(409);
    expect(errorOf(taken).code).toBe('CALENDAR_ALREADY_EXISTS');
    expect(own.status).toBe(200);
    expect(calendarOf(own).name).toBe('PRIMARIA');
  });

  it('answers 400 with the invalid fields, in order, and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const id = await createdId(app, accessToken, PRIMARY);

    const response = await editCalendar(app, accessToken, id, {
      name: '',
      periods: [
        { type: 'BREAK', startTime: '09:00', endTime: '09:45' },
        { type: 'SESSION', startTime: '09:45', endTime: '11:30' },
      ],
      courseIds: ['no-es-un-uuid'],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).details?.map(({ field }) => field)).toEqual([
      'name',
      'periods[0].type',
      'periods[1].endTime',
      'courseIds[0]',
    ]);
    expect(calendarOf(await readCalendar(app, accessToken, id))).toMatchObject({
      name: 'Primaria',
      periods: PRIMARY.periods,
    });
  });

  it('answers 400 NOT_FOUND on the course of another school or unknown, and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const own = await createCourse(app, accessToken, '1º Primaria');
    const foreign = await createCourse(app, otherToken, 'Curso ajeno');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [own] });

    const response = await editCalendar(app, accessToken, id, {
      ...INFANT,
      courseIds: [own, foreign, crypto.randomUUID()],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'courseIds[1]', code: 'NOT_FOUND' },
      { field: 'courseIds[2]', code: 'NOT_FOUND' },
    ]);
    expect(calendarOf(await readCalendar(app, accessToken, id))).toMatchObject({
      name: 'Primaria',
      courses: [{ id: own }],
    });
    await expect(
      testPrisma.course.findUniqueOrThrow({ where: { id: foreign } }),
    ).resolves.toMatchObject({ calendarId: null });
  });

  it('answers 404 NOT_FOUND to a calendar of another school, an unknown one and an id that is not a UUID, when reading and editing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreignId = await createdId(app, otherToken, PRIMARY);

    for (const id of [foreignId, crypto.randomUUID(), 'no-es-un-uuid']) {
      const read = await readCalendar(app, accessToken, id);
      const edited = await editCalendar(app, accessToken, id, INFANT);

      expect(read.status).toBe(404);
      expect(errorOf(read).code).toBe('NOT_FOUND');
      expect(edited.status).toBe(404);
      expect(errorOf(edited).code).toBe('NOT_FOUND');
    }
    expect(calendarOf(await readCalendar(app, otherToken, foreignId)).name).toBe('Primaria');
  });

  it('lets a member read a calendar but answers 403 FORBIDDEN, changing nothing, when it tries to edit one', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const id = await createdId(app, accessToken, PRIMARY);
    const memberToken = await memberOf(realApps, schoolId);

    const read = await readCalendar(app, memberToken, id);
    const edited = await editCalendar(app, memberToken, id, INFANT);
    const unknown = await editCalendar(app, memberToken, crypto.randomUUID(), {});
    const notUuid = await editCalendar(app, memberToken, 'no-es-un-uuid', {});

    expect(read.status).toBe(200);
    expect(edited.status).toBe(403);
    expect(errorOf(edited).code).toBe('FORBIDDEN');
    expect(unknown.status).toBe(403);
    expect(notUuid.status).toBe(403);
    expect(calendarOf(await readCalendar(app, accessToken, id))).toMatchObject({
      name: 'Primaria',
      periods: PRIMARY.periods,
    });
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const read = await request(app).get(`/api/calendars/${id}`);
    const edited = await request(app).put(`/api/calendars/${id}`).send(PRIMARY);

    expect(read.status).toBe(401);
    expect(edited.status).toBe(401);
    expect(edited.headers['www-authenticate']).toBe('Bearer');
  });

  it('writes the events and the denial without names', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [course] });
    await createdId(app, accessToken, INFANT);
    await editCalendar(app, accessToken, id, { ...PRIMARY, name: 'Primaria nueva' });
    await editCalendar(app, accessToken, id, { ...PRIMARY, name: 'Infantil' });
    await editCalendar(app, accessToken, id, { ...PRIMARY, courseIds: [crypto.randomUUID()] });
    await editCalendar(app, accessToken, crypto.randomUUID(), PRIMARY);
    await editCalendar(app, await memberOf(realApps, schoolId), id, PRIMARY);

    const log = logOutput();

    expect(log).toContain('"event":"CALENDAR_UPDATED"');
    expect(log).toContain('"changed_fields":["name","courses"]');
    expect(log).toContain('"courses_removed":1');
    expect(log).toContain('"event":"CALENDAR_UPDATE_REJECTED"');
    expect(log).toContain('"reason":"duplicate"');
    expect(log).toContain('"reason":"course_not_found"');
    expect(log).toContain('"reason":"not_found"');
    expect(log).toContain('"event":"AUTHORIZATION_DENIED"');
    expect(log).not.toContain('Primaria');
    expect(log).not.toContain('Infantil');
  });

  it('answers 200 or 400 but never 500 when a calendar is edited for a course that is being deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    for (let round = 0; round < 4; round += 1) {
      const course = await createCourse(app, accessToken, `Curso ${String(round)}`);
      const id = await createdId(app, accessToken, {
        ...PRIMARY,
        name: `Calendario ${String(round)}`,
      });

      const [edited, deleted] = await Promise.all([
        editCalendar(app, accessToken, id, {
          ...INFANT,
          name: `Editado ${String(round)}`,
          courseIds: [course],
        }),
        request(app).delete(`/api/courses/${course}`).set('Authorization', `Bearer ${accessToken}`),
      ]);

      expect([200, 400]).toContain(edited.status);
      expect(deleted.status).toBe(200);
    }
  });

  it('ends two edits of the same calendar at once with 200 and the periods of one of them, whole', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    for (let round = 0; round < 4; round += 1) {
      const id = await createdId(app, accessToken, {
        ...PRIMARY,
        name: `Calendario ${String(round)}`,
      });

      const results = await Promise.all([
        editCalendar(app, accessToken, id, { ...PRIMARY, name: `Primero ${String(round)}` }),
        editCalendar(app, accessToken, id, { ...INFANT, name: `Segundo ${String(round)}` }),
      ]);

      expect(results.map(({ status }) => status)).toEqual([200, 200]);
      const stored = calendarOf(await readCalendar(app, accessToken, id));
      const expected = stored.name.startsWith('Primero') ? PRIMARY : INFANT;
      expect(stored.periods).toEqual(expected.periods);
    }
  });

  it('does not change the answers of the courses for a course that follows an edited calendar', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const id = await createdId(app, accessToken, PRIMARY);
    const before = await request(app)
      .get(`/api/courses/${course}`)
      .set('Authorization', `Bearer ${accessToken}`);

    await editCalendar(app, accessToken, id, { ...INFANT, courseIds: [course] });

    const read = await request(app)
      .get(`/api/courses/${course}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(read.body).toEqual(before.body);
  });
});

const deleteCalendar = (app: App, accessToken: string, id: string) =>
  request(app).delete(`/api/calendars/${id}`).set('Authorization', `Bearer ${accessToken}`);

const deletedOf = (response: request.Response) =>
  (response.body as { data: { deleted: { id: string; courseCount: number } } }).data.deleted;

const courseOf = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/courses/${id}`).set('Authorization', `Bearer ${accessToken}`);

describe('deleting a calendar against the test database', () => {
  it('deletes a calendar with courses: they stay without calendar and it disappears from the list and the read', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const first = await createCourse(app, accessToken, '1º Primaria');
    const second = await createCourse(app, accessToken, '2º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [first, second] });
    const infantId = await createdId(app, accessToken, INFANT);

    const response = await deleteCalendar(app, accessToken, id);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(deletedOf(response)).toEqual({ id, courseCount: 2 });
    expect((await readCalendar(app, accessToken, id)).status).toBe(404);
    expect(calendarsOf(await listCalendars(app, accessToken)).map(({ id: kept }) => kept)).toEqual([
      infantId,
    ]);
    for (const course of [first, second]) {
      expect((await courseOf(app, accessToken, course)).status).toBe(200);
    }
    expect(await testPrisma.calendarPeriod.count({ where: { calendarId: id } })).toBe(0);
    expect(
      await testPrisma.course.count({ where: { id: { in: [first, second] }, calendarId: null } }),
    ).toBe(2);
  });

  it('deletes a calendar without courses and answers a count of zero', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const id = await createdId(app, accessToken, PRIMARY);

    const response = await deleteCalendar(app, accessToken, id);

    expect(response.status).toBe(200);
    expect(deletedOf(response)).toEqual({ id, courseCount: 0 });
    expect(calendarsOf(await listCalendars(app, accessToken))).toEqual([]);
  });

  it('answers 404 NOT_FOUND to a calendar of another school, an unknown one, an id that is not a UUID and one already deleted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const { accessToken: otherToken } = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreignId = await createdId(app, otherToken, PRIMARY);
    const deletedId = await createdId(app, accessToken, INFANT);
    expect((await deleteCalendar(app, accessToken, deletedId)).status).toBe(200);

    for (const id of [foreignId, crypto.randomUUID(), 'no-es-un-uuid', deletedId]) {
      const response = await deleteCalendar(app, accessToken, id);

      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
    }
    expect(calendarOf(await readCalendar(app, otherToken, foreignId)).name).toBe('Primaria');
  });

  it('answers 403 FORBIDDEN to a member, deleting nothing, also for an unknown id or one that is not a UUID', async () => {
    const realApps = realApp();
    const { app } = realApps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const id = await createdId(app, accessToken, PRIMARY);
    const memberToken = await memberOf(realApps, schoolId);

    const own = await deleteCalendar(app, memberToken, id);
    const unknown = await deleteCalendar(app, memberToken, crypto.randomUUID());
    const notUuid = await deleteCalendar(app, memberToken, 'no-es-un-uuid');

    for (const response of [own, unknown, notUuid]) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe('FORBIDDEN');
    }
    expect(calendarOf(await readCalendar(app, accessToken, id))).toMatchObject({
      name: 'Primaria',
      periods: PRIMARY.periods,
    });
  });

  it('answers 401 without a token', async () => {
    const { app } = realApp();

    const response = await request(app).delete(`/api/calendars/${crypto.randomUUID()}`);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('writes CALENDAR_DELETED once, with the count, and no event for a 404, without names', async () => {
    const realApps = realApp();
    const { app, logOutput } = realApps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const course = await createCourse(app, accessToken, '1º Primaria');
    const id = await createdId(app, accessToken, { ...PRIMARY, courseIds: [course] });
    await deleteCalendar(app, accessToken, id);
    await deleteCalendar(app, accessToken, id);

    const log = logOutput();

    expect(log.match(/"event":"CALENDAR_DELETED"/g)).toHaveLength(1);
    expect(log).toContain('"course_count":1');
    expect(log).toContain(`"calendar_id":"${id}"`);
    expect(log).not.toContain('Primaria');
  });

  it('ends two simultaneous deletions of the same calendar with 200 and 404', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    for (let round = 0; round < 4; round += 1) {
      const course = await createCourse(app, accessToken, `Curso ${String(round)}`);
      const id = await createdId(app, accessToken, {
        ...PRIMARY,
        name: `Primaria ${String(round)}`,
        courseIds: [course],
      });

      const responses = await Promise.all([
        deleteCalendar(app, accessToken, id),
        deleteCalendar(app, accessToken, id),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 404]);
    }
  });
});
