import { describe, expect, it, vi } from 'vitest';
import type { Generation, GenerationPhase } from '../../domain/schedule/generation.js';
import type { ScheduleScore } from '../../domain/schedule/scheduleScore.js';
import type { ScheduleDraft } from '../../domain/schedule/scheduleRepository.js';
import type { SchedulingProblem } from '../../domain/schedule/schedulingProblem.js';
import type {
  GenerationInput,
  ImprovementReport,
  ScheduleEngine,
  ScheduleEntry,
  ScheduleSolver,
  SolveOptions,
  SolveOutcome,
} from '../../domain/schedule/scheduleSolver.js';
import {
  problemOf,
  professor,
  subject,
  type FixtureCourse,
} from '../../../test/support/scheduleProblemFixtures.js';
import { RunGeneration } from './runGeneration.js';

/** Un resultado `solved` con la puntuación y la mejora que no importan en el test. */
const solvedOf = (
  entries: readonly ScheduleEntry[],
  overrides: {
    score?: Partial<ScheduleScore>;
    improvement?: Partial<ImprovementReport>;
    engine?: ScheduleEngine;
  } = {},
): SolveOutcome => ({
  status: 'solved',
  engine: overrides.engine ?? 'BACKTRACKING',
  entries,
  score: {
    total: 0,
    preferredMisses: 0,
    preferredTotal: 0,
    professorGaps: 0,
    consecutiveDays: 0,
    initialTotal: 0,
    ...overrides.score,
  },
  improvement: { stoppedBy: 'SKIPPED', moves: 0, elapsedMs: 0, ...overrides.improvement },
});
const SCHOOL_ID = 'school-1';
const CREATOR_ID = 'user-1';
const GENERATION_ID = 'generation-1';
const START = new Date('2026-11-04T10:00:00.000Z');

const calendars = {
  Corto: {
    periods: [
      ['S', 540, 600],
      ['S', 600, 660],
      ['S', 660, 720],
    ],
  },
};
const readyCourse: FixtureCourse = {
  name: '1º Primaria',
  calendar: 'Corto',
  classes: ['A'],
  subjects: [subject('Lengua', 3, { A: 'Ana López' })],
};
const readyProblem = problemOf(calendars, [readyCourse], [professor('Ana López')]);
const blockedProblem = problemOf(
  calendars,
  [{ ...readyCourse, calendar: null }],
  [professor('Ana López')],
);

const solvedScore: ScheduleScore = {
  total: 12,
  preferredMisses: 1,
  preferredTotal: 3,
  professorGaps: 0,
  consecutiveDays: 2,
  initialTotal: 21,
};

const entries: ScheduleEntry[] = [1, 2, 3].map((dayOfWeek) => ({
  courseId: 'course-1º Primaria',
  classId: 'class-1º Primaria-A',
  subjectId: 'subject-Lengua',
  professorId: 'professor-Ana López',
  dayOfWeek,
  sessionNumber: 1,
  startMinute: 540,
  endMinute: 600,
}));

function claimed(): Generation {
  return {
    id: GENERATION_ID,
    schoolId: SCHOOL_ID,
    createdById: CREATOR_ID,
    status: 'RUNNING',
    placed: 0,
    total: 0,
    improve: true,
    phase: 'SEARCHING',
    score: null,
    cancelRequested: false,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    scheduleId: null,
    createdAt: START,
    startedAt: START,
    finishedAt: null,
  };
}

type SavedProgress = {
  placed: number;
  total: number;
  phase: GenerationPhase;
  score: ScheduleScore | null;
};

type SolveFunction = (input: GenerationInput, options: SolveOptions) => Promise<SolveOutcome>;

interface BuildOptions {
  claim?: Generation | null;
  problem?: SchedulingProblem;
  solve?: SolveFunction;
  saveProgress?: (
    id: string,
    progress: SavedProgress,
    now: Date,
  ) => Promise<{
    cancelRequested: boolean;
  }>;
  replaceDraft?: (draft: ScheduleDraft, now: Date) => Promise<void>;
  maxSeconds?: number;
}

