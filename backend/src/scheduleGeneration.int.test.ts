import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
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

interface GenerationBody {
  id: string;
  status: string;
  progress: number;
  placed: number;
  total: number;
  improve: boolean;
  phase: string;
  score: ScoreBody | null;
  improvementCancelled: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  scheduleId: string | null;
}

interface ScoreBody {
  total: number;
  preferredMisses: number;
  preferredTotal: number;
  professorGaps: number;
  consecutiveDays: number;
  initialTotal: number;
}

const generationOf = (response: request.Response) =>
  (response.body as { data: { generation: GenerationBody | null } }).data.generation;

const start = (app: App, accessToken: string, body?: object) => {
  const call = request(app).post('/api/schedule/generate').set(authorized(accessToken));
  return body === undefined ? call : call.send(body);
};
const draftOf = (app: App, accessToken: string) =>
  request(app).get('/api/schedule/draft').set(authorized(accessToken));
const scheduleScoreOf = (response: request.Response) =>
  (response.body as { data: { schedule: { score: ScoreBody | null } | null } }).data.schedule
    ?.score;
const current = (app: App, accessToken: string) =>
  request(app).get('/api/schedule/generate').set(authorized(accessToken));
const byId = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/schedule/generate/${id}`).set(authorized(accessToken));
const cancel = (app: App, accessToken: string, id: string) =>
  request(app).delete(`/api/schedule/generate/${id}`).set(authorized(accessToken));

/** Espera a que la generación termine (el lanzador en memoria la ejecuta en el mismo proceso). */
async function untilFinished(app: App, accessToken: string, id: string): Promise<GenerationBody> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const generation = generationOf(await byId(app, accessToken, id));
    if (generation !== null && !['QUEUED', 'RUNNING'].includes(generation.status)) {
      return generation;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('La generación no terminó a tiempo');
}

/**
 * Un colegio listo para generar: 1º Primaria («Corto», 15 franjas, clase A) con Lengua (5 sesiones) para Ana. Los
 * datos se crean por la API.
 */
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

/** Inserta una generación directamente, con el estado y las fechas que pida el test. */
async function seedGeneration(
  schoolId: string,
  createdById: string,
  overrides: Record<string, unknown> = {},
) {
  return testPrisma.scheduleGeneration.create({
    data: { id: crypto.randomUUID(), schoolId, createdById, ...overrides },
  });
}

/** Franjas preferidas de la asignatura en el curso: la última sesión de lunes, miércoles y viernes. */
async function preferLastSessions(
  app: App,
  accessToken: string,
  courseId: string,
  subjectId: string,
) {
  const response = await request(app)
    .put(`/api/courses/${courseId}/subjects/${subjectId}/preferred-slots`)
    .set(authorized(accessToken))
    .send({
      slots: [
        { dayOfWeek: 1, sessionNumber: 3 },
        { dayOfWeek: 3, sessionNumber: 3 },
        { dayOfWeek: 5, sessionNumber: 3 },
      ],
    });
  expect(response.status).toBe(200);
}

describe('schedule generation', () => {
  describe('improving with the preferences (US-ALGO-RUN_b)', () => {
    it('improves by default and saves the same score in the generation and in the draft', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Uno');
      await preferLastSessions(realApps.app, school.accessToken, school.course.id, school.language);

      const started = await start(realApps.app, school.accessToken);

      expect(started.status).toBe(202);
      expect(generationOf(started)).toMatchObject({
        improve: true,
        phase: 'SEARCHING',
        score: null,
        improvementCancelled: false,
      });
      const finished = await untilFinished(
        realApps.app,
        school.accessToken,
        generationOf(started)?.id ?? '',
      );
      expect(finished).toMatchObject({
        status: 'COMPLETED',
        improve: true,
        improvementCancelled: false,
      });
      const score = finished.score;
      expect(score).not.toBeNull();
      // Lengua se coloca primero en la 1.ª sesión de los cinco días (5 fallos y 4 pares de días seguidos = 54).
      expect(score?.initialTotal).toBe(54);
      expect(score?.preferredTotal).toBe(5);
      expect(score?.total).toBeLessThan(score?.initialTotal ?? 0);
      expect(scheduleScoreOf(await draftOf(realApps.app, school.accessToken))).toEqual(score);
    });

    it('does not improve when asked not to: the score is the one of the first schedule', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Dos');
      await preferLastSessions(realApps.app, school.accessToken, school.course.id, school.language);

      const started = await start(realApps.app, school.accessToken, { improve: false });

      expect(generationOf(started)).toMatchObject({ improve: false });
      const finished = await untilFinished(
        realApps.app,
        school.accessToken,
        generationOf(started)?.id ?? '',
      );
      expect(finished).toMatchObject({ status: 'COMPLETED', improve: false });
      expect(finished.score).toMatchObject({ total: 54, initialTotal: 54 });
      expect(scheduleScoreOf(await draftOf(realApps.app, school.accessToken))).toEqual(
        finished.score,
      );
    });

    it('improves with an empty body or with improve true', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Tres');

      const started = await start(realApps.app, school.accessToken, { improve: true });

      expect(started.status).toBe(202);
      expect(generationOf(started)).toMatchObject({ improve: true });
      await untilFinished(realApps.app, school.accessToken, generationOf(started)?.id ?? '');
    });

    it.each([
      ['an improve that is not a boolean', { improve: 'si' }, 'improve'],
      ['an unknown field', { other: true }, 'other'],
    ])('answers 400 VALIDATION_ERROR to %s and creates nothing', async (_name, body, field) => {
      const realApps = realApp();
      const school = await readySchool(realApps, `Colegio Invalido ${field}`);

      const response = await start(realApps.app, school.accessToken, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: { code: 'VALIDATION_ERROR', details: [{ field }] },
      });
      await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(0);
    });

    it('answers 403 to a member even with an invalid body, and creates nothing', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Cuatro');
      const member = await memberOf(realApps, school.schoolId);

      const response = await start(realApps.app, member, { improve: 'si' });

      expect(response.status).toBe(403);
      await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(0);
    });

    it('registers whether it improves, and the score, without any name', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Cinco');
      await preferLastSessions(realApps.app, school.accessToken, school.course.id, school.language);

      const started = generationOf(await start(realApps.app, school.accessToken));
      await untilFinished(realApps.app, school.accessToken, started?.id ?? '');

      const output = realApps.logOutput();
      expect(output).toMatch(/"improve":true/);
      expect(output).toMatch(/"score_total":\d+/);
      expect(output).toMatch(/"improvement_stopped_by":"CONVERGED"/);
      expect(output).not.toMatch(/Lengua|García|Ana|Primaria|Preferencias Cinco/);
    });

    it('tells that the improvement was cancelled in a generation completed after a cancel request', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Seis');
      const cancelled = await seedGeneration(school.schoolId, school.userId, {
        status: 'COMPLETED',
        improve: true,
        cancelRequested: true,
        finishedAt: new Date(),
      });
      const notImproved = await seedGeneration(school.schoolId, school.userId, {
        status: 'COMPLETED',
        improve: false,
        cancelRequested: true,
        finishedAt: new Date(),
      });

      await expect(
        byId(realApps.app, school.accessToken, cancelled.id).then(generationOf),
      ).resolves.toMatchObject({ improvementCancelled: true });
      await expect(
        byId(realApps.app, school.accessToken, notImproved.id).then(generationOf),
      ).resolves.toMatchObject({ improvementCancelled: false });
    });

    it('never exposes the cancel mark', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Preferencias Siete');
      const running = await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        cancelRequested: true,
        heartbeatAt: new Date(),
      });

      const response = await byId(realApps.app, school.accessToken, running.id);

      expect(generationOf(response)).not.toHaveProperty('cancelRequested');
    });
  });

  describe('generating', () => {
    it('answers 202 and ends COMPLETED with a draft that has one entry per session', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Uno');

      const started = await start(realApps.app, school.accessToken);

      expect(started.status).toBe(202);
      expect(generationOf(started)).toMatchObject({ status: 'QUEUED', progress: 0 });
      const finished = await untilFinished(
        realApps.app,
        school.accessToken,
        generationOf(started)?.id ?? '',
      );
      expect(finished).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        placed: 5,
        total: 5,
        errorCode: null,
      });
      const schedule = await testPrisma.schedule.findUniqueOrThrow({
        where: { id: finished.scheduleId ?? '' },
      });
      expect(schedule).toMatchObject({
        schoolId: school.schoolId,
        status: 'DRAFT',
        engine: 'BACKTRACKING',
        placedSessions: 5,
        createdById: school.userId,
      });
      const entries = await testPrisma.scheduleEntry.findMany({
        where: { scheduleId: schedule.id },
      });
      expect(entries).toHaveLength(5);
      expect(entries.every((entry) => entry.professorId === school.ana)).toBe(true);
      expect(entries.every((entry) => entry.classId === school.course.classes.A)).toBe(true);
    });

    it('leaves the free slots without an entry', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Dos');

      const started = await start(realApps.app, school.accessToken);
      await untilFinished(realApps.app, school.accessToken, generationOf(started)?.id ?? '');

      // 15 franjas a la semana y 5 sesiones de carga: 10 huecos libres.
      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(5);
    });

    it('replaces the previous draft in the next generation, and only one remains', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Tres');
      const first = generationOf(await start(realApps.app, school.accessToken));
      const firstFinished = await untilFinished(realApps.app, school.accessToken, first?.id ?? '');

      const second = generationOf(await start(realApps.app, school.accessToken));
      const secondFinished = await untilFinished(
        realApps.app,
        school.accessToken,
        second?.id ?? '',
      );

      expect(secondFinished.scheduleId).not.toBe(firstFinished.scheduleId);
      await expect(testPrisma.schedule.findMany({ select: { id: true } })).resolves.toEqual([
        { id: secondFinished.scheduleId },
      ]);
      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(5);
    });

    it('registers the events with identifiers and without any name', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Cuatro');

      const started = generationOf(await start(realApps.app, school.accessToken));
      await untilFinished(realApps.app, school.accessToken, started?.id ?? '');

      const output = realApps.logOutput();
      expect(output).toContain('SCHEDULE_GENERATION_STARTED');
      expect(output).toContain('SCHEDULE_GENERATION_COMPLETED');
      expect(output).toContain(started?.id ?? 'sin-id');
      expect(output).not.toMatch(/Lengua|García|Ana|Primaria|Colegio Cuatro/);
    });

    it('answers 409 SCHEDULE_NOT_READY with blockers, and creates nothing', async () => {
      const realApps = realApp();
      const admin = await adminOf(realApps.app, 'Colegio Cinco', 'cinco@example.com');
      // Un curso con una asignatura y sin calendario: bloquea (`COURSE_WITHOUT_CALENDAR`).
      const course = await createCourse(realApps.app, admin.accessToken, '1º Primaria', ['A']);
      await createSubject(realApps.app, admin.accessToken, 'Lengua', course.id, 3);

      const response = await start(realApps.app, admin.accessToken);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'SCHEDULE_NOT_READY' } });
      await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(0);
    });

    it('answers 409 GENERATION_IN_PROGRESS while another one runs, and creates nothing', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Seis');
      await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        heartbeatAt: new Date(),
      });

      const response = await start(realApps.app, school.accessToken);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'GENERATION_IN_PROGRESS' } });
      await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(1);
    });

    it('lets only one of two simultaneous requests start', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Siete');
      // El worker en memoria termina en milisegundos: se retiene hasta que respondan las dos peticiones, para que la
      // primera siga en curso cuando llegue la segunda (si no, en una máquina lenta la segunda llegaría ya terminada).
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const execute = realApps.runGeneration.execute.bind(realApps.runGeneration);
      vi.spyOn(realApps.runGeneration, 'execute').mockImplementation(async (generationId) => {
        await gate;
        return execute(generationId);
      });

      const responses = await Promise.all([
        start(realApps.app, school.accessToken),
        start(realApps.app, school.accessToken),
      ]);
      release();

      expect(responses.map(({ status }) => status).sort()).toEqual([202, 409]);
      const winner = responses.find(({ status }) => status === 202);
      await untilFinished(realApps.app, school.accessToken, generationOf(winner!)?.id ?? '');
      await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(1);
    });

    it('lets generate again after a generation finished', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Ocho');
      const first = generationOf(await start(realApps.app, school.accessToken));
      await untilFinished(realApps.app, school.accessToken, first?.id ?? '');

      const again = await start(realApps.app, school.accessToken);

      expect(again.status).toBe(202);
      await untilFinished(realApps.app, school.accessToken, generationOf(again)?.id ?? '');
    });
  });

  describe('reading', () => {
    it('answers null when the school never generated', async () => {
      const realApps = realApp();
      const admin = await adminOf(realApps.app, 'Colegio Nueve', 'nueve@example.com');

      const response = await current(realApps.app, admin.accessToken);

      expect(response.status).toBe(200);
      expect(generationOf(response)).toBeNull();
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('resumes a generation in progress, for any user of the school', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Diez');
      const member = await memberOf(realApps, school.schoolId);
      const running = await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        placed: 126,
        total: 300,
        heartbeatAt: new Date(),
      });

      const response = await current(realApps.app, member);

      expect(generationOf(response)).toMatchObject({
        id: running.id,
        status: 'RUNNING',
        progress: 42,
      });
    });

    it('marks a stuck generation as interrupted when someone asks, and lets generate again', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Once');
      const longAgo = new Date(Date.now() - 5 * 60 * 1000);
      const stuck = await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        createdAt: longAgo,
        startedAt: longAgo,
        heartbeatAt: longAgo,
      });

      const response = await byId(realApps.app, school.accessToken, stuck.id);

      expect(generationOf(response)).toMatchObject({
        status: 'FAILED',
        errorCode: 'INTERNAL',
        errorMessage: 'La generación se interrumpió',
      });
      const again = await start(realApps.app, school.accessToken);
      expect(again.status).toBe(202);
      await untilFinished(realApps.app, school.accessToken, generationOf(again)?.id ?? '');
    });

    it('does not mark a generation with a recent heartbeat', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Doce');
      const alive = await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        heartbeatAt: new Date(Date.now() - 10_000),
      });

      const response = await byId(realApps.app, school.accessToken, alive.id);

      expect(generationOf(response)).toMatchObject({ status: 'RUNNING' });
    });

    it('answers 404 for a generation of another school and for an id that is not a UUID', async () => {
      const realApps = realApp();
      const mine = await readySchool(realApps, 'Colegio Trece');
      const other = await readySchool(realApps, 'Colegio Catorce');
      const foreign = await seedGeneration(other.schoolId, other.userId, { status: 'COMPLETED' });

      const foreignResponse = await byId(realApps.app, mine.accessToken, foreign.id);
      const invalidResponse = await byId(realApps.app, mine.accessToken, 'not-a-uuid');

      expect(foreignResponse.status).toBe(404);
      expect(invalidResponse.status).toBe(404);
      expect(foreignResponse.body).toEqual(invalidResponse.body);
    });
  });

  describe('cancelling', () => {
    it('cancels a queued generation right away, and the worker does not claim it afterwards', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Quince');
      const queued = await seedGeneration(school.schoolId, school.userId);

      const response = await cancel(realApps.app, school.accessToken, queued.id);

      expect(response.status).toBe(200);
      expect(generationOf(response)).toMatchObject({ status: 'CANCELLED' });
      await realApps.runGeneration.execute(queued.id);
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: queued.id } }),
      ).resolves.toMatchObject({ status: 'CANCELLED', startedAt: null });
      await expect(testPrisma.schedule.count()).resolves.toBe(0);
    });

    it('marks the request of a running generation, which the worker will see', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Dieciseis');
      const running = await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        heartbeatAt: new Date(),
      });

      const response = await cancel(realApps.app, school.accessToken, running.id);

      expect(response.status).toBe(200);
      expect(generationOf(response)).toMatchObject({ status: 'RUNNING' });
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: running.id } }),
      ).resolves.toMatchObject({ cancelRequested: true });
    });

    it('lets generate again after cancelling', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Diecisiete');
      const queued = await seedGeneration(school.schoolId, school.userId);
      await cancel(realApps.app, school.accessToken, queued.id);

      const again = await start(realApps.app, school.accessToken);

      expect(again.status).toBe(202);
      await untilFinished(realApps.app, school.accessToken, generationOf(again)?.id ?? '');
    });

    it('answers 409 GENERATION_NOT_CANCELLABLE once it finished, and changes nothing', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Dieciocho');
      const done = await seedGeneration(school.schoolId, school.userId, { status: 'COMPLETED' });

      const response = await cancel(realApps.app, school.accessToken, done.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'GENERATION_NOT_CANCELLABLE' } });
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: done.id } }),
      ).resolves.toMatchObject({ status: 'COMPLETED', cancelRequested: false });
    });

    it('answers 404 for a generation of another school, and does not change it', async () => {
      const realApps = realApp();
      const mine = await readySchool(realApps, 'Colegio Diecinueve');
      const other = await readySchool(realApps, 'Colegio Veinte');
      const foreign = await seedGeneration(other.schoolId, other.userId);

      const response = await cancel(realApps.app, mine.accessToken, foreign.id);

      expect(response.status).toBe(404);
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: foreign.id } }),
      ).resolves.toMatchObject({ status: 'QUEUED', cancelRequested: false });
    });
  });

  describe('roles', () => {
    it('lets a member read but not start nor cancel, and changes nothing', async () => {
      const realApps = realApp();
      const school = await readySchool(realApps, 'Colegio Veintiuno');
      const member = await memberOf(realApps, school.schoolId);
      const running = await seedGeneration(school.schoolId, school.userId, {
        status: 'RUNNING',
        heartbeatAt: new Date(),
      });

      const started = await start(realApps.app, member);
      const cancelled = await cancel(realApps.app, member, running.id);
      const read = await byId(realApps.app, member, running.id);

      expect(started.status).toBe(403);
      expect(cancelled.status).toBe(403);
      expect(read.status).toBe(200);
      await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(1);
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: running.id } }),
      ).resolves.toMatchObject({ cancelRequested: false });
    });

    it('answers 401 without a session', async () => {
      const realApps = realApp();

      const responses = await Promise.all([
        request(realApps.app).post('/api/schedule/generate'),
        request(realApps.app).get('/api/schedule/generate'),
        request(realApps.app).delete(`/api/schedule/generate/${crypto.randomUUID()}`),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([401, 401, 401]);
    });
  });
});
