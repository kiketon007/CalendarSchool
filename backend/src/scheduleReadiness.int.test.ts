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

/** Tres sesiones de 60 minutos: 15 a la semana. */
const SHORT_DAY = [
  { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
  { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
  { type: 'SESSION', startTime: '11:00', endTime: '12:00' },
];

async function createCalendar(app: App, accessToken: string, name: string) {
  const response = await request(app)
    .post('/api/calendars')
    .set(authorized(accessToken))
    .send({ name, periods: SHORT_DAY });
  expect(response.status).toBe(201);
  return (response.body as { data: { calendar: { id: string } } }).data.calendar.id;
}

interface CourseIds {
  id: string;
  classes: Record<string, string>;
}

/** Un curso con las clases dadas y, si se pide, un calendario. */
async function createCourse(
  app: App,
  accessToken: string,
  name: string,
  classNames: string[],
  calendarId: string | null = null,
): Promise<CourseIds> {
  const response = await request(app)
    .post('/api/courses')
    .set(authorized(accessToken))
    .send({ name, classes: classNames.map((className) => ({ name: className })) });
  expect(response.status).toBe(201);
  const course = (
    response.body as { data: { course: { id: string; classes: { id: string; name: string }[] } } }
  ).data.course;
  if (calendarId !== null) {
    await testPrisma.course.update({ where: { id: course.id }, data: { calendarId } });
  }
  return {
    id: course.id,
    classes: Object.fromEntries(course.classes.map((entry) => [entry.name, entry.id])),
  };
}

async function createSubject(
  app: App,
  accessToken: string,
  name: string,
  courseId: string,
  sessionsPerWeek: number,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
) {
  const response = await request(app)
    .post('/api/subjects')
    .set(authorized(accessToken))
    .send({
      name,
      type: 'CORE',
      status,
      color: 'blue',
      courses: [{ courseId, sessionsPerWeek }],
    });
  expect(response.status).toBe(201);
  return (response.body as { data: { subject: { id: string } } }).data.subject.id;
}

async function createProfessor(app: App, accessToken: string, firstName: string, lastName: string) {
  const response = await request(app)
    .post('/api/professors')
    .set(authorized(accessToken))
    .send({ firstName, lastName });
  expect(response.status).toBe(201);
  return (response.body as { data: { professor: { id: string } } }).data.professor.id;
}

const assign = async (
  app: App,
  accessToken: string,
  courseId: string,
  assignments: { subjectId: string; classId: string; professorId: string }[],
) => {
  const response = await request(app)
    .put(`/api/courses/${courseId}/assignments`)
    .set(authorized(accessToken))
    .send({ assignments });
  expect(response.status).toBe(200);
};

interface Ref {
  id: string;
  name: string;
}

interface IssueBody {
  code: string;
  course?: Ref;
  subject?: Ref;
  schoolClass?: Ref;
  professor?: { id: string; firstName: string; lastName: string };
  classes?: Ref[];
  courses?: Ref[];
  missingCount?: number;
}

interface ReadinessBody {
  ready: boolean;
  blocking: IssueBody[];
  warnings: IssueBody[];
}

const readinessOf = (response: request.Response) =>
  (response.body as { data: { readiness: ReadinessBody } }).data.readiness;

const getReadiness = (app: App, accessToken: string) =>
  request(app).get('/api/schedule/readiness').set(authorized(accessToken));

/** Un problema reducido a lo que se compara: su código y los nombres de lo que cita. */
const briefOf = (issue: IssueBody) =>
  [
    issue.code,
    issue.course?.name,
    issue.subject?.name,
    issue.schoolClass?.name,
    issue.professor === undefined
      ? undefined
      : `${issue.professor.firstName} ${issue.professor.lastName}`,
    issue.classes?.map(({ name }) => name).join(','),
    issue.courses?.map(({ name }) => name).join(','),
    issue.missingCount,
  ].filter((part) => part !== undefined);

/**
 * Un colegio con 1º Primaria («Corto», clases A y B) con Lengua (5) para Ana en la clase A y Francés (2, inactiva), y
 * 6º Primaria sin calendario con Inglés (3) para Luis. Los datos se crean por la API.
 */
async function setUp(app: App, accessToken: string) {
  const short = await createCalendar(app, accessToken, 'Corto');
  const first = await createCourse(app, accessToken, '1º Primaria', ['A', 'B'], short);
  const sixth = await createCourse(app, accessToken, '6º Primaria', ['A']);
  const language = await createSubject(app, accessToken, 'Lengua', first.id, 5);
  await createSubject(app, accessToken, 'Francés', first.id, 2, 'INACTIVE');
  const english = await createSubject(app, accessToken, 'Inglés', sixth.id, 3);
  const ana = await createProfessor(app, accessToken, 'Ana', 'García');
  const luis = await createProfessor(app, accessToken, 'Luis', 'Ruiz');
  await assign(app, accessToken, first.id, [
    { subjectId: language, classId: first.classes.A ?? '', professorId: ana },
  ]);
  await assign(app, accessToken, sixth.id, [
    { subjectId: english, classId: sixth.classes.A ?? '', professorId: luis },
  ]);
  return { first, sixth, language, english, ana, luis };
}

describe('the readiness to generate the timetables against the test database', () => {
  it('lists the blocking issues and the warnings of the school in order, also for a member', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    await setUp(app, accessToken);

    const response = await getReadiness(app, accessToken);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const readiness = readinessOf(response);
    expect(readiness.ready).toBe(false);
    expect(readiness.blocking.map(briefOf)).toEqual([
      ['COURSE_WITHOUT_CALENDAR', '6º Primaria'],
      ['CLASSES_WITHOUT_PROFESSOR', '1º Primaria', 'Lengua', 'B', 1],
    ]);
    expect(readiness.warnings.map(briefOf)).toEqual([
      ['SUBJECT_INACTIVE', 'Francés', '1º Primaria'],
    ]);

    const member = await getReadiness(app, await memberOf(apps, schoolId));
    expect(member.status).toBe(200);
    expect(member.body).toEqual(response.body);
  });

  it('stops blocking once the problem is fixed: assigning the missing professor and giving the course a calendar', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const ids = await setUp(app, accessToken);

    await assign(app, accessToken, ids.first.id, [
      { subjectId: ids.language, classId: ids.first.classes.A ?? '', professorId: ids.ana },
      { subjectId: ids.language, classId: ids.first.classes.B ?? '', professorId: ids.ana },
    ]);
    const afterAssigning = readinessOf(await getReadiness(app, accessToken));
    expect(afterAssigning.blocking.map(briefOf)).toEqual([
      ['COURSE_WITHOUT_CALENDAR', '6º Primaria'],
    ]);

    const calendar = await createCalendar(app, accessToken, 'Otro');
    await testPrisma.course.update({
      where: { id: ids.sixth.id },
      data: { calendarId: calendar },
    });
    const ready = readinessOf(await getReadiness(app, accessToken));
    expect(ready.ready).toBe(true);
    expect(ready.blocking).toEqual([]);
    expect(ready.warnings.map(briefOf)).toEqual([['SUBJECT_INACTIVE', 'Francés', '1º Primaria']]);
  });

  it('blocks a subject that fits with its rules but not with the hours its professor cannot work', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const short = await createCalendar(app, accessToken, 'Corto');
    const course = await createCourse(app, accessToken, '1º Primaria', ['A'], short);
    const english = await createSubject(app, accessToken, 'Inglés', course.id, 3);
    const eva = await createProfessor(app, accessToken, 'Eva', 'Soto');
    await assign(app, accessToken, course.id, [
      { subjectId: english, classId: course.classes.A ?? '', professorId: eva },
    ]);
    // El viernes prohibido: quedan lunes a jueves para 3 sesiones con un máximo de una al día.
    const forbidden = await request(app)
      .put(`/api/courses/${course.id}/subjects/${english}/forbidden-slots`)
      .set(authorized(accessToken))
      .send({ slots: [1, 2, 3].map((sessionNumber) => ({ dayOfWeek: 5, sessionNumber })) });
    expect(forbidden.status).toBe(200);
    expect(readinessOf(await getReadiness(app, accessToken)).ready).toBe(true);

    // Eva no puede lunes ni martes: con el viernes solo quedan miércoles y jueves.
    const unavailable = (days: number[]) =>
      request(app)
        .put(`/api/professors/${eva}/availability`)
        .set(authorized(accessToken))
        .send({
          unavailable: days.map((dayOfWeek) => ({
            dayOfWeek,
            startTime: '09:00',
            endTime: '12:00',
          })),
        });
    expect((await unavailable([1, 2])).status).toBe(200);
    const blocked = readinessOf(await getReadiness(app, accessToken));
    expect(blocked.blocking.map(briefOf)).toEqual([
      ['SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR', '1º Primaria', 'Inglés', 'A', 'Eva Soto'],
    ]);

    // Sin el martes bloqueado quedan martes, miércoles y jueves: cabe.
    expect((await unavailable([1])).status).toBe(200);
    expect(readinessOf(await getReadiness(app, accessToken)).ready).toBe(true);
  });

  it('blocks a school without courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const readiness = readinessOf(await getReadiness(app, accessToken));

    expect(readiness).toEqual({
      ready: false,
      blocking: [{ code: 'SCHOOL_WITHOUT_COURSES' }],
      warnings: [],
    });
  });

  it('is ready for a school with nothing to fix', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const short = await createCalendar(app, accessToken, 'Corto');
    const course = await createCourse(app, accessToken, '1º Primaria', ['A'], short);
    const language = await createSubject(app, accessToken, 'Lengua', course.id, 5);
    const ana = await createProfessor(app, accessToken, 'Ana', 'García');
    await assign(app, accessToken, course.id, [
      { subjectId: language, classId: course.classes.A ?? '', professorId: ana },
    ]);

    const readiness = readinessOf(await getReadiness(app, accessToken));

    expect(readiness).toEqual({ ready: true, blocking: [], warnings: [] });
  });

  it('does not show the problems of another school', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    await setUp(app, one.accessToken);

    const other = readinessOf(await getReadiness(app, two.accessToken));

    expect(other.blocking.map(briefOf)).toEqual([['SCHOOL_WITHOUT_COURSES']]);
    expect(other.warnings).toEqual([]);
    expect(readinessOf(await getReadiness(app, one.accessToken)).blocking).toHaveLength(2);
  });

  it('responds 401 without a session', async () => {
    const { app } = realApp();

    const response = await request(app).get('/api/schedule/readiness');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
});
