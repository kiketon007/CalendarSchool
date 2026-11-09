import { describe, expect, it } from 'vitest';
import type { Generation } from '../services/scheduleGenerationService';
import type { ScheduleOverview, ScheduleSummary } from '../services/scheduleService';
import { completedKind, generationBadge, generationEyebrow } from './generationStatus';

const SCHEDULE_ID = '7a1d3b9e-0c52-4f1e-9b6a-2f7d6a1f0c11';

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'b5f0a1c2-3d4e-4f60-8a7b-9c0d1e2f3a4b',
    status: 'COMPLETED',
    progress: 100,
    placed: 360,
    total: 360,
    improve: true,
    phase: 'IMPROVING',
    score: null,
    improvementCancelled: false,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    scheduleId: SCHEDULE_ID,
    createdAt: '2026-11-09T09:00:00.000Z',
    startedAt: '2026-11-09T09:00:01.000Z',
    finishedAt: '2026-11-09T09:01:00.000Z',
    ...overrides,
  };
}

function summary(id: string): ScheduleSummary {
  return {
    id,
    status: 'DRAFT',
    generatedAt: '2026-11-09T09:01:00.000Z',
    placedSessions: 360,
    confirmedAt: null,
    confirmedBy: null,
    replacedAt: null,
    score: null,
  };
}

function overviewOf(
  draft: ScheduleSummary | null,
  official: ScheduleSummary | null,
): ScheduleOverview {
  return { draft, official, previousCount: 0 };
}

const OTHER_ID = '00000000-0000-4000-8000-000000000000';

describe('completedKind', () => {
  it('es un borrador si el horario de la generación es el borrador vigente', () => {
    const overview = overviewOf(summary(SCHEDULE_ID), null);
    expect(completedKind(generation(), overview)).toBe('draft');
  });

  it('es un borrador si no se sabe qué horarios hay', () => {
    expect(completedKind(generation(), null)).toBe('draft');
  });

  it('es el oficial si el horario de la generación es el oficial', () => {
    const overview = overviewOf(null, summary(SCHEDULE_ID));
    expect(completedKind(generation(), overview)).toBe('official');
  });

  it('ya no existe si no es ni el borrador ni el oficial', () => {
    const overview = overviewOf(summary(OTHER_ID), summary(OTHER_ID));
    expect(completedKind(generation(), overview)).toBe('gone');
    expect(completedKind(generation(), overviewOf(null, null))).toBe('gone');
  });
});

describe('generationBadge', () => {
  const vigente = overviewOf(summary(SCHEDULE_ID), null);
  const oficial = overviewOf(null, summary(SCHEDULE_ID));
  const huerfana = overviewOf(null, null);

  it.each([
    ['sin generación', null, null, null],
    ['en cola', generation({ status: 'QUEUED', phase: 'SEARCHING' }), null, 'lavender:running'],
    ['buscando', generation({ status: 'RUNNING', phase: 'SEARCHING' }), null, 'lavender:running'],
    [
      'mejorando',
      generation({ status: 'RUNNING', phase: 'IMPROVING' }),
      null,
      'lavender:improving',
    ],
    ['borrador vigente', generation(), vigente, 'mint:draft'],
    ['horarios desconocidos', generation(), null, 'mint:draft'],
    ['oficial', generation(), oficial, 'mint:official'],
    ['borrador descartado', generation(), huerfana, 'yellow:gone'],
    [
      'fallida',
      generation({ status: 'FAILED', errorCode: 'INFEASIBLE', scheduleId: null }),
      null,
      'danger:failed',
    ],
    ['cancelada', generation({ status: 'CANCELLED', scheduleId: null }), null, 'yellow:cancelled'],
  ])('%s', (_name, current, overview, expected) => {
    const badge = generationBadge(current, overview);
    expect(badge === null ? null : `${badge.tone}:${badge.key}`).toBe(expected);
  });
});

describe('generationEyebrow', () => {
  it.each([
    ['sin generación', null, null],
    ['en cola', generation({ status: 'QUEUED', phase: 'SEARCHING' }), 'running'],
    ['mejorando', generation({ status: 'RUNNING', phase: 'IMPROVING' }), 'running'],
    ['completada', generation(), 'last'],
    ['fallida', generation({ status: 'FAILED', errorCode: 'TIMEOUT', scheduleId: null }), 'last'],
    ['cancelada', generation({ status: 'CANCELLED', scheduleId: null }), 'last'],
  ])('%s', (_name, current, expected) => {
    expect(generationEyebrow(current)).toBe(expected);
  });
});