function build(options: BuildOptions = {}) {
  let clock = START.getTime();
  const generationRepository = {
    claim: vi.fn((_id: string, _now: Date) =>
      Promise.resolve(options.claim === undefined ? claimed() : options.claim),
    ),
    saveProgress: vi.fn(
      options.saveProgress ??
        ((_id: string, _progress: SavedProgress, _now: Date) =>
          Promise.resolve({ cancelRequested: false })),
    ),
    finish: vi.fn((..._args: unknown[]) => Promise.resolve()),
  };
  const scheduleRepository = {
    replaceDraft: vi.fn(
      options.replaceDraft ?? ((_draft: ScheduleDraft, _now: Date) => Promise.resolve()),
    ),
  };
  const schedulingProblemRepository = {
    read: vi.fn((_schoolId: string) => Promise.resolve(options.problem ?? readyProblem)),
  };
  const solve = vi.fn(options.solve ?? (() => Promise.resolve(solvedOf(entries))));
  const solver: ScheduleSolver = { solve };
  const logger = { info: vi.fn(), warn: vi.fn() };
  let ids = 0;
  const useCase = new RunGeneration({
    generationRepository,
    scheduleRepository,
    schedulingProblemRepository,
    solver,
    idGenerator: { generate: () => `id-${++ids}` },
    logger,
    now: () => new Date(clock),
    maxSeconds: options.maxSeconds ?? 120,
  });
  return {
    useCase,
    generationRepository,
    scheduleRepository,
    schedulingProblemRepository,
    solve,
    logger,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
  };
}

