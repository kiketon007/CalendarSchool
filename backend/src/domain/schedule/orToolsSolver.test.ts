import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../../../test-fixtures/schedule-generation.json' with { type: 'json' };
import {
  problemOf,
  professor,
  subject,
  type FixtureCalendars,
  type FixtureCourse,
  type FixtureProfessor,
} from '../../../test/support/scheduleProblemFixtures.js';
import { BacktrackingSolver } from './backtrackingSolver.js';
import { generationInputOf } from './generationInput.js';
import { OrToolsSolver, type OrToolsLogger } from './orToolsSolver.js';
import type { OrToolsRequest, OrToolsTransport } from './orToolsTransport.js';
import type { GenerationInput, ScheduleSolver, SolveOutcome } from './scheduleSolver.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);
const table = fixtures as unknown as {
  calendars: FixtureCalendars;
  cases: { name: string; courses: FixtureCourse[]; professors: FixtureProfessor[] }[];
};

const inputOf = (courses: FixtureCourse[], professors: FixtureProfessor[]): GenerationInput =>
  generationInputOf(problemOf(table.calendars, courses, professors), compareNames);

/** Una lección de 3 sesiones sueltas: la mejora puede separar los días seguidos. */
const threeSessions = inputOf(
  [
    {
      name: '1º',
      calendar: 'Corto',
      classes: ['A'],
      subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' })],
    },
  ],
  [professor('Ana Ruiz')],
);
const solvedResponse = (cells: [number, number][]) => ({
  version: 1,
  status: 'solved',
  placements: cells.map(([dayOfWeek, firstSession], unitIndex) => ({
    unitIndex,
    dayOfWeek,
    firstSession,
  })),
});
/** Lunes, martes y miércoles a primera hora. */
const validResponse = solvedResponse([
  [1, 1],
  [2, 1],
  [3, 1],
]);

/** El caso de la tabla en que dos lecciones se disputan el único hueco del profesor. */
const impossible = (() => {
  const testCase = table.cases.find(({ name }) => name.startsWith('two lessons for the only free'));
  if (testCase === undefined) {
    throw new Error('falta el caso de la tabla');
  }
  return inputOf(testCase.courses, testCase.professors);
})();

const transportOf = (
  handler: (request: OrToolsRequest, signal: AbortSignal) => Promise<unknown>,
): OrToolsTransport => ({ solve: handler });
const answering = (response: unknown) => transportOf(() => Promise.resolve(response));

const loggerOf = () => ({
  warn: vi.fn<OrToolsLogger['warn']>(),
  error: vi.fn<OrToolsLogger['error']>(),
});

const solverOf = (
  transport: OrToolsTransport,
  fallback: ScheduleSolver = new BacktrackingSolver(),
) => {
  const logger = loggerOf();
  return { solver: new OrToolsSolver({ transport, fallback, logger }), logger };
};
const logContext = { generation_id: 'generation-1' };

afterEach(() => {
  vi.useRealTimers();
});

