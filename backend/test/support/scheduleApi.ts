import request from 'supertest';
import { expect } from 'vitest';
import { TEST_APP_ORIGIN } from './appDoubles.js';
import type { realApp } from './realApp.js';
import { testPrisma } from './testPrisma.js';

/**
 * Ayudas de los tests de integración que preparan un colegio por la API real (administrador, miembro, calendario,
 * curso, asignatura, profesor y asignaciones). Las usan los de la generación de horarios.
 */
export const PASSWORD = 'Secreta123!';

export type App = ReturnType<typeof realApp>['app'];

export const authorized = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio con su administrador y devuelve su access token, el colegio y el administrador. */
export async function adminOf(app: App, schoolName: string, email: string) {
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
  const body = (
    refreshed.body as {
      data: { session: { accessToken: string }; user: { id: string } };
    }
  ).data;
  return { accessToken: body.session.accessToken, schoolId: data.school.id, userId: body.user.id };
}

/** Crea un usuario `MEMBER` del colegio y devuelve su access token. */
export async function memberOf(realApps: ReturnType<typeof realApp>, schoolId: string) {
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

/** Tres sesiones de 60 minutos: 15 a la semana. */
const SHORT_DAY = [
  { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
  { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
  { type: 'SESSION', startTime: '11:00', endTime: '12:00' },
];

export async function createCalendar(app: App, accessToken: string, name: string) {
  const response = await request(app)
    .post('/api/calendars')
    .set(authorized(accessToken))
    .send({ name, periods: SHORT_DAY });
  expect(response.status).toBe(201);
  return (response.body as { data: { calendar: { id: string } } }).data.calendar.id;
}

export interface CourseIds {
  id: string;
  classes: Record<string, string>;
}

/** Un curso con las clases dadas y, si se pide, un calendario. */
export async function createCourse(
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

export async function createSubject(
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

export async function createProfessor(
  app: App,
  accessToken: string,
  firstName: string,
  lastName: string,
) {
  const response = await request(app)
    .post('/api/professors')
    .set(authorized(accessToken))
    .send({ firstName, lastName });
  expect(response.status).toBe(201);
  return (response.body as { data: { professor: { id: string } } }).data.professor.id;
}

export async function assign(
  app: App,
  accessToken: string,
  courseId: string,
  assignments: { subjectId: string; classId: string; professorId: string }[],
) {
  const response = await request(app)
    .put(`/api/courses/${courseId}/assignments`)
    .set(authorized(accessToken))
    .send({ assignments });
  expect(response.status).toBe(200);
}
