import { describe, expect, it, vi } from 'vitest';
import type { Generation } from '../../domain/schedule/generation.js';
import {
  GenerationNotCancellable,
  GenerationNotFound,
} from '../../domain/schedule/generationErrors.js';
import type { CancelOutcome } from '../../domain/schedule/generationRepository.js';
import { CancelGeneration } from './cancelGeneration.js';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const NOW = new Date('2026-11-04T10:00:00.000Z');

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'generation-1',
    schoolId: SCHOOL_ID,
    createdById: 'user-2',
    status: 'RUNNING',
    placed: 126,
    total: 300,
    improve: true,
    phase: 'SEARCHING',
    score: null,
    cancelRequested: false,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    scheduleId: null,
    createdAt: new Date(NOW.getTime() - 5000),
    startedAt: new Date(NOW.getTime() - 4000),
    finishedAt: null,
    ...overrides,
  };
}

function build(outcome: CancelOutcome) {
  const generationRepository = {
    requestCancel: vi.fn((_schoolId: string, _id: string, _now: Date) => Promise.resolve(outcome)),
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const useCase = new CancelGeneration({ generationRepository, logger, now: () => NOW });
  return { useCase, generationRepository, logger };
}

const input = { schoolId: SCHOOL_ID, actorId: ACTOR_ID, generationId: 'generation-1' };

describe('CancelGeneration', () => {
  it('asks the repository to cancel the generation of the school', async () => {
    const { useCase, generationRepository } = build({
      kind: 'requested',
      generation: generation(),
    });

    await useCase.execute(input);

    expect(generationRepository.requestCancel).toHaveBeenCalledWith(SCHOOL_ID, 'generation-1', NOW);
  });

  it('returns the generation as it is, still running when the worker has not seen the request', async () => {
    const { useCase } = build({ kind: 'requested', generation: generation() });

    await expect(useCase.execute(input)).resolves.toMatchObject({
      id: 'generation-1',
      status: 'RUNNING',
      progress: 42,
    });
  });

  it('returns a queued generation already cancelled', async () => {
    const { useCase } = build({
      kind: 'requested',
      generation: generation({ status: 'CANCELLED', placed: 0, total: 0, finishedAt: NOW }),
    });

    await expect(useCase.execute(input)).resolves.toMatchObject({
      status: 'CANCELLED',
      finishedAt: NOW,
    });
  });

  it('throws GenerationNotCancellable when it already finished', async () => {
    const { useCase } = build({ kind: 'notCancellable' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(GenerationNotCancellable);
  });

  it('throws GenerationNotFound when it is of another school or does not exist', async () => {
    const { useCase } = build({ kind: 'notFound' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(GenerationNotFound);
  });

  describe('events', () => {
    it('logs SCHEDULE_GENERATION_CANCELLED when a queued generation is cancelled right away', async () => {
      const { useCase, logger } = build({
        kind: 'requested',
        generation: generation({ status: 'CANCELLED', placed: 0, total: 0, finishedAt: NOW }),
      });

      await useCase.execute(input);

      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'SCHEDULE_GENERATION_CANCELLED',
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          generation_id: 'generation-1',
          placed: 0,
          total: 0,
          duration_ms: 5000,
          error_code: null,
        },
        expect.any(String),
      );
    });

    it('logs the request, not the cancellation, when the worker still has to stop', async () => {
      const { useCase, logger } = build({ kind: 'requested', generation: generation() });

      await useCase.execute(input);

      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'SCHEDULE_GENERATION_CANCEL_REQUESTED',
          school_id: SCHOOL_ID,
          actor_id: ACTOR_ID,
          generation_id: 'generation-1',
        },
        expect.any(String),
      );
    });

    it('logs nothing when there was nothing to cancel', async () => {
      const gone = build({ kind: 'notFound' });
      const finished = build({ kind: 'notCancellable' });
      await expect(gone.useCase.execute(input)).rejects.toThrow();
      await expect(finished.useCase.execute(input)).rejects.toThrow();

      expect(gone.logger.info).not.toHaveBeenCalled();
      expect(finished.logger.info).not.toHaveBeenCalled();
    });
  });
});
