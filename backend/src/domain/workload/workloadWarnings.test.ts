import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/subject-warnings.json' with { type: 'json' };
import { subjectWarnings, workloadWarnings } from './workloadWarnings.js';

describe('workloadWarnings', () => {
  it('only warns that there is no calendar when the course has none, even with sessions assigned', () => {
    expect(workloadWarnings({ assignedSessions: 12, availableSessions: null })).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('warns that there is no calendar when nothing is assigned either', () => {
    expect(workloadWarnings({ assignedSessions: 0, availableSessions: null })).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('has no warnings when the load is exactly the available sessions', () => {
    expect(workloadWarnings({ assignedSessions: 30, availableSessions: 30 })).toEqual([]);
  });

  it('has no warnings when the load is below the available sessions', () => {
    expect(workloadWarnings({ assignedSessions: 8, availableSessions: 30 })).toEqual([]);
  });

  it('has no warnings when nothing is assigned to a course with a calendar', () => {
    expect(workloadWarnings({ assignedSessions: 0, availableSessions: 25 })).toEqual([]);
  });

  it('warns with both numbers when the load exceeds the available sessions by one', () => {
    expect(workloadWarnings({ assignedSessions: 31, availableSessions: 30 })).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 31, available: 30 },
    ]);
  });

  it('warns when the calendar is shorter than the load', () => {
    expect(workloadWarnings({ assignedSessions: 28, availableSessions: 25 })).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 28, available: 25 },
    ]);
  });
});

/** Un caso de `test-fixtures/subject-warnings.json`, la tabla que comparten el backend y el frontend. */
interface WarningCase {
  name: string;
  rules: { sessionsPerWeek: number | null; maxPerDay: number | null; blockSize: number | null };
  sessionGroups: number[] | null;
  forbiddenDays?: number[];
  forbiddenCells?: [number, number][];
  free?: [number, number][];
  outsideCount?: number;
  warnings: (string | { code: string; count: number })[];
}

/** Las celdas prohibidas de un caso, solo las que existen en su calendario. */
function cellsOf(testCase: WarningCase): { dayOfWeek: number; sessionNumber: number }[] {
  const sessions = (testCase.sessionGroups ?? []).reduce((total, size) => total + size, 0);
  const cells: { dayOfWeek: number; sessionNumber: number }[] = [];
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
    for (let sessionNumber = 1; sessionNumber <= sessions; sessionNumber += 1) {
      const forbidden = testCase.free
        ? !testCase.free.some(([d, s]) => d === dayOfWeek && s === sessionNumber)
        : (testCase.forbiddenDays ?? []).includes(dayOfWeek) ||
          (testCase.forbiddenCells ?? []).some(([d, s]) => d === dayOfWeek && s === sessionNumber);
      if (forbidden) {
        cells.push({ dayOfWeek, sessionNumber });
      }
    }
  }
  return cells;
}

const expected = (testCase: WarningCase) =>
  testCase.warnings.map((warning) => (typeof warning === 'string' ? { code: warning } : warning));

describe('subjectWarnings', () => {
  it.each(fixtures.cases as WarningCase[])('$name', (testCase) => {
    const calendar =
      testCase.sessionGroups === null ? null : { sessionGroups: testCase.sessionGroups };

    expect(
      subjectWarnings(testCase.rules, calendar, {
        cells: cellsOf(testCase),
        outsideCount: testCase.outsideCount ?? 0,
      }),
    ).toEqual(expected(testCase));
  });

  it('works without the slots argument, as in the matrix of US19_b', () => {
    expect(
      subjectWarnings(
        { sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 },
        { sessionGroups: [2] },
      ),
    ).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });

  it('does not change the cells or the groups it receives', () => {
    const cells = [{ dayOfWeek: 1, sessionNumber: 1 }];
    const sessionGroups = [3, 3];

    subjectWarnings(
      { sessionsPerWeek: 2, maxPerDay: null, blockSize: 2 },
      { sessionGroups },
      { cells, outsideCount: 0 },
    );

    expect(cells).toEqual([{ dayOfWeek: 1, sessionNumber: 1 }]);
    expect(sessionGroups).toEqual([3, 3]);
  });
});
