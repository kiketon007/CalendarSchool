import { describe, expect, it, vi } from 'vitest';
import type { Generation } from '../../domain/schedule/generation.js';
import { GenerationNotFound } from '../../domain/schedule/generationErrors.js';
import { GetCurrentGeneration } from './getCurrentGeneration.js';
import { GetGeneration } from './getGeneration.js';

const SCHOOL_ID = 'school-1';
const NOW = new Date('2026-11-04T10:00:00.000Z');

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'generation-1',
    schoolId: SCHOOL_ID,
    createdById: 'user-1',
    status: 'RUNNING',
    placed: 126,
    total: 300,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    scheduleId: null,
    createdAt: NOW,
    startedAt: NOW,
    finishedAt: null,
    ...overrides,
  };
}

function repositoryReturning(found: Generation | null) {
  const order: string[] = [];
  const repository = {
    failStuck: vi.fn((_schoolId: string, _olderThan: Date, _now: Date) => {
      order.push('failStuck');
      return Promise.resolve(0);
    }),
    findById: vi.fn((_schoolId: string, _id: string) => {
      order.push('find');
      return Promise.resolve(found);
    }),
    findCurrent: vi.fn((_schoolId: string) => {
      order.push('find');
      return Promise.resolve(found);
    }),
  };
  return { repository, order };
}

describe('GetGeneration', () => {
  it('marks the stuck generations first, then reads the one asked for', async () => {
    const { repository, order } = repositoryReturning(generation());

    await new GetGeneration({ generationRepository: repository, now: () => NOW }).execute({
      schoolId: SCHOOL_ID,
      generationId: 'generation-1',
    });

    expect(order).toEqual(['failStuck', 'find']);
    expect(repository.failStuck).toHaveBeenCalledWith(
      SCHOOL_ID,
      new Date(NOW.getTime() - 90_000),
      NOW,
    );
    expect(repository.findById).toHaveBeenCalledWith(SCHOOL_ID, 'generation-1');
  });

  it('returns the view with the progress calculated, without the school or the author', async () => {
    const { repository } = repositoryReturning(generation());

    const view = await new GetGeneration({
      generationRepository: repository,
      now: () => NOW,
    }).execute({ schoolId: SCHOOL_ID, generationId: 'generation-1' });

    expect(view).toEqual({
      id: 'generation-1',
      status: 'RUNNING',
      progress: 42,
      placed: 126,
      total: 300,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      scheduleId: null,
      createdAt: NOW,
      startedAt: NOW,
      finishedAt: null,
    });
  });

  it('throws GenerationNotFound when it is not of the school or does not exist', async () => {
    const { repository } = repositoryReturning(null);

    await expect(
      new GetGeneration({ generationRepository: repository, now: () => NOW }).execute({
        schoolId: SCHOOL_ID,
        generationId: 'other',
      }),
    ).rejects.toBeInstanceOf(GenerationNotFound);
  });
});

describe('GetCurrentGeneration', () => {
  it('marks the stuck generations first, then reads the current one', async () => {
    const { repository, order } = repositoryReturning(generation());

    await new GetCurrentGeneration({ generationRepository: repository, now: () => NOW }).execute({
      schoolId: SCHOOL_ID,
    });

    expect(order).toEqual(['failStuck', 'find']);
    expect(repository.findCurrent).toHaveBeenCalledWith(SCHOOL_ID);
  });

  it('returns the view of the current generation', async () => {
    const { repository } = repositoryReturning(
      generation({ status: 'COMPLETED', placed: 300, scheduleId: 'schedule-1', finishedAt: NOW }),
    );

    const view = await new GetCurrentGeneration({
      generationRepository: repository,
      now: () => NOW,
    }).execute({ schoolId: SCHOOL_ID });

    expect(view).toMatchObject({ status: 'COMPLETED', progress: 100, scheduleId: 'schedule-1' });
  });

  it('returns null when the school never generated', async () => {
    const { repository } = repositoryReturning(null);

    await expect(
      new GetCurrentGeneration({ generationRepository: repository, now: () => NOW }).execute({
        schoolId: SCHOOL_ID,
      }),
    ).resolves.toBeNull();
  });
});
