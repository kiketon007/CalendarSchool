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

interface SummaryBody {
  id: string;
  status: string;
  placedSessions: number;
  confirmedAt: string | null;
  confirmedBy: { firstName: string; lastName: string } | null;
  replacedAt: string | null;
  score?: unknown;
}

const get = (app: App, accessToken: string, path: string) =>
  request(app).get(`/api/schedule/${path}`).set(authorized(accessToken));
const confirm = (app: App, accessToken: string, id: string) =>
  request(app).post(`/api/schedule/${id}/confirm`).set(authorized(accessToken));
const discard = (app: App, accessToken: string, id: string) =>
  request(app).delete(`/api/schedule/${id}`).set(authorized(accessToken));

const scheduleOf = (response: request.Response) =>
  (response.body as { data: { schedule: (SummaryBody & { entries: unknown[] }) | null } }).data
    .schedule;
const overviewOf = (response: request.Response) =>
  (
    response.body as {
      data: { draft: SummaryBody | null; official: SummaryBody | null; previousCount: number };
    }
  ).data;

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

/** Genera y devuelve el id del borrador. */
async function generateDraft(realApps: ReturnType<typeof realApp>, accessToken: string) {
  await generate(realApps.app, accessToken);
  const overview = overviewOf(await get(realApps.app, accessToken, 'overview'));
  return overview.draft?.id ?? '';
}

