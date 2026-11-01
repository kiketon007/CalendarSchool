import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/teaching-load.json' with { type: 'json' };
import {
  MAX_TEACHING_MINUTES,
  teachingLoadOf,
  type TeachingAssignment,
  type TeachingCalendar,
  type TeachingLoadWarning,
} from './teachingLoad.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);

type FixtureCase = (typeof fixtures.cases)[number];
type FixtureWarning = FixtureCase['expected']['warnings'][number];

/** Los calendarios de la tabla, con el nombre como identificador. */
const calendars: Record<string, TeachingCalendar> = Object.fromEntries(
  Object.entries(fixtures.calendars).map(([name, { daySessions }]) => [
    name,
    {
      id: `calendar-${name}`,
      name,
      sessions: daySessions.map(([startMinute, endMinute]) => ({
        startMinute: startMinute as number,
        endMinute: endMinute as number,
      })),
    },
  ]),
);

function assignmentsOf(testCase: FixtureCase): TeachingAssignment[] {
  return testCase.assignments.map(({ course, calendar, sessionsPerWeek }) => ({
    courseId: `course-${course}`,
    courseName: course,
    calendar: calendar === null ? null : (calendars[calendar] ?? null),
    sessionsPerWeek,
  }));
}

/** Un aviso de la tabla (que cita calendarios y cursos por su nombre) con la forma del dominio. */
function warningOf(warning: FixtureWarning): TeachingLoadWarning {
  const { code } = warning;
  if (code === 'AVAILABILITY_INSUFFICIENT') {
    const { calendar, sessions, available } = warning as {
      calendar: string;
      sessions: number;
      available: number;
    };
    return {
      code,
      calendar: { id: `calendar-${calendar}`, name: calendar },
      sessions,
      available,
    };
  }
  if (code === 'COURSE_WITHOUT_CALENDAR') {
    const { course, assignmentCount } = warning as { course: string; assignmentCount: number };
    return { code, course: { id: `course-${course}`, name: course }, assignmentCount };
  }
  if (code === 'SEVERAL_CALENDARS') {
    return { code, calendarCount: (warning as { calendarCount: number }).calendarCount };
  }
  return { code } as TeachingLoadWarning;
}

describe('teachingLoadOf', () => {
  it('uses the maximum of the table, 23 hours in minutes', () => {
    expect(MAX_TEACHING_MINUTES).toBe(1380);
    expect(fixtures.maxTeachingMinutes).toBe(MAX_TEACHING_MINUTES);
  });

  describe.each(fixtures.cases)('table of cases', (testCase) => {
    it(testCase.name, () => {
      const result = teachingLoadOf(assignmentsOf(testCase), testCase.unavailable, compareNames);

      expect(result).toEqual({
        sessionsPerWeek: testCase.expected.sessionsPerWeek,
        minMinutes: testCase.expected.minMinutes,
        maxMinutes: testCase.expected.maxMinutes,
        status: testCase.expected.status,
        warnings: testCase.expected.warnings.map(warningOf),
      });
    });
  });

  it('does not depend on the order of the assignments', () => {
    const testCase = fixtures.cases.at(-1) as FixtureCase;
    const assignments = assignmentsOf(testCase);

    const forward = teachingLoadOf(assignments, testCase.unavailable, compareNames);
    const backward = teachingLoadOf([...assignments].reverse(), testCase.unavailable, compareNames);

    expect(backward).toEqual(forward);
  });

  it('does not modify its arguments', () => {
    const testCase = fixtures.cases.at(-1) as FixtureCase;
    const assignments = assignmentsOf(testCase);
    const unavailable = testCase.unavailable.map((interval) => ({ ...interval }));
    const before = structuredClone({ assignments, unavailable });

    teachingLoadOf(assignments, unavailable, compareNames);

    expect({ assignments, unavailable }).toEqual(before);
  });
});
