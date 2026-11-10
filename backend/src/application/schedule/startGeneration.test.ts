import { describe, expect, it, vi } from 'vitest';
import type { Generation } from '../../domain/schedule/generation.js';
import { GenerationInProgress, ScheduleNotReady } from '../../domain/schedule/generationErrors.js';
import type { GenerationRepository } from '../../domain/schedule/generationRepository.js';
import type { GenerationLauncher } from '../../domain/schedule/generationLauncher.js';
import type { SchedulingProblem } from '../../domain/schedule/schedulingProblem.js';
import type { ScheduleEngine } from '../../domain/schedule/scheduleSolver.js';
import {
  problemOf,
  professor,
  subject,
  type FixtureCourse,
} from '../../../test/support/scheduleProblemFixtures.js';
import { StartGeneration } from './startGeneration.js';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const NOW = new Date('2026-11-04T10:00:00.000Z');
const GENERATION_ID = 'generation-1';

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
/** Un curso sin calendario: bloquea. */
const blockedProblem = problemOf(
  calendars,
  [{ ...readyCourse, calendar: null }],
  [professor('Ana López')],
);

function queuedGeneration(): Generation {
  return {
    id: GENERATION_ID,
    schoolId: SCHOOL_ID,
    createdById: ACTOR_ID,
    status: 'QUEUED',
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
    createdAt: NOW,
    startedAt: null,
    finishedAt: null,
  };
}

