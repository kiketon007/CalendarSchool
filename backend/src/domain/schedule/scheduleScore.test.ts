import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/schedule-score.json' with { type: 'json' };
import {
  problemOf,
  type FixtureCalendars,
  type FixtureCourse,
  type FixtureProfessor,
} from '../../../test/support/scheduleProblemFixtures.js';
import { generationInputOf } from './generationInput.js';
import { SCORE_WEIGHTS, isScheduleScore, scoreSchedule } from './scheduleScore.js';
import type { GenerationInput, ScheduleEntry } from './scheduleSolver.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);

interface ScoreCase {
  name: string;
  courses: FixtureCourse[];
  professors: FixtureProfessor[];
  entries: (string | number)[][];
  expected: {
    total: number;
    preferredMisses: number;
    preferredTotal: number;
    professorGaps: number;
    consecutiveDays: number;
  };
}
const table = fixtures as unknown as { calendars: FixtureCalendars; cases: ScoreCase[] };

/** Las entradas de un caso, con la hora de la celda de su curso y el profesor de su lección. */
function entriesOf(input: GenerationInput, testCase: ScoreCase): ScheduleEntry[] {
  return testCase.entries.map(([courseName, className, subjectName, day, session, flag]) => {
    const lesson = input.lessons.find(
      (candidate) =>
        candidate.courseName === courseName &&
        candidate.className === className &&
        candidate.subjectName === subjectName,
    );
    const cell = input.courses
      .find(({ id }) => id === lesson?.courseId)
      ?.cells.find(({ sessionNumber }) => sessionNumber === session);
    if (lesson === undefined || cell === undefined) {
      throw new Error(`no existe ${String(courseName)} ${String(subjectName)} ${String(session)}`);
    }
    return {
      courseId: lesson.courseId,
      classId: lesson.classId,
      subjectId: lesson.subjectId,
      professorId: flag === 'no-professor' ? '' : lesson.professorId,
      dayOfWeek: Number(day),
      sessionNumber: Number(session),
      startMinute: cell.startMinute,
      endMinute: cell.endMinute,
    };
  });
}

describe('scoreSchedule', () => {
  describe.each(table.cases)('table of cases', (testCase) => {
    it(testCase.name, () => {
      const input = generationInputOf(
        problemOf(table.calendars, testCase.courses, testCase.professors),
        compareNames,
      );

      const score = scoreSchedule(input, entriesOf(input, testCase));

      expect(score).toEqual({ ...testCase.expected, initialTotal: testCase.expected.total });
    });
  });

  it('weighs the preferred cells above the gaps and the gaps above the consecutive days', () => {
    expect(SCORE_WEIGHTS).toEqual({ preferredMiss: 10, professorGap: 3, consecutiveDay: 1 });
  });

  it('scores an empty schedule as zero', () => {
    const input = generationInputOf(problemOf(table.calendars, [], []), compareNames);

    expect(scoreSchedule(input, [])).toEqual({
      total: 0,
      preferredMisses: 0,
      preferredTotal: 0,
      professorGaps: 0,
      consecutiveDays: 0,
      initialTotal: 0,
    });
  });
});

describe('isScheduleScore', () => {
  const valid = {
    total: 134,
    preferredMisses: 8,
    preferredTotal: 50,
    professorGaps: 18,
    consecutiveDays: 6,
    initialTotal: 220,
  };

  it('accepts the six non-negative integers', () => {
    expect(isScheduleScore(valid)).toBe(true);
    expect(isScheduleScore({ ...valid, total: 0, initialTotal: 0 })).toBe(true);
  });

  it.each([
    ['a missing field', { ...valid, total: undefined }],
    ['a negative number', { ...valid, professorGaps: -1 }],
    ['a decimal', { ...valid, consecutiveDays: 1.5 }],
    ['a text', { ...valid, preferredTotal: '50' }],
    ['a not finite number', { ...valid, initialTotal: Infinity }],
    ['an extra field', { ...valid, extra: 1 }],
    ['null', null],
    ['an array', [valid]],
    ['a text instead of an object', 'score'],
    ['a number', 3],
  ])('rejects %s', (_name, value) => {
    expect(isScheduleScore(value)).toBe(false);
  });
});
