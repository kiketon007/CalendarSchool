import { afterAll, describe, expect, it, vi } from 'vitest';
import fixtures from '../../../test-fixtures/schedule-generation.json' with { type: 'json' };
import {
  orToolsAvailable,
  orToolsPython,
  ORTOOLS_SCRIPT,
} from '../../test/support/orToolsPython.js';
import { randomSchedulingProblem } from '../../test/support/randomSchedulingProblem.js';
import {
  problemOf,
  type FixtureCalendars,
  type FixtureCourse,
  type FixtureProfessor,
} from '../../test/support/scheduleProblemFixtures.js';
import { tightSchoolProblem } from '../../test/support/tightSchoolProblem.js';
import { BacktrackingSolver } from '../domain/schedule/backtrackingSolver.js';
import { generationInputOf } from '../domain/schedule/generationInput.js';
import { OrToolsSolver } from '../domain/schedule/orToolsSolver.js';
import type { GenerationInput, ScheduleSolver } from '../domain/schedule/scheduleSolver.js';
import { validateSchedule } from '../domain/schedule/validateSchedule.js';
import { ChildProcessOrToolsTransport } from './childProcessOrToolsTransport.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);

interface FixtureCase {
  name: string;
  courses: FixtureCourse[];
  professors: FixtureProfessor[];
  expected: { status: 'solved' | 'infeasible' };
}
const table = fixtures as unknown as { calendars: FixtureCalendars; cases: FixtureCase[] };

/** Los problemas de la tabla de casos, el colegio de tamaño real y el colegio sin ningún hueco libre. */
const problems: { name: string; input: GenerationInput; expected: 'solved' | 'infeasible' }[] = [
  ...table.cases.map(({ name, courses, professors, expected }) => ({
    name,
    input: generationInputOf(problemOf(table.calendars, courses, professors), compareNames),
    expected: expected.status,
  })),
  {
    name: 'a school of real size (192 lessons)',
    input: generationInputOf(
      randomSchedulingProblem(7, {
        courses: 12,
        classes: 2,
        subjects: 8,
        professors: 15,
        rules: 0.2,
        fill: 0.4,
      }),
      compareNames,
    ),
    expected: 'solved',
  },
  {
    name: 'a school without any free slot (12 classes of 30 sessions)',
    input: generationInputOf(tightSchoolProblem(), compareNames),
    expected: 'solved',
  },
];

const timings: { problem: string; backtrackingMs: number; orToolsMs: number }[] = [];
const available = orToolsAvailable();

async function timed(solver: ScheduleSolver, input: GenerationInput) {
  const started = Date.now();
  const outcome = await solver.solve(input, { improve: false, limitMs: 60_000 });
  return { outcome, ms: Date.now() - started };
}

afterAll(() => {
  if (timings.length > 0) {
    console.info(`Tiempos de los dos motores (ms):\n${JSON.stringify(timings, null, 1)}`);
  }
});

describe.skipIf(!available)('the two engines meet the same hard constraints', () => {
  describe.each(problems)('$name', ({ name, input, expected }) => {
    it(`both say ${expected}, and the schedules of both pass the validator`, async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const backtracking = new BacktrackingSolver();
      const orTools = new OrToolsSolver({
        transport: new ChildProcessOrToolsTransport({
          python: orToolsPython(),
          script: ORTOOLS_SCRIPT,
        }),
        fallback: backtracking,
        logger,
      });

      const current = await timed(backtracking, input);
      const other = await timed(orTools, input);
      timings.push({ problem: name, backtrackingMs: current.ms, orToolsMs: other.ms });

      expect(current.outcome.status).toBe(expected);
      expect(other.outcome.status).toBe(expected);
      if (current.outcome.status === 'solved') {
        expect(validateSchedule(input, current.outcome.entries)).toEqual([]);
      }
      if (other.outcome.status === 'solved') {
        expect(other.outcome.engine).toBe('ORTOOLS');
        expect(validateSchedule(input, other.outcome.entries)).toEqual([]);
      }
      // Nada de alternativas silenciosas: si OR-Tools falla, el test lo tiene que ver.
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    }, 150_000);
  });
});