function build(
  options: {
    problem?: SchedulingProblem;
    insert?: GenerationRepository['insert'];
    launch?: GenerationLauncher['launch'];
    engine?: ScheduleEngine;
  } = {},
) {
  const order: string[] = [];
  const schedulingProblemRepository = {
    read: vi.fn((_schoolId: string) => {
      order.push('read');
      return Promise.resolve(options.problem ?? readyProblem);
    }),
  };
  const generationRepository = {
    failStuck: vi.fn((_schoolId: string, _olderThan: Date, _now: Date) => {
      order.push('failStuck');
      return Promise.resolve(0);
    }),
    insert: vi.fn(
      options.insert ??
        (() => {
          order.push('insert');
          return Promise.resolve(queuedGeneration());
        }),
    ),
    finish: vi.fn(() => Promise.resolve()),
  };
  const launcher = {
    launch: vi.fn(
      options.launch ??
        (() => {
          order.push('launch');
          return Promise.resolve();
        }),
    ),
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const useCase = new StartGeneration({
    schedulingProblemRepository,
    generationRepository,
    launcher,
    idGenerator: { generate: () => GENERATION_ID },
    logger,
    now: () => NOW,
    engine: options.engine ?? 'BACKTRACKING',
  });
  return { useCase, schedulingProblemRepository, generationRepository, launcher, logger, order };
}

describe('StartGeneration', () => {
  it('checks the school, marks the stuck generations, inserts a queued one and launches it, in that order', async () => {
    const { useCase, order } = build();

    await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

    expect(order).toEqual(['read', 'failStuck', 'insert', 'launch']);
  });

  it('returns the generation as the person sees it, queued and with zero progress', async () => {
    const { useCase } = build();

    const view = await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

    expect(view).toEqual({
      id: GENERATION_ID,
      status: 'QUEUED',
      progress: 0,
      placed: 0,
      total: 0,
      improve: true,
      phase: 'SEARCHING',
      score: null,
      improvementCancelled: false,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      scheduleId: null,
      createdAt: NOW,
      startedAt: null,
      finishedAt: null,
    });
  });

  it('takes the school and the actor from the identity, and gives the worker only the id', async () => {
    const { useCase, schedulingProblemRepository, generationRepository, launcher } = build();

    await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

    expect(schedulingProblemRepository.read).toHaveBeenCalledWith(SCHOOL_ID);
    expect(generationRepository.insert).toHaveBeenCalledWith({
      id: GENERATION_ID,
      schoolId: SCHOOL_ID,
      createdById: ACTOR_ID,
      improve: true,
      now: NOW,
    });
    expect(launcher.launch).toHaveBeenCalledWith(GENERATION_ID);
  });

  it('saves what was asked about the improvement and improves by default', async () => {
    const asked = build();
    const notAsked = build();

    await asked.useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID, improve: false });
    await notAsked.useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

    expect(asked.generationRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ improve: false }),
    );
    expect(notAsked.generationRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ improve: true }),
    );
  });

  it('considers stuck what has not moved for 90 seconds', async () => {
    const { useCase, generationRepository } = build();

    await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

    expect(generationRepository.failStuck).toHaveBeenCalledWith(
      SCHOOL_ID,
      new Date(NOW.getTime() - 90_000),
      NOW,
    );
  });

  it('throws ScheduleNotReady with blockers, without creating or launching anything', async () => {
    const { useCase, generationRepository, launcher } = build({ problem: blockedProblem });

    await expect(
      useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID }),
    ).rejects.toBeInstanceOf(ScheduleNotReady);

    expect(generationRepository.insert).not.toHaveBeenCalled();
    expect(launcher.launch).not.toHaveBeenCalled();
  });

  it('lets GenerationInProgress through, without launching', async () => {
    const { useCase, launcher } = build({
      insert: () => Promise.reject(new GenerationInProgress()),
    });

    await expect(
      useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID }),
    ).rejects.toBeInstanceOf(GenerationInProgress);

    expect(launcher.launch).not.toHaveBeenCalled();
  });

  describe('when the launch fails', () => {
    const failure = new Error('AccessDenied');

    it('leaves the generation FAILED with INTERNAL, so none stays queued, and rethrows the error', async () => {
      const { useCase, generationRepository } = build({ launch: () => Promise.reject(failure) });

      await expect(useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID })).rejects.toBe(
        failure,
      );

      expect(generationRepository.finish).toHaveBeenCalledWith(
        GENERATION_ID,
        {
          status: 'FAILED',
          placed: 0,
          total: 0,
          errorCode: 'INTERNAL',
          errorMessage: 'No se pudo lanzar la generación',
          errorDetails: null,
        },
        NOW,
      );
    });

    it('logs the failure with identifiers and the error, never names', async () => {
      const { useCase, logger } = build({ launch: () => Promise.reject(failure) });

      await expect(useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID })).rejects.toBe(
        failure,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'SCHEDULE_GENERATION_FAILED',
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          generation_id: GENERATION_ID,
          error_code: 'INTERNAL',
          err: failure,
        }),
        expect.any(String),
      );
    });
  });

  describe('events', () => {
    it('logs SCHEDULE_GENERATION_STARTED with identifiers', async () => {
      const { useCase, logger } = build();

      await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'SCHEDULE_GENERATION_STARTED',
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          generation_id: GENERATION_ID,
          improve: true,
          engine: 'BACKTRACKING',
        },
        expect.any(String),
      );
    });

    it('logs the configured engine in SCHEDULE_GENERATION_STARTED', async () => {
      const { useCase, logger } = build({ engine: 'ORTOOLS' });

      await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'SCHEDULE_GENERATION_STARTED', engine: 'ORTOOLS' }),
        expect.any(String),
      );
    });

    it('logs whether the improvement was asked in SCHEDULE_GENERATION_STARTED', async () => {
      const { useCase, logger } = build();

      await useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID, improve: false });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'SCHEDULE_GENERATION_STARTED', improve: false }),
        expect.any(String),
      );
    });

    it('logs a rejection for blockers and for an ongoing generation, without names', async () => {
      const blocked = build({ problem: blockedProblem });
      await expect(
        blocked.useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID }),
      ).rejects.toThrow();
      const ongoing = build({ insert: () => Promise.reject(new GenerationInProgress()) });
      await expect(
        ongoing.useCase.execute({ schoolId: SCHOOL_ID, actorId: ACTOR_ID }),
      ).rejects.toThrow();

      expect(blocked.logger.warn).toHaveBeenCalledWith(
        {
          event: 'SCHEDULE_GENERATION_REJECTED',
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          reason: 'not_ready',
        },
        expect.any(String),
      );
      expect(ongoing.logger.warn).toHaveBeenCalledWith(
        {
          event: 'SCHEDULE_GENERATION_REJECTED',
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          reason: 'in_progress',
        },
        expect.any(String),
      );
      expect(
        JSON.stringify([blocked.logger.warn.mock.calls, ongoing.logger.warn.mock.calls]),
      ).not.toContain('Primaria');
    });
  });
});
