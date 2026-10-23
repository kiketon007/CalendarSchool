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
