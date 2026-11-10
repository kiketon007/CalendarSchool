import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/schedule-generation.json' with { type: 'json' };
import {
  problemOf,
  professor,
  subject,
  type FixtureCalendars,
  type FixtureCourse,
  type FixtureProfessor,
} from '../../../test/support/scheduleProblemFixtures.js';
import { randomSchedulingProblem } from '../../../test/support/randomSchedulingProblem.js';
import { tightSchoolProblem } from '../../../test/support/tightSchoolProblem.js';
import { BacktrackingSolver } from './backtrackingSolver.js';
import { generationInputOf } from './generationInput.js';
import { scoreSchedule } from './scheduleScore.js';
import type { GenerationInput, SolveOutcome } from './scheduleSolver.js';
import { validateSchedule } from './validateSchedule.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);
const solver = new BacktrackingSolver();

type ExpectedCause = {
  reason: string;
  course: string;
  class: string;
  subject: string;
  professor: string;
};
interface FixtureCase {
  name: string;
  courses: FixtureCourse[];
  professors: FixtureProfessor[];
  expected:
    | { status: 'solved'; entries: [string, string, string, number, number][] }
    | { status: 'infeasible'; cause: ExpectedCause };
}
const table = fixtures as unknown as { calendars: FixtureCalendars; cases: FixtureCase[] };

/** Un reloj que avanza una unidad en cada consulta: el límite se mide en consultas, no en tiempo real. */
const countingClock = () => {
  let ticks = 0;
  return () => {
    ticks += 1;
    return ticks;
  };
};

const inputOf = (testCase: Pick<FixtureCase, 'courses' | 'professors'>): GenerationInput =>
  generationInputOf(
    problemOf(table.calendars, testCase.courses, testCase.professors),
    compareNames,
  );

const namedEntries = (input: GenerationInput, outcome: SolveOutcome) => {
  if (outcome.status !== 'solved') {
    throw new Error(`se esperaba solved y es ${outcome.status}`);
  }
  return outcome.entries.map((entry) => {
    const lesson = input.lessons.find(
      ({ classId, subjectId }) => classId === entry.classId && subjectId === entry.subjectId,
    );
    return [
      lesson?.courseName,
      lesson?.className,
      lesson?.subjectName,
      entry.dayOfWeek,
      entry.sessionNumber,
    ];
  });
};

