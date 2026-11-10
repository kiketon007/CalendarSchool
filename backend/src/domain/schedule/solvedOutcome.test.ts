import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/schedule-generation.json' with { type: 'json' };
import {
  problemOf,
  professor,
  subject,
  type FixtureCalendars,
} from '../../../test/support/scheduleProblemFixtures.js';
import { generationInputOf } from './generationInput.js';
import type { Placement } from './scheduleSolver.js';
import { solvedOutcomeOf } from './solvedOutcome.js';
import { validateSchedule } from './validateSchedule.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const calendars = (fixtures as unknown as { calendars: FixtureCalendars }).calendars;

/** Una lección de 3 sesiones sueltas, sin regla, en una clase con sitio de sobra. */
const input = generationInputOf(
  problemOf(
    calendars,
    [
      {
        name: '1º',
        calendar: 'Corto',
        classes: ['A'],
        subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' })],
      },
    ],
    [professor('Ana Ruiz')],
  ),
  (a, b) => collator.compare(a, b),
);

/** Lunes, martes y miércoles a primera hora: tres días seguidos, que la mejora puede separar (SC3). */
const consecutiveDays: readonly Placement[] = [
  { dayOfWeek: 1, firstSession: 1 },
  { dayOfWeek: 2, firstSession: 1 },
  { dayOfWeek: 3, firstSession: 1 },
];

const fixedClock = { now: () => 0 };

describe('solvedOutcomeOf', () => {
  it('improves the schedule of the first phase and says which engine found it', async () => {
    const outcome = await solvedOutcomeOf(input, consecutiveDays, 'ORTOOLS', fixedClock, 0);

    expect(outcome.engine).toBe('ORTOOLS');
    expect(outcome.score.total).toBeLessThan(outcome.score.initialTotal);
    expect(outcome.improvement.moves).toBeGreaterThan(0);
    expect(validateSchedule(input, outcome.entries)).toEqual([]);
  });

  it('gives the same schedule, score and report from the same placements, whatever the engine', async () => {
    const fromBacktracking = await solvedOutcomeOf(
      input,
      consecutiveDays,
      'BACKTRACKING',
      fixedClock,
      0,
    );
    const fromOrTools = await solvedOutcomeOf(input, consecutiveDays, 'ORTOOLS', fixedClock, 0);

    expect(fromOrTools).toEqual({ ...fromBacktracking, engine: 'ORTOOLS' });
  });

  it('does not improve with improve false: the first-phase schedule and SKIPPED', async () => {
    const outcome = await solvedOutcomeOf(
      input,
      consecutiveDays,
      'ORTOOLS',
      { ...fixedClock, improve: false },
      0,
    );

    expect(outcome.improvement).toEqual({ stoppedBy: 'SKIPPED', moves: 0, elapsedMs: 0 });
    expect(outcome.score.total).toBe(outcome.score.initialTotal);
  });

  it('does not improve when no time is left, and announces the phase only when it improves', async () => {
    const phases: string[] = [];
    const noTime = await solvedOutcomeOf(
      input,
      consecutiveDays,
      'ORTOOLS',
      { now: () => 10_000, limitMs: 5_000, onPhase: (phase) => phases.push(phase) },
      0,
    );
    expect(noTime.improvement.stoppedBy).toBe('SKIPPED');
    expect(phases).toEqual([]);

    await solvedOutcomeOf(
      input,
      consecutiveDays,
      'ORTOOLS',
      { ...fixedClock, onPhase: (phase) => phases.push(phase) },
      0,
    );
    expect(phases).toEqual(['IMPROVING']);
  });

  it('refuses a schedule that the validator rejects: it is an engine failure', async () => {
    const sameCell: readonly Placement[] = [
      { dayOfWeek: 1, firstSession: 1 },
      { dayOfWeek: 1, firstSession: 1 },
      { dayOfWeek: 2, firstSession: 1 },
    ];

    await expect(solvedOutcomeOf(input, sameCell, 'ORTOOLS', fixedClock, 0)).rejects.toThrow(
      /horario inválido/,
    );
  });
});
