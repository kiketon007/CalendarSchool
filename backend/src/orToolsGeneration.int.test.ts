import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { orToolsAvailable } from '../test/support/orToolsPython.js';
import { orToolsPython, ORTOOLS_SCRIPT } from '../test/support/orToolsPython.js';
import { realApp } from '../test/support/realApp.js';
import {
  adminOf,
  assign,
  authorized,
  createCalendar,
  createCourse,
  createProfessor,
  createSubject,
  type App,
} from '../test/support/scheduleApi.js';
import { testPrisma } from '../test/support/testPrisma.js';
import { BacktrackingSolver } from './domain/schedule/backtrackingSolver.js';
import { OrToolsSolver } from './domain/schedule/orToolsSolver.js';
import type { OrToolsTransport } from './domain/schedule/orToolsTransport.js';
import { ChildProcessOrToolsTransport } from './infrastructure/childProcessOrToolsTransport.js';

/** Un `OrToolsSolver` cuyo transporte tarda `delayMs` más de lo que tarde Python (o no responde nunca si es `null`). */
function slowSolver(delayMs: number | null) {
  const real = new ChildProcessOrToolsTransport({
    python: orToolsPython(),
    script: ORTOOLS_SCRIPT,
  });
  const pause = (ms: number | null, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('abortado', 'AbortError'));
      };
      const timer =
        ms === null
          ? undefined
          : setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              resolve();
            }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  const transport: OrToolsTransport = {
    solve: async (body, signal) => {
      const answer = delayMs === null ? undefined : await real.solve(body, signal);
      await pause(delayMs, signal);
      return answer;
    },
  };
  return new OrToolsSolver({
    transport,
    fallback: new BacktrackingSolver(),
    logger: { warn: () => undefined, error: () => undefined },
  });
}

interface GenerationBody {
  id: string;
  status: string;
}
const generationOf = (response: request.Response) =>
  (response.body as { data: { generation: GenerationBody } }).data.generation;

const byId = (app: App, accessToken: string, id: string) =>
  request(app).get(`/api/schedule/generate/${id}`).set(authorized(accessToken));

async function until(check: () => Promise<boolean>, what: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Se esperaba: ${what}`);
}

/** Un colegio listo para generar: 1º Primaria con una clase, un calendario de 15 franjas y Lengua para Ana. */
async function readySchool(app: App, name: string) {
  const admin = await adminOf(app, name, `${name.toLowerCase().replaceAll(' ', '.')}@example.com`);
  const calendar = await createCalendar(app, admin.accessToken, 'Corto');
  const course = await createCourse(app, admin.accessToken, '1º Primaria', ['A'], calendar);
  const language = await createSubject(app, admin.accessToken, 'Lengua', course.id, 5);
  const ana = await createProfessor(app, admin.accessToken, 'Ana', 'García');
  await assign(app, admin.accessToken, course.id, [
    { subjectId: language, classId: course.classes.A ?? '', professorId: ana },
  ]);
  return admin;
}

const start = (app: App, accessToken: string) =>
  request(app).post('/api/schedule/generate').set(authorized(accessToken)).send({});

const eventsOf = (log: string) =>
  log
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe.skipIf(!orToolsAvailable())(
  'generating with the OR-Tools engine (US-ALGO-ORTOOLS)',
  () => {
    it('saves a draft found by OR-Tools and says so in the engine and in the events', async () => {
      const apps = realApp({ scheduleEngine: 'ORTOOLS' });
      const school = await readySchool(apps.app, 'Colegio Motor Uno');

      const started = await start(apps.app, school.accessToken);

      expect(started.status).toBe(202);
      const id = generationOf(started).id;
      await until(
        async () =>
          generationOf(await byId(apps.app, school.accessToken, id)).status === 'COMPLETED',
        'la generación COMPLETED',
      );
      const schedule = await testPrisma.schedule.findFirstOrThrow({
        where: { schoolId: school.schoolId },
        include: { _count: { select: { entries: true } } },
      });
      expect(schedule).toMatchObject({ engine: 'ORTOOLS', status: 'DRAFT', placedSessions: 5 });
      expect(schedule._count.entries).toBe(5);
      const events = eventsOf(apps.logOutput());
      expect(events.find(({ event }) => event === 'SCHEDULE_GENERATION_STARTED')).toMatchObject({
        engine: 'ORTOOLS',
      });
      expect(events.find(({ event }) => event === 'SCHEDULE_GENERATION_COMPLETED')).toMatchObject({
        engine: 'ORTOOLS',
      });
      expect(events.filter(({ event }) => event === 'ortools_fallback')).toEqual([]);
    }, 60_000);

    it('keeps the heartbeat alive while OR-Tools searches', async () => {
      const apps = realApp({ scheduleSolver: slowSolver(2_600) });
      const school = await readySchool(apps.app, 'Colegio Motor Dos');

      const started = await start(apps.app, school.accessToken);

      const id = generationOf(started).id;
      const seen = new Set<number>();
      await until(async () => {
        const row = await testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id } });
        if (row.status === 'RUNNING' && row.heartbeatAt !== null) {
          seen.add(row.heartbeatAt.getTime());
        }
        return row.status === 'COMPLETED';
      }, 'la generación COMPLETED');
      // Hay al menos dos latidos distintos mientras estaba RUNNING: el del inicio y uno escrito durante la espera.
      expect(seen.size).toBeGreaterThanOrEqual(2);
    }, 60_000);

    it('cancels while OR-Tools searches, without waiting for it', async () => {
      const apps = realApp({ scheduleSolver: slowSolver(null) });
      const school = await readySchool(apps.app, 'Colegio Motor Tres');
      const started = await start(apps.app, school.accessToken);
      const id = generationOf(started).id;
      await until(
        async () => generationOf(await byId(apps.app, school.accessToken, id)).status === 'RUNNING',
        'la generación RUNNING',
      );

      const cancelledAt = Date.now();
      const cancelled = await request(apps.app)
        .delete(`/api/schedule/generate/${id}`)
        .set(authorized(school.accessToken));

      expect(cancelled.status).toBe(200);
      await until(
        async () =>
          generationOf(await byId(apps.app, school.accessToken, id)).status === 'CANCELLED',
        'la generación CANCELLED',
        10_000,
      );
      // El latido se escribe cada 2 s y la espera pregunta cada 0,5 s: unos 2,5 s como mucho, nunca el límite de OR-Tools.
      expect(Date.now() - cancelledAt).toBeLessThan(6_000);
      await expect(
        testPrisma.schedule.count({ where: { schoolId: school.schoolId } }),
      ).resolves.toBe(0);
    }, 60_000);
  },
);