describe('schedule confirmation', () => {
  describe('the overview and the official before confirming', () => {
    it('answers nothing for a school that never generated', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');

      const overview = await get(realApps.app, school.accessToken, 'overview');
      const official = await get(realApps.app, school.accessToken, 'official');

      expect(overview.status).toBe(200);
      expect(overview.headers['cache-control']).toBe('no-store');
      expect(overviewOf(overview)).toEqual({ draft: null, official: null, previousCount: 0 });
      expect(scheduleOf(official)).toBeNull();
    });

    it('shows the draft in the overview once generated, without an official', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      await generate(realApps.app, school.accessToken);

      const overview = overviewOf(await get(realApps.app, school.accessToken, 'overview'));

      expect(overview.draft).toMatchObject({
        status: 'DRAFT',
        placedSessions: 5,
        confirmedAt: null,
        confirmedBy: null,
        replacedAt: null,
      });
      expect(overview.official).toBeNull();
    });
  });

  describe('confirming', () => {
    it('promotes the draft to the official, and the official reads like the draft did', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const draftId = await generateDraft(realApps, school.accessToken);
      const draftEntries = scheduleOf(
        await get(realApps.app, school.accessToken, 'draft'),
      )?.entries;

      const confirmed = await confirm(realApps.app, school.accessToken, draftId);

      expect(confirmed.status).toBe(200);
      expect(confirmed.headers['cache-control']).toBe('no-store');
      expect(scheduleOf(confirmed)).toMatchObject({
        id: draftId,
        status: 'OFFICIAL',
        placedSessions: 5,
        confirmedBy: { firstName: 'José María', lastName: 'García-López' },
        replacedAt: null,
      });
      const official = scheduleOf(await get(realApps.app, school.accessToken, 'official'));
      expect(official).toMatchObject({ id: draftId, status: 'OFFICIAL' });
      expect(official?.entries).toEqual(draftEntries);
      expect(scheduleOf(await get(realApps.app, school.accessToken, 'draft'))).toBeNull();
      expect(overviewOf(await get(realApps.app, school.accessToken, 'overview'))).toMatchObject({
        draft: null,
        official: { id: draftId },
        previousCount: 0,
      });
    });

    it('replaces the official with a newer draft, and keeps the old one', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const first = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, first);
      const second = await generateDraft(realApps, school.accessToken);
      expect(second).not.toBe(first);

      await confirm(realApps.app, school.accessToken, second);

      const overview = overviewOf(await get(realApps.app, school.accessToken, 'overview'));
      expect(overview.official?.id).toBe(second);
      expect(overview.previousCount).toBe(1);
      const old = await testPrisma.schedule.findUniqueOrThrow({ where: { id: first } });
      expect(old.replacedAt).toBeInstanceOf(Date);
      await expect(testPrisma.scheduleEntry.count({ where: { scheduleId: first } })).resolves.toBe(
        5,
      );
    });

    it('keeps the score of the draft in the official, in the replaced one and in the list of previous ones (US-ALGO-RUN_b)', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Puntuacion');
      const first = await generateDraft(realApps, school.accessToken);
      const draftScore = scheduleOf(await get(realApps.app, school.accessToken, 'draft'))?.score;
      expect(draftScore).toMatchObject({ initialTotal: expect.any(Number) as number });
      await confirm(realApps.app, school.accessToken, first);

      const official = scheduleOf(await get(realApps.app, school.accessToken, 'official'));
      expect(official?.score).toEqual(draftScore);

      const second = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, second);
      const replaced = scheduleOf(await get(realApps.app, school.accessToken, first));
      expect(replaced?.score).toEqual(draftScore);
      const previous = (
        (await get(realApps.app, school.accessToken, 'previous')).body as {
          data: { schedules: { id: string; score: unknown }[] };
        }
      ).data.schedules;
      expect(previous).toEqual([expect.objectContaining({ id: first, score: draftScore })]);
      const overview = (
        (await get(realApps.app, school.accessToken, 'overview')).body as {
          data: { official: { score: unknown } };
        }
      ).data;
      expect(overview.official.score).toMatchObject({ total: expect.any(Number) as number });
    });

    it('generating again leaves the official as it is, and the new draft next to it', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const first = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, first);

      const second = await generateDraft(realApps, school.accessToken);

      const overview = overviewOf(await get(realApps.app, school.accessToken, 'overview'));
      expect(overview.official?.id).toBe(first);
      expect(overview.draft?.id).toBe(second);
    });

    it('answers 409 SCHEDULE_NOT_DRAFT when it was already confirmed', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const draftId = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, draftId);

      const again = await confirm(realApps.app, school.accessToken, draftId);

      expect(again.status).toBe(409);
      expect((again.body as { error: { code: string } }).error.code).toBe('SCHEDULE_NOT_DRAFT');
    });

    it('answers 404 when a newer generation replaced the draft that was being seen', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const seen = await generateDraft(realApps, school.accessToken);
      await generateDraft(realApps, school.accessToken);

      const response = await confirm(realApps.app, school.accessToken, seen);

      expect(response.status).toBe(404);
      expect((response.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    });

    it('lets only one of two simultaneous confirmations win', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const draftId = await generateDraft(realApps, school.accessToken);

      const responses = await Promise.all([
        confirm(realApps.app, school.accessToken, draftId),
        confirm(realApps.app, school.accessToken, draftId),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      await expect(
        testPrisma.schedule.count({ where: { status: 'OFFICIAL', replacedAt: null } }),
      ).resolves.toBe(1);
    });

    it('answers 404 to an id that is not a UUID', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');

      const response = await confirm(realApps.app, school.accessToken, 'not-a-uuid');

      expect(response.status).toBe(404);
    });
  });

  describe('discarding', () => {
    it('deletes the draft and leaves the official, and the generation without schedule', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const first = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, first);
      const second = await generateDraft(realApps, school.accessToken);

      const response = await discard(realApps.app, school.accessToken, second);

      expect(response.status).toBe(204);
      expect(response.headers['cache-control']).toBe('no-store');
      const overview = overviewOf(await get(realApps.app, school.accessToken, 'overview'));
      expect(overview).toMatchObject({ draft: null, official: { id: first } });
      await expect(testPrisma.scheduleEntry.count({ where: { scheduleId: second } })).resolves.toBe(
        0,
      );
      const current = await request(realApps.app)
        .get('/api/schedule/generate')
        .set(authorized(school.accessToken));
      expect(
        (current.body as { data: { generation: { scheduleId: string | null } } }).data.generation
          .scheduleId,
      ).toBeNull();
    });

    it('never deletes an official one', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const draftId = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, draftId);

      const response = await discard(realApps.app, school.accessToken, draftId);

      expect(response.status).toBe(409);
      expect((response.body as { error: { code: string } }).error.code).toBe('SCHEDULE_NOT_DRAFT');
      await expect(testPrisma.schedule.count()).resolves.toBe(1);
    });
  });

  describe('permissions and isolation', () => {
    it('lets a member read the official and the overview, but not confirm nor discard', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const draftId = await generateDraft(realApps, school.accessToken);
      const member = await memberOf(realApps, school.schoolId);

      expect((await confirm(realApps.app, member, draftId)).status).toBe(403);
      expect((await discard(realApps.app, member, draftId)).status).toBe(403);
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: draftId } }),
      ).resolves.toMatchObject({ status: 'DRAFT' });

      await confirm(realApps.app, school.accessToken, draftId);
      expect((await get(realApps.app, member, 'overview')).status).toBe(200);
      expect(scheduleOf(await get(realApps.app, member, 'official'))).toMatchObject({
        id: draftId,
      });
    });

    it('answers 401 without a session', async () => {
      const realApps = realApp();

      for (const call of [
        request(realApps.app).get('/api/schedule/official'),
        request(realApps.app).get('/api/schedule/overview'),
        request(realApps.app).post('/api/schedule/0192f5a0-0000-7000-8000-0000000000a2/confirm'),
        request(realApps.app).delete('/api/schedule/0192f5a0-0000-7000-8000-0000000000a2'),
      ]) {
        expect((await call).status).toBe(401);
      }
    });

    it('never confirms, discards nor shows the schedules of another school', async () => {
      const realApps = realApp();
      const one = await readySchool(realApps, 'Colegio Uno');
      const draftId = await generateDraft(realApps, one.accessToken);
      const two = await adminOf(realApps.app, 'Colegio Dos', 'colegio.dos@example.com');

      expect((await confirm(realApps.app, two.accessToken, draftId)).status).toBe(404);
      expect((await discard(realApps.app, two.accessToken, draftId)).status).toBe(404);
      expect(overviewOf(await get(realApps.app, two.accessToken, 'overview'))).toEqual({
        draft: null,
        official: null,
        previousCount: 0,
      });
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: draftId } }),
      ).resolves.toMatchObject({ status: 'DRAFT' });

      await confirm(realApps.app, one.accessToken, draftId);
      expect(scheduleOf(await get(realApps.app, two.accessToken, 'official'))).toBeNull();
    });
  });

  describe('the log', () => {
    it('writes the confirmation and the discard with ids and no names', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');
      const first = await generateDraft(realApps, school.accessToken);
      await confirm(realApps.app, school.accessToken, first);
      const second = await generateDraft(realApps, school.accessToken);
      await discard(realApps.app, school.accessToken, second);

      const log = realApps.logOutput();

      expect(log).toContain('SCHEDULE_CONFIRMED');
      expect(log).toContain('SCHEDULE_DRAFT_DISCARDED');
      expect(log).not.toMatch(/Colegio Uno|José María|García-López|Lengua|1º Primaria/u);
    });
  });
});
