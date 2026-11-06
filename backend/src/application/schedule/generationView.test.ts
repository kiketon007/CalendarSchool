import { describe, expect, it } from 'vitest';
import type { Generation } from '../../domain/schedule/generation.js';
import { toGenerationView } from './generationView.js';

const score = {
  total: 12,
  preferredMisses: 1,
  preferredTotal: 6,
  professorGaps: 0,
  consecutiveDays: 2,
  initialTotal: 21,
};

const generation = (overrides: Partial<Generation> = {}): Generation => ({
  id: 'generation-1',
  schoolId: 'school-1',
  createdById: 'user-1',
  status: 'RUNNING',
  placed: 50,
  total: 100,
  improve: true,
  phase: 'SEARCHING',
  score: null,
  cancelRequested: false,
  errorCode: null,
  errorMessage: null,
  errorDetails: null,
  scheduleId: null,
  createdAt: new Date('2026-11-04T08:00:00.000Z'),
  startedAt: new Date('2026-11-04T08:00:01.000Z'),
  finishedAt: null,
  ...overrides,
});

describe('toGenerationView', () => {
  it('hides the school, the author and the cancel mark, and adds the progress', () => {
    const view = toGenerationView(generation());

    expect(view).not.toHaveProperty('schoolId');
    expect(view).not.toHaveProperty('createdById');
    expect(view).not.toHaveProperty('cancelRequested');
    expect(view).toMatchObject({ progress: 50, improve: true, phase: 'SEARCHING', score: null });
  });

  it('tells that the improvement was cancelled only when it completed after a cancel request with improve', () => {
    const completed = {
      status: 'COMPLETED' as const,
      phase: 'IMPROVING' as const,
      score,
      scheduleId: 'schedule-1',
    };

    expect(toGenerationView(generation({ ...completed, cancelRequested: true }))).toMatchObject({
      improvementCancelled: true,
    });
    expect(toGenerationView(generation({ ...completed, cancelRequested: false }))).toMatchObject({
      improvementCancelled: false,
    });
    expect(
      toGenerationView(generation({ ...completed, improve: false, cancelRequested: true })),
    ).toMatchObject({ improvementCancelled: false });
  });

  it.each(['QUEUED', 'RUNNING', 'FAILED', 'CANCELLED'] as const)(
    'is not an improvement cancelled when the generation is %s',
    (status) => {
      expect(toGenerationView(generation({ status, cancelRequested: true }))).toMatchObject({
        improvementCancelled: false,
      });
    },
  );
});
