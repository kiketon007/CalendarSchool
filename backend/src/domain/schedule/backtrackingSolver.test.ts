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
import { BacktrackingSolver } from './backtrackingSolver.js';
import { generationInputOf } from './generationInput.js';
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
      const outcome = await solver.solve(input);

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

    expect(outcome).toEqual({ status: 'solved', entries: [] });
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

      const first = await solver.solve(input);
      const second = await solver.solve(input);

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

      const outcome = await solver.solve(input, { limitMs: 20_000 });

      expect(outcome.status).toBe('solved');
      if (outcome.status === 'solved') {
        const sessions = input.lessons.reduce((total, { sessions: count }) => total + count, 0);
        expect(input.lessons).toHaveLength(192);
        expect(outcome.entries).toHaveLength(sessions);
        expect(validateSchedule(input, outcome.entries)).toEqual([]);
      }
    }, 30_000);
  });
});