/** Deja correr las promesas pendientes (el guardado de progreso no se espera). */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('RunGeneration', () => {
  describe('claiming', () => {
    it('claims the generation with the current time', async () => {
      const { useCase, generationRepository } = build();

      await useCase.execute(GENERATION_ID);

      expect(generationRepository.claim).toHaveBeenCalledWith(GENERATION_ID, START);
    });

    it('does nothing at all when it cannot claim it, so a Lambda retry never runs it twice', async () => {
      const {
        useCase,
        schedulingProblemRepository,
        solve,
        generationRepository,
        scheduleRepository,
      } = build({ claim: null });

      await useCase.execute(GENERATION_ID);

      expect(schedulingProblemRepository.read).not.toHaveBeenCalled();
      expect(solve).not.toHaveBeenCalled();
      expect(generationRepository.finish).not.toHaveBeenCalled();
      expect(scheduleRepository.replaceDraft).not.toHaveBeenCalled();
    });
  });

  describe('when the school is no longer ready', () => {
    it('finishes FAILED with NOT_READY, without running the engine nor saving anything', async () => {
      const { useCase, generationRepository, solve, scheduleRepository } = build({
        problem: blockedProblem,
      });

      await useCase.execute(GENERATION_ID);

      expect(solve).not.toHaveBeenCalled();
      expect(scheduleRepository.replaceDraft).not.toHaveBeenCalled();
      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        expect.objectContaining({
          status: 'FAILED',
          errorCode: 'NOT_READY',
          errorDetails: null,
          errorMessage: expect.any(String) as string,
        }),
        START,
      );
    });
  });

  describe('solving', () => {
    it('reads the problem of the school of the generation, never one given by the caller', async () => {
      const { useCase, schedulingProblemRepository } = build();

      await useCase.execute(GENERATION_ID);

      expect(schedulingProblemRepository.read).toHaveBeenCalledWith(SCHOOL_ID);
    });

    it('gives the engine the time limit, a clock, the cancellation signal and the progress', async () => {
      const { useCase, solve } = build({ maxSeconds: 30 });

      await useCase.execute(GENERATION_ID);

      const [input, options] = solve.mock.calls[0] as [GenerationInput, SolveOptions];
      expect(input.lessons).toHaveLength(1);
      expect(options.limitMs).toBe(30_000);
      expect(options.logContext).toEqual({ generation_id: GENERATION_ID });
      expect(options.now?.()).toBe(START.getTime());
      expect(options.isCancelled?.()).toBe(false);
      expect(options.onProgress).toBeTypeOf('function');
      expect(options.onPhase).toBeTypeOf('function');
      expect(options.onScore).toBeTypeOf('function');
    });

    it.each([true, false])('gives the engine the improve of the row (%s)', async (improve) => {
      const { useCase, solve } = build({ claim: { ...claimed(), improve } });

      await useCase.execute(GENERATION_ID);

      const [, options] = solve.mock.calls[0] as [GenerationInput, SolveOptions];
      expect(options.improve).toBe(improve);
    });

    it('stores the total of sessions to place before the search starts', async () => {
      const { useCase, generationRepository } = build();

      await useCase.execute(GENERATION_ID);

      expect(generationRepository.saveProgress).toHaveBeenCalledWith(
        GENERATION_ID,
        { placed: 0, total: 3, phase: 'SEARCHING', score: null },
        START,
      );
    });
  });

  describe('when a schedule is found', () => {
    it('saves the draft with one identified entry per session, for the school and the author of the generation', async () => {
      const { useCase, scheduleRepository } = build({
        solve: () => Promise.resolve(solvedOf(entries, { score: solvedScore })),
      });

      await useCase.execute(GENERATION_ID);

      expect(scheduleRepository.replaceDraft).toHaveBeenCalledTimes(1);
      expect(scheduleRepository.replaceDraft).toHaveBeenCalledWith(
        {
          id: expect.any(String) as string,
          schoolId: SCHOOL_ID,
          generationId: GENERATION_ID,
          createdById: CREATOR_ID,
          placedSessions: 3,
          total: 3,
          engine: 'BACKTRACKING',
          score: solvedScore,
          entries: entries.map((entry) => ({ ...entry, id: expect.any(String) as string })),
        },
        START,
      );
      const draft = scheduleRepository.replaceDraft.mock.calls[0]?.[0];
      const ids = [draft?.id, ...(draft?.entries.map((entry) => entry.id) ?? [])];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('does not finish the generation by itself: the draft transaction completes it', async () => {
      const { useCase, generationRepository } = build();

      await useCase.execute(GENERATION_ID);

      expect(generationRepository.finish).not.toHaveBeenCalled();
    });

    it('saves the draft with the engine that found the schedule', async () => {
      const { useCase, scheduleRepository } = build({
        solve: () => Promise.resolve(solvedOf(entries, { engine: 'ORTOOLS' })),
      });

      await useCase.execute(GENERATION_ID);

      expect(scheduleRepository.replaceDraft.mock.calls[0]?.[0].engine).toBe('ORTOOLS');
    });

    it('logs the engine that found the schedule in SCHEDULE_GENERATION_COMPLETED', async () => {
      const { useCase, logger } = build({
        solve: () => Promise.resolve(solvedOf(entries, { engine: 'ORTOOLS' })),
      });

      await useCase.execute(GENERATION_ID);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'SCHEDULE_GENERATION_COMPLETED', engine: 'ORTOOLS' }),
        expect.any(String),
      );
    });

    it('logs SCHEDULE_GENERATION_COMPLETED with the counts and the duration, and no names', async () => {
      const { useCase, logger, advance } = build({
        solve: () => {
          advance(7000);
          return Promise.resolve(
            solvedOf(entries, {
              score: solvedScore,
              improvement: { stoppedBy: 'CONVERGED', moves: 9, elapsedMs: 5000 },
            }),
          );
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'SCHEDULE_GENERATION_COMPLETED',
          school_id: SCHOOL_ID,
          actor_id: CREATOR_ID,
          generation_id: GENERATION_ID,
          placed: 3,
          total: 3,
          duration_ms: 7000,
          error_code: null,
          engine: 'BACKTRACKING',
          score_total: 12,
          initial_score_total: 21,
          improvement_stopped_by: 'CONVERGED',
          improvement_moves: 9,
          improvement_ms: 5000,
        },
        expect.any(String),
      );
      expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/Lengua|Ana|Primaria/);
    });

    it('finishes FAILED with INTERNAL, keeping the trace only in the log, when saving fails', async () => {
      const failure = new Error('connection reset at /secret/path');
      const { useCase, generationRepository, logger } = build({
        replaceDraft: () => Promise.reject(failure),
      });

      await useCase.execute(GENERATION_ID);

      const [, result] = generationRepository.finish.mock.calls[0] as [
        string,
        { errorMessage: string },
      ];
      expect(result).toMatchObject({ status: 'FAILED', errorCode: 'INTERNAL' });
      expect(result.errorMessage).not.toContain('secret');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'SCHEDULE_GENERATION_FAILED', err: failure }),
        expect.any(String),
      );
    });
  });

  describe('when there is no schedule', () => {
    const cause = {
      reason: 'PROFESSOR_BUSY' as const,
      course: { id: 'course-1', name: '1º Primaria' },
      schoolClass: { id: 'class-1', name: 'A' },
      subject: { id: 'subject-1', name: 'Inglés' },
      professor: { id: 'professor-1', name: 'Ana López' },
    };

    it('finishes FAILED with INFEASIBLE and the structured cause, keeping the previous draft', async () => {
      const { useCase, generationRepository, scheduleRepository } = build({
        solve: (_input, options) => {
          options.onProgress?.(2, 3);
          return Promise.resolve({ status: 'infeasible', cause });
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(scheduleRepository.replaceDraft).not.toHaveBeenCalled();
      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        {
          status: 'FAILED',
          placed: 2,
          total: 3,
          errorCode: 'INFEASIBLE',
          errorMessage: expect.stringContaining('orientativa') as string,
          errorDetails: {
            reason: 'PROFESSOR_BUSY',
            lesson: {
              course: { id: 'course-1', name: '1º Primaria' },
              class: { id: 'class-1', name: 'A' },
              subject: { id: 'subject-1', name: 'Inglés' },
              professor: { id: 'professor-1', name: 'Ana López' },
            },
          },
        },
        START,
      );
    });

    it('says the cause is exact when no cell is free', async () => {
      const { useCase, generationRepository } = build({
        solve: () =>
          Promise.resolve({
            status: 'infeasible',
            cause: { ...cause, reason: 'NO_FREE_CELLS' },
          }),
      });

      await useCase.execute(GENERATION_ID);

      const [, result] = generationRepository.finish.mock.calls[0] as [
        string,
        { errorMessage: string },
      ];
      expect(result.errorMessage).not.toContain('orientativa');
    });

    it('finishes FAILED with TIMEOUT, saying that a schedule may exist', async () => {
      const { useCase, generationRepository, scheduleRepository } = build({
        solve: () => Promise.resolve({ status: 'timeout', placed: 2, total: 3 }),
      });

      await useCase.execute(GENERATION_ID);

      expect(scheduleRepository.replaceDraft).not.toHaveBeenCalled();
      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        {
          status: 'FAILED',
          placed: 2,
          total: 3,
          errorCode: 'TIMEOUT',
          errorMessage: expect.stringContaining('puede existir') as string,
          errorDetails: null,
        },
        START,
      );
    });

    it('finishes CANCELLED without saving anything', async () => {
      const { useCase, generationRepository, scheduleRepository } = build({
        solve: () => Promise.resolve({ status: 'cancelled' }),
      });

      await useCase.execute(GENERATION_ID);

      expect(scheduleRepository.replaceDraft).not.toHaveBeenCalled();
      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        { status: 'CANCELLED', placed: 0, total: 3 },
        START,
      );
    });

    it('finishes FAILED with INTERNAL, with the trace only in the log, when the engine throws', async () => {
      const failure = new Error('invariante violada en backtrackingSolver.ts:120');
      const { useCase, generationRepository, logger } = build({
        solve: () => Promise.reject(failure),
      });

      await useCase.execute(GENERATION_ID);

      const [, result] = generationRepository.finish.mock.calls[0] as [
        string,
        { errorMessage: string },
      ];
      expect(result).toMatchObject({ status: 'FAILED', errorCode: 'INTERNAL', errorDetails: null });
      expect(result.errorMessage).not.toContain('backtrackingSolver');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'SCHEDULE_GENERATION_FAILED',
          error_code: 'INTERNAL',
          err: failure,
        }),
        expect.any(String),
      );
    });

    it.each<[string, SolveOutcome, string]>([
      ['INFEASIBLE', { status: 'infeasible', cause }, 'SCHEDULE_GENERATION_FAILED'],
      ['TIMEOUT', { status: 'timeout', placed: 1, total: 3 }, 'SCHEDULE_GENERATION_FAILED'],
      ['CANCELLED', { status: 'cancelled' }, 'SCHEDULE_GENERATION_CANCELLED'],
    ])('logs the event of a %s result without any name', async (_name, outcome, event) => {
      const { useCase, logger } = build({ solve: () => Promise.resolve(outcome) });

      await useCase.execute(GENERATION_ID);

      const calls = [...logger.info.mock.calls, ...logger.warn.mock.calls] as [
        Record<string, unknown>,
        string,
      ][];
      const logged = calls.find(([context]) => context.event === event);
      expect(logged?.[0]).toMatchObject({
        school_id: SCHOOL_ID,
        actor_id: CREATOR_ID,
        generation_id: GENERATION_ID,
        total: 3,
      });
      expect(JSON.stringify(calls)).not.toMatch(/Inglés|Ana López|Primaria/);
    });
  });

  describe('progress and cancellation', () => {
    it('writes the progress at most once every two seconds, however many times the engine reports it', async () => {
      const { useCase, generationRepository } = build({
        solve: (_input, options) => {
          for (let placed = 1; placed <= 1000; placed += 1) {
            options.onProgress?.(placed, 1000);
            options.isCancelled?.();
          }
          return Promise.resolve({ status: 'cancelled' });
        },
      });

      await useCase.execute(GENERATION_ID);

      // Solo la escritura inicial: el reloj no se movió.
      expect(generationRepository.saveProgress).toHaveBeenCalledTimes(1);
    });

    it('writes the last reported progress, with the heartbeat, once two seconds have passed', async () => {
      const { useCase, generationRepository, advance } = build({
        solve: async (_input, options) => {
          options.onProgress?.(1, 3);
          options.onProgress?.(2, 3);
          advance(2000);
          options.isCancelled?.();
          await flush();
          return solvedOf(entries);
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(generationRepository.saveProgress).toHaveBeenCalledTimes(2);
      expect(generationRepository.saveProgress).toHaveBeenLastCalledWith(
        GENERATION_ID,
        { placed: 2, total: 3, phase: 'SEARCHING', score: null },
        new Date(START.getTime() + 2000),
      );
    });

    it('keeps the heartbeat alive even when the progress does not move', async () => {
      const { useCase, generationRepository, advance } = build({
        solve: async (_input, options) => {
          for (let round = 0; round < 3; round += 1) {
            advance(2000);
            options.isCancelled?.();
            await flush();
          }
          return solvedOf(entries);
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(generationRepository.saveProgress).toHaveBeenCalledTimes(4);
    });

    it('never writes a lower number of placed sessions than before', async () => {
      const { useCase, generationRepository, advance } = build({
        solve: async (_input, options) => {
          options.onProgress?.(2, 3);
          options.onProgress?.(1, 3);
          advance(2000);
          options.isCancelled?.();
          await flush();
          return solvedOf(entries);
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(generationRepository.saveProgress).toHaveBeenLastCalledWith(
        GENERATION_ID,
        { placed: 2, total: 3, phase: 'SEARCHING', score: null },
        expect.any(Date),
      );
    });

    it('stops the engine when the write reports a requested cancellation', async () => {
      let sawCancellation = false;
      const { useCase, generationRepository, advance } = build({
        saveProgress: (_id, progress) => Promise.resolve({ cancelRequested: progress.placed >= 1 }),
        solve: async (_input, options) => {
          options.onProgress?.(1, 3);
          advance(2000);
          options.isCancelled?.();
          await flush();
          sawCancellation = options.isCancelled?.() === true;
          return { status: 'cancelled' };
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(sawCancellation).toBe(true);
      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        { status: 'CANCELLED', placed: 1, total: 3 },
        expect.any(Date),
      );
    });

    describe('during the improvement', () => {
      const partial: ScheduleScore = {
        total: 14,
        preferredMisses: 1,
        preferredTotal: 3,
        professorGaps: 1,
        consecutiveDays: 1,
        initialTotal: 21,
      };

      it('writes the phase and the score with the progress, at most every two seconds', async () => {
        const { useCase, generationRepository, advance } = build({
          solve: async (_input, options) => {
            options.onProgress?.(3, 3);
            options.onPhase?.('IMPROVING');
            options.onScore?.({ ...partial, total: 21 });
            // Cientos de mejoras sin que pasen dos segundos: ninguna escritura.
            for (let total = 20; total >= 15; total -= 1) {
              options.onScore?.({ ...partial, total });
              options.isCancelled?.();
            }
            expect(generationRepository.saveProgress).toHaveBeenCalledTimes(1);
            options.onScore?.(partial);
            advance(2000);
            options.isCancelled?.();
            await flush();
            return solvedOf(entries, { score: partial });
          },
        });

        await useCase.execute(GENERATION_ID);

        expect(generationRepository.saveProgress).toHaveBeenCalledTimes(2);
        expect(generationRepository.saveProgress).toHaveBeenLastCalledWith(
          GENERATION_ID,
          { placed: 3, total: 3, phase: 'IMPROVING', score: partial },
          new Date(START.getTime() + 2000),
        );
      });

      it('keeps the heartbeat alive while improving, even when the score does not move', async () => {
        const { useCase, generationRepository, advance } = build({
          solve: async (_input, options) => {
            options.onPhase?.('IMPROVING');
            for (let round = 0; round < 3; round += 1) {
              advance(2000);
              options.isCancelled?.();
              await flush();
            }
            return solvedOf(entries);
          },
        });

        await useCase.execute(GENERATION_ID);

        expect(generationRepository.saveProgress).toHaveBeenCalledTimes(4);
      });

      it.each(['TIME_LIMIT', 'CANCELLED'] as const)(
        'completes the generation, not failing it, when the improvement stops by %s',
        async (stoppedBy) => {
          const { useCase, generationRepository, scheduleRepository } = build({
            solve: () =>
              Promise.resolve(solvedOf(entries, { improvement: { stoppedBy }, score: partial })),
          });

          await useCase.execute(GENERATION_ID);

          expect(scheduleRepository.replaceDraft).toHaveBeenCalledWith(
            expect.objectContaining({ score: partial }),
            expect.any(Date),
          );
          expect(generationRepository.finish).not.toHaveBeenCalled();
        },
      );
    });

    it('does not search at all if the first write already says it was cancelled', async () => {
      const { useCase, solve, generationRepository } = build({
        saveProgress: () => Promise.resolve({ cancelRequested: true }),
      });

      await useCase.execute(GENERATION_ID);

      expect(solve).not.toHaveBeenCalled();
      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        { status: 'CANCELLED', placed: 0, total: 3 },
        START,
      );
    });

    it('does not let a failing progress write stop the search', async () => {
      const { useCase, scheduleRepository, advance } = build({
        saveProgress: vi
          .fn()
          .mockResolvedValueOnce({ cancelRequested: false })
          .mockRejectedValue(new Error('connection lost')),
        solve: async (_input, options) => {
          advance(2000);
          options.isCancelled?.();
          await flush();
          return solvedOf(entries);
        },
      });

      await useCase.execute(GENERATION_ID);

      expect(scheduleRepository.replaceDraft).toHaveBeenCalledTimes(1);
    });
  });
});
