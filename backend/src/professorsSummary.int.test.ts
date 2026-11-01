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

interface PeriodBody {
  type: 'SESSION';
  startTime: string;
  endTime: string;
}

/** Cinco sesiones de 45 minutos: 25 a la semana. */
const SHORT_DAY: PeriodBody[] = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'SESSION', startTime: '10:00', endTime: '10:45' },
  { type: 'SESSION', startTime: '11:00', endTime: '11:45' },
  { type: 'SESSION', startTime: '12:00', endTime: '12:45' },
  { type: 'SESSION', startTime: '13:00', endTime: '13:45' },
];

/** Tres sesiones de 60 minutos y dos de 90: 15 de 60 y 10 de 90 a la semana. */
const LONG_DAY: PeriodBody[] = [
  { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
  { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
  { type: 'SESSION', startTime: '11:00', endTime: '12:00' },
  { type: 'SESSION', startTime: '12:30', endTime: '14:00' },
  { type: 'SESSION', startTime: '14:00', endTime: '15:30' },
];

async function createCalendar(app: App, accessToken: string, name: string, periods: PeriodBody[]) {
  const response = await request(app)
    .post('/api/calendars')
    .set(authorized(accessToken))
    .send({ name, periods });
  expect(response.status).toBe(201);
  return (response.body as { data: { calendar: { id: string } } }).data.calendar.id;
}

interface CourseIds {
  id: string;
  classA: string;
  classB: string;
}

/** Un curso con las clases A y B y, si se pide, un calendario. */
async function createCourse(
  app: App,
  accessToken: string,
  name: string,
  calendarId: string | null = null,
): Promise<CourseIds> {
  const response = await request(app)
    .post('/api/courses')
    .set(authorized(accessToken))
    .send({ name, classes: [{ name: 'A' }, { name: 'B' }] });
  expect(response.status).toBe(201);
  const course = (
    response.body as { data: { course: { id: string; classes: { id: string; name: string }[] } } }
  ).data.course;
  if (calendarId !== null) {
    await testPrisma.course.update({ where: { id: course.id }, data: { calendarId } });
  }
  const classOf = (className: string) =>
    course.classes.find((entry) => entry.name === className)?.id ?? '';
  return { id: course.id, classA: classOf('A'), classB: classOf('B') };
}

async function createSubject(
  app: App,
  accessToken: string,
  name: string,
  courseId: string,
  sessionsPerWeek: number,
) {
  const response = await request(app)
    .post('/api/subjects')
    .set(authorized(accessToken))
    .send({
      name,
      type: 'CORE',
      status: 'ACTIVE',
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

interface LoadBody {
  id: string;
  firstName: string;
  lastName: string;
  subjects: { subjectName: string; courseName: string; className: string }[];
  courses: { id: string; name: string }[];
  sessionsPerWeek: number;
  minMinutes: number;
  maxMinutes: number;
  status: string;
  warnings: { code: string }[];
}

interface SummaryBody {
  maxTeachingMinutes: number;
  professors: LoadBody[];
  unassigned: { courseId: string; courseName: string; missingCount: number }[];
}

const summaryOf = (response: request.Response) =>
  (response.body as { data: { summary: SummaryBody } }).data.summary;

const getSummary = (app: App, accessToken: string) =>
  request(app).get('/api/professors/summary').set(authorized(accessToken));

/**
 * Un colegio con un calendario de sesiones de 45 minutos («Corto») y otro de 60 y 90 («Largo»), y cinco profesores
 * en los cuatro estados. Los datos se crean por la API.
 */
async function setUp(app: App, accessToken: string) {
  const short = await createCalendar(app, accessToken, 'Corto', SHORT_DAY);
  const long = await createCalendar(app, accessToken, 'Largo', LONG_DAY);
  const first = await createCourse(app, accessToken, '1º Primaria', short);
  const third = await createCourse(app, accessToken, '3º Primaria', long);
  const fourth = await createCourse(app, accessToken, '4º Primaria', long);
  const sixth = await createCourse(app, accessToken, '6º Primaria');
  await createCourse(app, accessToken, '2º Primaria', short);

  const ana = await createProfessor(app, accessToken, 'Ana', 'García');
  const eva = await createProfessor(app, accessToken, 'Eva', 'Pérez');
  const luis = await createProfessor(app, accessToken, 'Luis', 'Ruiz');
  const pedro = await createProfessor(app, accessToken, 'Pedro', 'Soto');
  const sara = await createProfessor(app, accessToken, 'Sara', 'Vega');

  // 1º: Lengua (5) para Ana en las dos clases e Inglés (3) para Eva en la A; falta Inglés en la B.
  const language = await createSubject(app, accessToken, 'Lengua', first.id, 5);
  const english = await createSubject(app, accessToken, 'Inglés', first.id, 3);
  await assign(app, accessToken, first.id, [
    { subjectId: language, classId: first.classA, professorId: ana },
    { subjectId: language, classId: first.classB, professorId: ana },
    { subjectId: english, classId: first.classA, professorId: eva },
  ]);

  // 6º, sin calendario: Lengua (3) para Eva en la A; falta en la B.
  const sixthLanguage = await createSubject(app, accessToken, 'Lengua 6', sixth.id, 3);
  await assign(app, accessToken, sixth.id, [
    { subjectId: sixthLanguage, classId: sixth.classA, professorId: eva },
  ]);

  // 3º: cuatro asignaturas de 5 sesiones para Pedro en la A (20 sesiones; faltan las 4 de la B).
  const thirdSubjects = await Promise.all(
    ['Mates', 'Ciencias', 'Música', 'Plástica'].map((name) =>
      createSubject(app, accessToken, name, third.id, 5),
    ),
  );
  await assign(
    app,
    accessToken,
    third.id,
    thirdSubjects.map((subjectId) => ({ subjectId, classId: third.classA, professorId: pedro })),
  );

  // 4º: cinco asignaturas (5, 5, 5, 5 y 2 sesiones) para Sara en la A (22 sesiones; faltan las 5 de la B).
  const fourthSubjects = await Promise.all(
    [
      ['Sociales', 5],
      ['Naturales', 5],
      ['Valores', 5],
      ['Tecnología', 5],
      ['Religión', 2],
    ].map(([name, sessions]) =>
      createSubject(app, accessToken, String(name), fourth.id, Number(sessions)),
    ),
  );
  await assign(
    app,
    accessToken,
    fourth.id,
    fourthSubjects.map((subjectId) => ({ subjectId, classId: fourth.classA, professorId: sara })),
  );

  return { first, third, fourth, sixth, ana, eva, luis, pedro, sara };
}

describe('the summary of the load of the professors against the test database', () => {
  it('summarises the school: the four states, the warnings, the order and the courses without professor', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const ids = await setUp(app, accessToken);

    const response = await getSummary(app, accessToken);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const summary = summaryOf(response);
    expect(summary.maxTeachingMinutes).toBe(1380);
    expect(
      summary.professors.map(
        ({ lastName, status, sessionsPerWeek, minMinutes, maxMinutes, warnings }) => [
          lastName,
          status,
          sessionsPerWeek,
          minMinutes,
          maxMinutes,
          warnings.map(({ code }) => code),
        ],
      ),
    ).toEqual([
      // 10 sesiones de 45 minutos.
      ['García', 'FITS', 10, 450, 450, []],
      // 3 sesiones de 45 minutos en 1º y 3 sin calendario en 6º: solo suma la primera.
      ['Pérez', 'FITS', 6, 135, 135, ['COURSE_WITHOUT_CALENDAR']],
      ['Ruiz', 'NO_LOAD', 0, 0, 0, []],
      // 20 sesiones de 60 y 90 minutos: de 15 × 60 + 5 × 90 a 10 × 90 + 10 × 60.
      ['Soto', 'MAY_EXCEED', 20, 1350, 1500, ['MAY_EXCEED_MAX_HOURS']],
      // 22 sesiones: de 15 × 60 + 7 × 90 a 10 × 90 + 12 × 60.
      ['Vega', 'EXCEEDS', 22, 1530, 1620, ['EXCEEDS_MAX_HOURS']],
    ]);
    expect(summary.unassigned).toEqual([
      { courseId: ids.first.id, courseName: '1º Primaria', missingCount: 1 },
      { courseId: ids.third.id, courseName: '3º Primaria', missingCount: 4 },
      { courseId: ids.fourth.id, courseName: '4º Primaria', missingCount: 5 },
      { courseId: ids.sixth.id, courseName: '6º Primaria', missingCount: 1 },
    ]);
  });

  it('gives each professor what they teach in order and the courses where they teach', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const ids = await setUp(app, accessToken);

    const summary = summaryOf(await getSummary(app, accessToken));

    const eva = summary.professors.find(({ id }) => id === ids.eva);
    expect(
      eva?.subjects.map(({ subjectName, courseName, className }) => [
        subjectName,
        courseName,
        className,
      ]),
    ).toEqual([
      ['Inglés', '1º Primaria', 'A'],
      ['Lengua 6', '6º Primaria', 'A'],
    ]);
    expect(eva?.courses.map(({ name }) => name)).toEqual(['1º Primaria', '6º Primaria']);
    const luis = summary.professors.find(({ id }) => id === ids.luis);
    expect(luis?.subjects).toEqual([]);
    expect(luis?.courses).toEqual([]);
  });

  it('uses the intervals of the availability of the professor: the days they cannot are not counted', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const ids = await setUp(app, accessToken);
    // Ana tiene 10 sesiones en «Corto» (25 a la semana): sin lunes ni martes ni miércoles quedan 10 libres.
    const unavailable = await request(app)
      .put(`/api/professors/${ids.ana}/availability`)
      .set(authorized(accessToken))
      .send({
        unavailable: [1, 2, 3].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '14:00',
        })),
      });
    expect(unavailable.status).toBe(200);

    const ana = summaryOf(await getSummary(app, accessToken)).professors.find(
      ({ id }) => id === ids.ana,
    );

    expect(ana?.warnings).toEqual([]);
    expect(ana?.minMinutes).toBe(450);

    // Con un día más sin clase (5 sesiones libres para 10) la disponibilidad ya no alcanza.
    const moreUnavailable = await request(app)
      .put(`/api/professors/${ids.ana}/availability`)
      .set(authorized(accessToken))
      .send({
        unavailable: [1, 2, 3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '14:00',
        })),
      });
    expect(moreUnavailable.status).toBe(200);

    const after = summaryOf(await getSummary(app, accessToken)).professors.find(
      ({ id }) => id === ids.ana,
    );
    expect(after?.warnings.map(({ code }) => code)).toEqual(['AVAILABILITY_INSUFFICIENT']);
  });

  it('answers empty lists for a school without professors or courses', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const response = await getSummary(app, accessToken);

    expect(response.status).toBe(200);
    expect(summaryOf(response)).toEqual({
      maxTeachingMinutes: 1380,
      professors: [],
      unassigned: [],
    });
  });

  it('is the same for a member as for an administrator', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    await setUp(app, accessToken);
    const memberToken = await memberOf(apps, schoolId);

    const admin = await getSummary(app, accessToken);
    const member = await getSummary(app, memberToken);

    expect(member.status).toBe(200);
    expect(member.body).toEqual(admin.body);
  });

  it('does not show the professors or the courses of another school', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    await setUp(app, one.accessToken);

    const other = summaryOf(await getSummary(app, two.accessToken));

    expect(other.professors).toEqual([]);
    expect(other.unassigned).toEqual([]);
    expect(summaryOf(await getSummary(app, one.accessToken)).professors).toHaveLength(5);
  });

  it('does not take summary for the id of a professor', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');

    const summary = await getSummary(app, accessToken);
    const unknown = await request(app)
      .get('/api/professors/0192f5a0-0000-7000-8000-000000000999')
      .set(authorized(accessToken));

    expect(summary.status).toBe(200);
    expect(unknown.status).toBe(404);
  });

  it('responds 401 without a session', async () => {
    const { app } = realApp();

    const response = await request(app).get('/api/professors/summary');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
});