describe('BacktrackingSolver', () => {
  describe.each(table.cases)('table of cases', (testCase) => {
    it(testCase.name, async () => {
      const input = inputOf(testCase);
      const outcome = await solver.solve(input, { improve: false });

      if (testCase.expected.status === 'solved') {
        expect(namedEntries(input, outcome)).toEqual(testCase.expected.entries);
        if (outcome.status === 'solved') {
          expect(validateSchedule(input, outcome.entries)).toEqual([]);
        }
      } else {
        expect(outcome.status).toBe('infeasible');
        if (outcome.status === 'infeasible') {
          const { cause } = outcome;
          expect({
            reason: cause.reason,
            course: cause.course.name,
            class: cause.schoolClass.name,
            subject: cause.subject.name,
            professor: cause.professor.name,
          }).toEqual(testCase.expected.cause);
        }
      }
    });
  });

  it('does not put anything where the load does not reach, the free slots stay without entry', async () => {
    const input = inputOf({
      courses: [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [
            subject('Lengua', 5, { A: 'Ana Ruiz' }),
            subject('Mates', 5, { A: 'Ben Pons' }),
          ],
        },
      ],
      professors: [professor('Ana Ruiz'), professor('Ben Pons')],
    });

    const outcome = await solver.solve(input);

    expect(outcome.status).toBe('solved');
    if (outcome.status === 'solved') {
      expect(outcome.entries).toHaveLength(10);
      // 3 sesiones al día durante 5 días son 15 celdas: quedan 5 sin entrada.
      expect(validateSchedule(input, outcome.entries)).toEqual([]);
    }
  });

  it('says that the BACKTRACKING engine produced the schedule', async () => {
    const input = inputOf({
      courses: [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 2, { A: 'Ana Ruiz' })],
        },
      ],
      professors: [professor('Ana Ruiz')],
    });

    const outcome = await solver.solve(input);

    expect(outcome).toMatchObject({ status: 'solved', engine: 'BACKTRACKING' });
  });

  it('refuses to return a schedule that the validator rejects', async () => {
    const input = inputOf({
      courses: [
        {
          name: '1º',
          calendar: 'Uno',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' }, { forbidden: [[1, 1]] })],
        },
      ],
      professors: [professor('Ana Ruiz')],
    });
    // Una entrada incoherente: el emplazamiento que el motor tiene por válido es una celda prohibida.
    const tampered: GenerationInput = {
      ...input,
      units: input.units.map((unit) => ({
        ...unit,
        placements: [{ dayOfWeek: 1, firstSession: 1 }],
      })),
    };

    await expect(solver.solve(tampered)).rejects.toThrow('inválido');
  });

  it('solves a problem without lessons with no entries', async () => {
    const outcome = await solver.solve({ courses: [], professors: [], lessons: [], units: [] });

    expect(outcome).toMatchObject({ status: 'solved', entries: [] });
  });

  describe('time and cancellation', () => {
    const hard = inputOf({
      courses: [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A', 'B', 'C'],
          subjects: [
            subject('Lengua', 4, { A: 'Ana Ruiz', B: 'Ana Ruiz', C: 'Ana Ruiz' }),
            subject('Mates', 4, { A: 'Ben Pons', B: 'Ben Pons', C: 'Ben Pons' }),
          ],
        },
      ],
      professors: [professor('Ana Ruiz'), professor('Ben Pons')],
    });

    it('returns timeout with the placed sessions and the total when the time is over', async () => {
      const outcome = await solver.solve(hard, { limitMs: 0, now: countingClock() });

      expect(outcome).toEqual({ status: 'timeout', placed: 0, total: 24 });
    });

    it('returns cancelled when the signal is up', async () => {
      const outcome = await solver.solve(hard, { isCancelled: () => true });

      expect(outcome).toEqual({ status: 'cancelled' });
    });

    it('checks the clock and the signal at least every 1024 nodes', async () => {
      const input = inputOf({
        courses: [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A'],
            subjects: Array.from({ length: 15 }, (_, index) =>
              subject(`Asignatura ${String(index)}`, 1, { A: `Profe${String(index)} X` }),
            ),
          },
        ],
        professors: Array.from({ length: 15 }, (_, index) => professor(`Profe${String(index)} X`)),
      });
      let calls = 0;

      await solver.solve(input, {
        improve: false,
        isCancelled: () => {
          calls += 1;
          return false;
        },
      });

      // 15 unidades son pocos nodos: se consulta una vez, al empezar.
      expect(calls).toBe(1);
    });

    it('reports a progress that never goes down and ends in the total', async () => {
      const input = inputOf({
        courses: [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A', 'B'],
            subjects: [
              subject('Lengua', 3, { A: 'Ana Ruiz', B: 'Ana Ruiz' }),
              subject('Mates', 3, { A: 'Ben Pons', B: 'Ben Pons' }, { blockSize: 2 }),
            ],
          },
        ],
        professors: [professor('Ana Ruiz'), professor('Ben Pons')],
      });
      const reported: number[] = [];

      const outcome = await solver.solve(input, {
        onProgress: (placed) => {
          reported.push(placed);
        },
      });

      expect(outcome.status).toBe('solved');
      expect(reported.length).toBeGreaterThan(0);
      expect(reported).toEqual([...reported].sort((a, b) => a - b));
      expect(reported.at(-1)).toBe(12);
    });
  });

  describe('the improvement phase', () => {
    // Lengua (2 sesiones) prefiere la última sesión del lunes y del miércoles; la fase 1 la deja en la 1.ª del lunes y
    // del martes: 2 fuera de sus preferidas y lunes-martes seguidos (20 + 1).
    const preferring = () =>
      inputOf({
        courses: [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A'],
            subjects: [
              subject(
                'Lengua',
                2,
                { A: 'Ana Ruiz' },
                {
                  preferred: [
                    [1, 3],
                    [3, 3],
                  ],
                },
              ),
            ],
          },
        ],
        professors: [professor('Ana Ruiz')],
      });

    it('improves the schedule of the first phase with the preferences', async () => {
      const input = preferring();

      const outcome = await solver.solve(input, { now: countingClock() });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.score).toEqual({
          total: 0,
          preferredMisses: 0,
          preferredTotal: 2,
          professorGaps: 0,
          consecutiveDays: 0,
          initialTotal: 21,
        });
        expect(outcome.improvement.stoppedBy).toBe('CONVERGED');
        expect(outcome.improvement.moves).toBeGreaterThanOrEqual(2);
        expect(
          outcome.entries.map(({ dayOfWeek, sessionNumber }) => [dayOfWeek, sessionNumber]),
        ).toEqual([
          [1, 3],
          [3, 3],
        ]);
        expect(validateSchedule(input, outcome.entries)).toEqual([]);
        expect(outcome.score.total).toBe(scoreSchedule(input, outcome.entries).total);
      }
    });

    it('returns the schedule of the first phase, skipped, with improve false', async () => {
      const input = preferring();

      const outcome = await solver.solve(input, { improve: false, now: countingClock() });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.improvement).toEqual({ stoppedBy: 'SKIPPED', moves: 0, elapsedMs: 0 });
        expect(outcome.score.total).toBe(21);
        expect(outcome.score.initialTotal).toBe(21);
        expect(
          outcome.entries.map(({ dayOfWeek, sessionNumber }) => [dayOfWeek, sessionNumber]),
        ).toEqual([
          [1, 1],
          [2, 1],
        ]);
      }
    });

    it('skips the improvement when the first phase used all the time', async () => {
      // El reloj contado: la fase 1 gasta 2 consultas de 2 permitidas y no queda tiempo.
      const outcome = await solver.solve(preferring(), { limitMs: 2, now: countingClock() });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.improvement.stoppedBy).toBe('SKIPPED');
        expect(outcome.score.total).toBe(outcome.score.initialTotal);
      }
    });

    it('stops with TIME_LIMIT and keeps the schedule of the first phase when the improvement has no time', async () => {
      const outcome = await solver.solve(preferring(), { improveMs: 1, now: countingClock() });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.improvement).toMatchObject({ stoppedBy: 'TIME_LIMIT', moves: 0 });
        expect(outcome.score.total).toBe(21);
      }
    });

    it('stops with CANCELLED and still solved when the signal goes up during the improvement', async () => {
      let improving = false;

      const outcome = await solver.solve(preferring(), {
        now: countingClock(),
        onPhase: () => {
          improving = true;
        },
        isCancelled: () => improving,
      });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.improvement.stoppedBy).toBe('CANCELLED');
        expect(outcome.entries).toHaveLength(2);
      }
    });

    it('tells the phase once after the last progress and never raises the score', async () => {
      const events: string[] = [];
      const scores: number[] = [];

      await solver.solve(preferring(), {
        now: countingClock(),
        onProgress: () => events.push('progress'),
        onPhase: (phase) => events.push(phase),
        onScore: (score) => {
          events.push('score');
          scores.push(score.total);
        },
      });

      expect(events.filter((event) => event === 'IMPROVING')).toHaveLength(1);
      expect(events.indexOf('IMPROVING')).toBe(events.lastIndexOf('progress') + 1);
      expect(scores[0]).toBe(21);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(scores.at(-1)).toBe(0);
    });

    it('throws if the improved schedule were invalid, like the first phase does', async () => {
      // El mismo emplazamiento prohibido que el test de la fase 1: el error salta antes de mejorar.
      const input = preferring();
      const tampered: GenerationInput = {
        ...input,
        lessons: input.lessons.map((lesson) => ({
          ...lesson,
          forbidden: [{ dayOfWeek: 1, sessionNumber: 1 }],
        })),
      };

      await expect(solver.solve(tampered, { now: countingClock() })).rejects.toThrow('inválido');
    });
  });

  describe('determinism and properties', () => {
    it('gives the same entries in the same order for the same input', async () => {
      const input = inputOf({
        courses: [
          {
            name: '1º',
            calendar: 'Recreo',
            classes: ['A', 'B'],
            subjects: [
              subject('Lengua', 4, { A: 'Ana Ruiz', B: 'Ben Pons' }, { blockSize: 2 }),
              subject('Mates', 3, { A: 'Ben Pons', B: 'Ana Ruiz' }, { maxPerDay: 2 }),
            ],
          },
        ],
        professors: [professor('Ana Ruiz'), professor('Ben Pons')],
      });

      const first = await solver.solve(input, { now: countingClock() });
      const second = await solver.solve(input, { now: countingClock() });

      expect(first.status).toBe('solved');
      expect(second).toEqual(first);
    });

    it.each(Array.from({ length: 12 }, (_, seed) => seed + 1))(
      'every solution of the random problem %i passes the validator',
      async (seed) => {
        const problem = randomSchedulingProblem(seed, {
          courses: 4,
          classes: 2,
          subjects: 6,
          professors: 8,
          rules: 0.4,
        });
        const input = generationInputOf(problem, compareNames);

        const outcome = await solver.solve(input, { limitMs: 10, now: countingClock() });

        if (outcome.status === 'solved') {
          expect(validateSchedule(input, outcome.entries)).toEqual([]);
          const again = await solver.solve(input, { limitMs: 10, now: countingClock() });
          expect(again).toEqual(outcome);
        } else {
          expect(['infeasible', 'timeout']).toContain(outcome.status);
        }
      },
      20_000,
    );

    it.each(Array.from({ length: 12 }, (_, seed) => seed + 1))(
      'the improved solution of the random problem %i is valid, never worse and its score is the real one',
      async (seed) => {
        const problem = randomSchedulingProblem(seed, {
          courses: 4,
          classes: 2,
          subjects: 6,
          professors: 8,
          rules: 0.4,
          preferred: 0.5,
        });
        const input = generationInputOf(problem, compareNames);
        const options = { limitMs: 400, improveMs: 200 };

        const outcome = await solver.solve(input, { ...options, now: countingClock() });

        if (outcome.status === 'solved') {
          expect(validateSchedule(input, outcome.entries)).toEqual([]);
          expect(outcome.score.total).toBeLessThanOrEqual(outcome.score.initialTotal);
          // Oráculo: la penalización que lleva la búsqueda es la de recalcular el horario entero.
          expect(outcome.score.total).toBe(scoreSchedule(input, outcome.entries).total);
          const again = await solver.solve(input, { ...options, now: countingClock() });
          expect(again).toEqual(outcome);
        } else {
          expect(['infeasible', 'timeout']).toContain(outcome.status);
        }
      },
      30_000,
    );

    it('solves a school of real size inside the time of the test', async () => {
      const problem = randomSchedulingProblem(7, {
        courses: 12,
        classes: 2,
        subjects: 8,
        professors: 15,
        rules: 0.2,
        fill: 0.4,
      });
      const input = generationInputOf(problem, compareNames);

      const outcome = await solver.solve(input, { limitMs: 20_000, improve: false });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        const sessions = input.lessons.reduce((total, { sessions: count }) => total + count, 0);
        expect(input.lessons).toHaveLength(192);
        expect(outcome.entries).toHaveLength(sessions);
        expect(validateSchedule(input, outcome.entries)).toEqual([]);
      }
    }, 30_000);
  });

  describe('the measured improvement', () => {
    // El reloj contado: un tic por consulta, así que el límite no depende de la máquina.
    const options = () => ({ limitMs: 1_000_000, improveMs: 500_000, now: countingClock() });

    it('lowers the penalty of a school of real size and keeps it valid', async () => {
      const problem = randomSchedulingProblem(7, {
        courses: 12,
        classes: 2,
        subjects: 8,
        professors: 15,
        rules: 0.2,
        fill: 0.4,
        preferred: 0.5,
      });
      const input = generationInputOf(problem, compareNames);
      expect(input.lessons).toHaveLength(192);

      const outcome = await solver.solve(input, options());

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.score.total).toBeLessThan(outcome.score.initialTotal);
        expect(outcome.improvement.moves).toBeGreaterThan(0);
        expect(validateSchedule(input, outcome.entries)).toEqual([]);
        expect(outcome.score.total).toBe(scoreSchedule(input, outcome.entries).total);
      }
    }, 60_000);

    it('keeps every slot of every class filled and does not get worse in a school with no free slots', async () => {
      const input = generationInputOf(tightSchoolProblem(), compareNames);

      const outcome = await solver.solve(input, options());

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.entries).toHaveLength(360);
        expect(validateSchedule(input, outcome.entries)).toEqual([]);
        expect(outcome.score.total).toBeLessThanOrEqual(outcome.score.initialTotal);
      }
    }, 60_000);
  });

  describe('a school with no free slots', () => {
    // 12 clases, 30 sesiones para 30 franjas cada una y seis especialistas compartidos: sin reinicios ni pesos el motor
    // colocaba 28 de 360 sesiones en 30 s (un colegio real agotaba el tiempo).
    it('finds a valid timetable for every slot of every class, in well under the time limit', async () => {
      const input = generationInputOf(tightSchoolProblem(), compareNames);
      const startedAt = Date.now();

      const outcome = await solver.solve(input, { limitMs: 30_000, improve: false });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        expect(outcome.entries).toHaveLength(360);
        expect(validateSchedule(input, outcome.entries)).toEqual([]);
      }
      expect(Date.now() - startedAt).toBeLessThan(15_000);
    }, 40_000);

    it('is deterministic: the same school gives the same timetable', async () => {
      const input = generationInputOf(tightSchoolProblem(), compareNames);

      const first = await solver.solve(input, { limitMs: 30_000, improve: false });
      const second = await solver.solve(input, { limitMs: 30_000, improve: false });

      expect(second).toEqual(first);
    }, 80_000);
  });
});
