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

interface SummaryBody {
  id: string;
  status: string;
  placedSessions: number;
  confirmedAt: string | null;
  confirmedBy: { firstName: string; lastName: string } | null;
  replacedAt: string | null;
}

const get = (app: App, accessToken: string, path: string) =>
  request(app).get(`/api/schedule/${path}`).set(authorized(accessToken));
const confirm = (app: App, accessToken: string, id: string) =>
  request(app).post(`/api/schedule/${id}/confirm`).set(authorized(accessToken));

const schedulesOf = (response: request.Response) =>
  (response.body as { data: { schedules: SummaryBody[] } }).data.schedules;
const scheduleOf = (response: request.Response) =>
  (response.body as { data: { schedule: (SummaryBody & { entries: unknown[] }) | null } }).data
    .schedule;

/** Genera y espera a que termine (el lanzador en memoria la ejecuta en el mismo proceso). */
async function generate(app: App, accessToken: string): Promise<void> {
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

/** 1º Primaria («Corto», clase A) con Lengua (5 sesiones) para Ana. */
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

/** Genera un borrador y lo confirma; devuelve su id. */
async function generateAndConfirm(app: App, accessToken: string): Promise<string> {
  await generate(app, accessToken);
  const draft = scheduleOf(await get(app, accessToken, 'draft'));
  const id = draft?.id ?? '';
  expect((await confirm(app, accessToken, id)).status).toBe(200);
  return id;
}

describe('previous schedules', () => {
  it('lists the replaced officials, the most recently replaced first, without the current one', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    const first = await generateAndConfirm(realApps.app, school.accessToken);
    const second = await generateAndConfirm(realApps.app, school.accessToken);
    const third = await generateAndConfirm(realApps.app, school.accessToken);

    const list = await get(realApps.app, school.accessToken, 'previous');

    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(schedulesOf(list).map(({ id }) => id)).toEqual([second, first]);
    expect(schedulesOf(list)[0]).toMatchObject({
      status: 'OFFICIAL',
      placedSessions: 5,
      confirmedBy: { firstName: 'José María', lastName: 'García-López' },
    });
    expect(schedulesOf(list)[0]?.replacedAt).toEqual(expect.any(String));
    expect(schedulesOf(list).map(({ id }) => id)).not.toContain(third);
  });

  it('answers an empty list when nothing was replaced', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generateAndConfirm(realApps.app, school.accessToken);

    const list = await get(realApps.app, school.accessToken, 'previous');

    expect(list.status).toBe(200);
    expect(schedulesOf(list)).toEqual([]);
  });

  it('opens a replaced official and the current one by id, with the entries it had', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    const first = await generateAndConfirm(realApps.app, school.accessToken);
    const second = await generateAndConfirm(realApps.app, school.accessToken);

    const old = await get(realApps.app, school.accessToken, first);
    const current = await get(realApps.app, school.accessToken, second);

    expect(old.status).toBe(200);
    expect(old.headers['cache-control']).toBe('no-store');
    expect(scheduleOf(old)).toMatchObject({ id: first, status: 'OFFICIAL' });
    expect(scheduleOf(old)?.replacedAt).toEqual(expect.any(String));
    expect(scheduleOf(old)?.entries).toHaveLength(5);
    expect(scheduleOf(current)).toMatchObject({ id: second, replacedAt: null });
  });

  it('answers 404 to the id of a draft, an unknown id and an id that is not a UUID', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    await generateAndConfirm(realApps.app, school.accessToken);
    await generate(realApps.app, school.accessToken);
    const draftId = scheduleOf(await get(realApps.app, school.accessToken, 'draft'))?.id ?? '';

    for (const id of [draftId, '0192f5a0-0000-7000-8000-00000000ffff', 'not-a-uuid']) {
      const response = await get(realApps.app, school.accessToken, id);
      expect(response.status).toBe(404);
      expect((response.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    }
  });

  it('lets a member read the list and a previous schedule', async () => {
    const realApps = realApp();
    const school = await readySchool(realApps, 'Colegio Uno');
    const first = await generateAndConfirm(realApps.app, school.accessToken);
    await generateAndConfirm(realApps.app, school.accessToken);
    const member = await memberOf(realApps, school.schoolId);

    const list = await get(realApps.app, member, 'previous');
    const old = await get(realApps.app, member, first);

    expect(schedulesOf(list).map(({ id }) => id)).toEqual([first]);
    expect(old.status).toBe(200);
  });

  it('never shows the schedules of another school', async () => {
    const realApps = realApp();
    const one = await readySchool(realApps, 'Colegio Uno');
    const two = await readySchool(realApps, 'Colegio Dos');
    const oneFirst = await generateAndConfirm(realApps.app, one.accessToken);
    await generateAndConfirm(realApps.app, one.accessToken);
    await generateAndConfirm(realApps.app, two.accessToken);

    const list = await get(realApps.app, two.accessToken, 'previous');
    const foreign = await get(realApps.app, two.accessToken, oneFirst);

    expect(schedulesOf(list)).toEqual([]);
    expect(foreign.status).toBe(404);
  });

  it('answers 401 without a session', async () => {
    const realApps = realApp();

    expect((await request(realApps.app).get('/api/schedule/previous')).status).toBe(401);
    expect(
      (await request(realApps.app).get('/api/schedule/0192f5a0-0000-7000-8000-00000000ffff'))
        .status,
    ).toBe(401);
  });
});