describe('OrToolsSolver', () => {
  describe('the search time', () => {
    it('gives OR-Tools at most 60 seconds, or what is left of the limit', async () => {
      const seen: number[] = [];
      const { solver } = solverOf(
        transportOf((request) => {
          seen.push(request.limitSeconds);
          return Promise.resolve(validResponse);
        }),
      );

      await solver.solve(threeSessions);
      await solver.solve(threeSessions, { limitMs: 30_000 });

      expect(seen).toEqual([60, 30]);
    });
  });

  describe('a valid schedule', () => {
    it('does not say that the engine changes when OR-Tools solves', async () => {
      const { solver } = solverOf(answering(validResponse));
      const onEngine = vi.fn();

      await solver.solve(threeSessions, { onEngine });

      expect(onEngine).not.toHaveBeenCalled();
    });

    it('improves it, says the engine and reports the progress once, with the total', async () => {
      const { solver } = solverOf(answering(validResponse));
      const phases: string[] = [];
      const progress: [number, number][] = [];

      const outcome = await solver.solve(threeSessions, {
        onPhase: (phase) => phases.push(phase),
        onProgress: (placed, total) => progress.push([placed, total]),
      });

      expect(outcome).toMatchObject({ status: 'solved', engine: 'ORTOOLS' });
      if (outcome.status === 'solved') {
        expect(outcome.score.total).toBeLessThan(outcome.score.initialTotal);
        expect(outcome.improvement.stoppedBy).not.toBe('SKIPPED');
      }
      expect(phases).toEqual(['IMPROVING']);
      expect(progress).toEqual([[3, 3]]);
    });

    it('does not improve with improve false', async () => {
      const { solver } = solverOf(answering(validResponse));

      const outcome = await solver.solve(threeSessions, { improve: false });

      expect(outcome).toMatchObject({
        status: 'solved',
        engine: 'ORTOOLS',
        improvement: { stoppedBy: 'SKIPPED' },
      });
    });
  });

  describe('the wait', () => {
    it('asks for the cancellation every 500 ms while OR-Tools searches', async () => {
      vi.useFakeTimers();
      const { solver } = solverOf(
        transportOf(
          () => new Promise((resolve) => setTimeout(() => resolve(validResponse), 2_000)),
        ),
      );
      const isCancelled = vi.fn(() => false);

      const pending = solver.solve(threeSessions, { isCancelled, improve: false });
      await vi.advanceTimersByTimeAsync(2_100);
      await pending;

      expect(isCancelled.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('is cancelled in at most 500 ms and aborts the transport', async () => {
      vi.useFakeTimers();
      const start = Date.now();
      let signal: AbortSignal | undefined;
      const { solver } = solverOf(
        transportOf((_request, abort) => {
          signal = abort;
          return new Promise(() => undefined);
        }),
      );
      // Pide cancelar a los 1200 ms: la pregunta de los 1500 ms es la primera que lo ve.
      let lastAsked = 0;
      const isCancelled = () => {
        lastAsked = Date.now() - start;
        return lastAsked >= 1_200;
      };

      const pending = solver.solve(threeSessions, { isCancelled });
      await vi.advanceTimersByTimeAsync(2_000);
      const outcome = await pending;

      expect(outcome).toEqual({ status: 'cancelled' });
      expect(signal?.aborted).toBe(true);
      expect(lastAsked).toBe(1_500);
    });

    it('stops asking when the answer arrives', async () => {
      vi.useFakeTimers();
      const { solver } = solverOf(answering(validResponse));
      const isCancelled = vi.fn(() => false);

      await solver.solve(threeSessions, { isCancelled, improve: false });
      const calls = isCancelled.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);

      expect(isCancelled.mock.calls.length).toBe(calls);
    });
  });

  describe('what OR-Tools says without a schedule', () => {
    it.each([
      ['cancelled', { version: 1, status: 'cancelled' }, { status: 'cancelled' }],
      ['timeout', { version: 1, status: 'timeout' }, { status: 'timeout', placed: 0, total: 3 }],
    ])('ends in %s with no alternative', async (_name, response, expected) => {
      const solve = vi.fn<ScheduleSolver['solve']>();
      const fallback: ScheduleSolver = { solve };
      const { solver, logger } = solverOf(answering(response), fallback);

      const outcome = await solver.solve(threeSessions);

      expect(outcome).toEqual(expected);
      expect(solve).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('the alternative', () => {
    const rows: [string, OrToolsTransport][] = [
      ['invoke_error', transportOf(() => Promise.reject(new Error('el proceso falló')))],
      ['bad_response', answering({ status: 'ok' })],
      [
        'invalid_schedule',
        answering(
          solvedResponse([
            [1, 1],
            [1, 1],
            [2, 1],
          ]),
        ),
      ],
    ];

    it.each(rows)('goes to BACKTRACKING with %s and logs the reason', async (reason, transport) => {
      const { solver, logger } = solverOf(transport);

      const outcome = await solver.solve(threeSessions, { logContext });

      expect(outcome).toMatchObject({ status: 'solved', engine: 'BACKTRACKING' });
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ortools_fallback',
          reason,
          generation_id: 'generation-1',
          elapsed_ms: expect.any(Number),
        }),
        expect.any(String),
      );
    });

    it('does not put names nor the error text in the log', async () => {
      const { solver, logger } = solverOf(
        transportOf(() => Promise.reject(new Error('Ana Ruiz no cabe'))),
      );

      await solver.solve(threeSessions, { logContext });

      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('Ana Ruiz');
    });

    it.each(rows)(
      'says that it passes to BACKTRACKING with %s, once and before the current engine reports',
      async (_reason, transport) => {
        const events: string[] = [];
        const { solver } = solverOf(transport);

        await solver.solve(threeSessions, {
          onEngine: (engine) => events.push(`engine:${engine}`),
          onProgress: () => events.push('progress'),
        });

        expect(events[0]).toBe('engine:BACKTRACKING');
        expect(events.filter((event) => event.startsWith('engine:'))).toHaveLength(1);
      },
    );

    it('does not try the alternative when the cancellation arrives while it fails', async () => {
      vi.useFakeTimers();
      const solve = vi.fn<ScheduleSolver['solve']>();
      const fallback: ScheduleSolver = { solve };
      const { solver } = solverOf(
        transportOf((_request, signal) => {
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('abortado')));
          });
        }),
        fallback,
      );

      const pending = solver.solve(threeSessions, { isCancelled: () => true });
      await vi.advanceTimersByTimeAsync(600);

      await expect(pending).resolves.toEqual({ status: 'cancelled' });
      expect(solve).not.toHaveBeenCalled();
    });
  });

  describe('when OR-Tools says there is no solution', () => {
    const infeasible = { version: 1, status: 'infeasible' };

    it('says that it passes to BACKTRACKING to find the cause', async () => {
      const { solver } = solverOf(answering(infeasible));
      const onEngine = vi.fn();

      await solver.solve(impossible, { onEngine });

      expect(onEngine).toHaveBeenCalledTimes(1);
      expect(onEngine).toHaveBeenCalledWith('BACKTRACKING');
    });

    it('takes the cause from the current engine', async () => {
      const { solver } = solverOf(answering(infeasible));

      const outcome = await solver.solve(impossible);

      expect(outcome).toMatchObject({ status: 'infeasible', cause: { reason: 'PROFESSOR_BUSY' } });
    });

    it('ends in timeout and logs it when there is no time left to find the cause', async () => {
      let clock = 0;
      const { solver, logger } = solverOf(
        transportOf(() => {
          clock = 130_000;
          return Promise.resolve(infeasible);
        }),
      );

      const outcome = await solver.solve(impossible, { now: () => clock, logContext });

      expect(outcome).toMatchObject({ status: 'timeout' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ortools_infeasible_undiagnosed',
          generation_id: 'generation-1',
        }),
        expect.any(String),
      );
    });

    it('uses the schedule of the current engine, and logs an error, when they contradict each other', async () => {
      const { solver, logger } = solverOf(answering(infeasible));

      const outcome: SolveOutcome = await solver.solve(threeSessions, { logContext });

      expect(outcome).toMatchObject({ status: 'solved', engine: 'BACKTRACKING' });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ortools_infeasible_contradicted',
          generation_id: 'generation-1',
        }),
        expect.any(String),
      );
    });
  });
});
