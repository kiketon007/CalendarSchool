import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { realApp } from '../test/support/realApp.js';
import {
  adminOf,
  assign,
  authorized,
  createCalendar,
  createCourse,
  createProfessor,
  createSubject,
  memberOf,
  type App,
} from '../test/support/scheduleApi.js';
import { testPrisma } from '../test/support/testPrisma.js';

interface DraftBody {
  id: string;
  status: string;
  placedSessions: number;
  courses: {
    id: string;
    name: string;
    calendar: {
      name: string;
      periods: { type: string; startTime: string; endTime: string }[];
    } | null;
    classes: { id: string; name: string }[];
  }[];
  subjects: { id: string; name: string; code: string | null; color: string }[];
  professors: { id: string; firstName: string; lastName: string }[];
  entries: {
    classId: string;
    subjectId: string;
    professorId: string | null;
    dayOfWeek: number;
    sessionNumber: number;
    startTime: string;
    endTime: string;
  }[];
}

const draftOf = (response: request.Response) =>
  (response.body as { data: { schedule: DraftBody | null } }).data.schedule;

const readDraft = (app: App, accessToken: string) =>
  request(app).get('/api/schedule/draft').set(authorized(accessToken));

/** Genera y espera a que termine (el lanzador en memoria la ejecuta en el mismo proceso). */
async function generate(app: App, accessToken: string) {
  const started = await request(app).post('/api/schedule/generate').set(authorized(accessToken));
  expect(started.status).toBe(202);
  const id = (started.body as { data: { generation: { id: string } } }).data.generation.id;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await request(app)
      .get(`/api/schedule/generate/${id}`)
      .set(authorized(accessToken));
    const status = (response.body as { data: { generation: { status: string } } }).data.generation
      .status;
    if (status === 'COMPLETED') {
      return;
    }
    expect(['QUEUED', 'RUNNING']).toContain(status);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('La generación no terminó a tiempo');
}

/** 1º Primaria («Corto», tres sesiones al día, clase A) con Lengua (5 sesiones) para Ana. */
async function readySchool(realApps: ReturnType<typeof realApp>, name: string) {
  const { app } = realApps;
  const admin = await adminOf(app, name, `${name.toLowerCase().replaceAll(' ', '.')}@example.com`);
  const calendar = await createCalendar(app, admin.accessToken, 'Corto');
  const course = await createCourse(app, admin.accessToken, '1º Primaria', ['A'], calendar);
  const language = await createSubject(app, admin.accessToken, 'Lengua', course.id, 5);
  const ana = await createProfessor(app, admin.accessToken, 'Ana', 'García');
  await assign(app, admin.accessToken, course.id, [
    { subjectId: language, classId: course.classes.A ?? '', professorId: ana },
  ]);
  return { ...admin, course, language, ana };
}

describe('GET /api/schedule/draft', () => {
  it('answers null before the school ever generated', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');

    const response = await readDraft(realApps.app, school.accessToken);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(draftOf(response)).toBeNull();
  });

  it('answers the generated draft, normalized, with the hours as HH:MM', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, school.accessToken);

    const response = await readDraft(realApps.app, school.accessToken);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const draft = draftOf(response);
    expect(draft).toMatchObject({ status: 'DRAFT', placedSessions: 5 });
    expect(draft?.entries).toHaveLength(5);
    expect(draft?.courses).toHaveLength(1);
    expect(draft?.courses[0]).toMatchObject({ name: '1º Primaria' });
    expect(draft?.courses[0]?.classes).toEqual([{ id: school.course.classes.A, name: 'A' }]);
    expect(draft?.courses[0]?.calendar).toEqual({
      id: expect.any(String) as string,
      name: 'Corto',
      periods: [
        { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
        { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
        { type: 'SESSION', startTime: '11:00', endTime: '12:00' },
      ],
    });
    expect(draft?.subjects).toEqual([
      { id: school.language, name: 'Lengua', code: null, color: 'blue' },
    ]);
    expect(draft?.professors).toEqual([{ id: school.ana, firstName: 'Ana', lastName: 'García' }]);
    for (const entry of draft?.entries ?? []) {
      expect(entry).toMatchObject({ classId: school.course.classes.A, subjectId: school.language });
      expect(entry.professorId).toBe(school.ana);
      expect(entry.startTime).toMatch(/^(09|10|11):00$/u);
    }
  });

  it('lists the entries by day and session', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, school.accessToken);

    const draft = draftOf(await readDraft(realApps.app, school.accessToken));

    const cells = draft?.entries.map(({ dayOfWeek, sessionNumber }) => [dayOfWeek, sessionNumber]);
    expect(cells).toEqual(
      [...(cells ?? [])].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0)),
    );
  });

  it('lets a member read the draft', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, school.accessToken);
    const member = await memberOf(realApps, school.schoolId);

    const response = await readDraft(realApps.app, member);

    expect(response.status).toBe(200);
    expect(draftOf(response)?.entries).toHaveLength(5);
  });

  it('never shows the draft of another school, nor accepts a school in the query', async () => {
    const realApps = realApp();
    const one = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, one.accessToken);
    const two = await adminOf(realApps.app, 'Colegio Dos', 'colegio.dos@example.com');

    const response = await request(realApps.app)
      .get(`/api/schedule/draft?schoolId=${one.schoolId}`)
      .set(authorized(two.accessToken));

    expect(response.status).toBe(200);
    expect(draftOf(response)).toBeNull();
  });

  it('keeps the entries of a professor who was deleted after generating, with a null professor', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, school.accessToken);
    await testPrisma.professor.delete({ where: { id: school.ana } });

    const draft = draftOf(await readDraft(realApps.app, school.accessToken));

    expect(draft?.entries).toHaveLength(5);
    expect(draft?.entries.every(({ professorId }) => professorId === null)).toBe(true);
    expect(draft?.professors).toEqual([]);
  });

  it('answers a null calendar for a course that lost it after generating', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, school.accessToken);
    await testPrisma.course.update({ where: { id: school.course.id }, data: { calendarId: null } });

    const draft = draftOf(await readDraft(realApps.app, school.accessToken));

    expect(draft?.courses[0]?.calendar).toBeNull();
    expect(draft?.entries).toHaveLength(5);
  });

  it('answers the draft of the latest generation after regenerating, never two', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generate(realApps.app, school.accessToken);
    const first = draftOf(await readDraft(realApps.app, school.accessToken));
    await generate(realApps.app, school.accessToken);

    const second = draftOf(await readDraft(realApps.app, school.accessToken));

    expect(second?.id).not.toBe(first?.id);
    expect(second?.entries).toHaveLength(5);
  });

  it('answers 401 without a session', async () => {
    const realApps = realApp();

    const response = await request(realApps.app).get('/api/schedule/draft');

    expect(response.status).toBe(401);
  });
});
