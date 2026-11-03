import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/schedule-readiness.json' with { type: 'json' };
import type { ProblemRef, SchedulingProblem } from './schedulingProblem.js';
import { readinessOf, type ReadinessIssue } from './readiness.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);

type FixtureIssue = Record<string, unknown>;

interface FixtureSubject {
  name: string;
  status: string;
  sessions: number;
  maxPerDay: number | null;
  blockSize: number | null;
  forbidden: number[][];
  preferred: number[][];
  teachers: Record<string, string>;
}

interface FixtureCase {
  name: string;
  courses: {
    name: string;
    calendar: string | null;
    classes: string[];
    subjects: FixtureSubject[];
  }[];
  professors: { firstName: string; lastName: string; unavailable: number[][] }[];
  expected: { blocking: FixtureIssue[]; warnings: FixtureIssue[] };
}

/** La tabla de casos, con los tipos que el JSON no puede dar. */
const table = fixtures as unknown as {
  calendars: Record<string, { periods: (string | number)[][] }>;
  cases: FixtureCase[];
};

const ref = (prefix: string, name: string): ProblemRef => ({ id: `${prefix}-${name}`, name });
const professorId = (name: string) => `professor-${name}`;
const classId = (course: string, name: string) => `class-${course}-${name}`;
const cells = (list: readonly (readonly number[])[]) =>
  list.map(([dayOfWeek = 0, sessionNumber = 0]) => ({ dayOfWeek, sessionNumber }));

/** El problema de un caso de la tabla, con los identificadores derivados de los nombres. */
function problemOf(testCase: FixtureCase): SchedulingProblem {
  const { calendars } = table;
  return {
    courses: testCase.courses.map((course) => {
      const calendar = course.calendar === null ? undefined : calendars[course.calendar];
      return {
        id: `course-${course.name}`,
        name: course.name,
        calendar:
          course.calendar === null || calendar === undefined
            ? null
            : {
                id: `calendar-${course.calendar}`,
                name: course.calendar,
                periods: calendar.periods.map(([kind, startMinute, endMinute]) => ({
                  kind: kind === 'S' ? ('SESSION' as const) : ('BREAK' as const),
                  startMinute: Number(startMinute),
                  endMinute: Number(endMinute),
                })),
              },
        classes: course.classes.map((name) => ({ id: classId(course.name, name), name })),
        subjects: course.subjects.map((subject) => ({
          subjectId: `subject-${subject.name}`,
          subjectName: subject.name,
          status: subject.status as 'ACTIVE' | 'INACTIVE',
          sessionsPerWeek: subject.sessions,
          maxPerDay: subject.maxPerDay,
          blockSize: subject.blockSize,
          forbiddenCells: cells(subject.forbidden),
          preferredCells: cells(subject.preferred),
          teachers: Object.entries(subject.teachers).map(([name, teacher]) => ({
            classId: classId(course.name, name),
            professorId: professorId(teacher),
          })),
        })),
      };
    }),
    professors: testCase.professors.map(({ firstName, lastName, unavailable }) => ({
      id: professorId(`${firstName} ${lastName}`),
      firstName,
      lastName,
      unavailable: unavailable.map(([dayOfWeek = 0, startMinute = 0, endMinute = 0]) => ({
        dayOfWeek,
        startMinute,
        endMinute,
      })),
    })),
  };
}

/** Un problema esperado de la tabla (que cita todo por nombre) con la forma del dominio. */
function issueOf(issue: FixtureIssue): ReadinessIssue {
  const { code, course, subject, schoolClass, calendar, professor, classes, courses, ...numbers } =
    issue as {
      code: ReadinessIssue['code'];
      course?: string;
      subject?: string;
      schoolClass?: string;
      calendar?: string;
      professor?: string;
      classes?: string[];
      courses?: string[];
    } & Record<string, number>;
  return {
    code,
    ...(course === undefined ? {} : { course: ref('course', course) }),
    ...(subject === undefined ? {} : { subject: ref('subject', subject) }),
    ...(schoolClass === undefined || course === undefined
      ? {}
      : { schoolClass: { id: classId(course, schoolClass), name: schoolClass } }),
    ...(calendar === undefined ? {} : { calendar: ref('calendar', calendar) }),
    ...(professor === undefined
      ? {}
      : {
          professor: {
            id: professorId(professor),
            firstName: professor.split(' ')[0] ?? '',
            lastName: professor.split(' ').slice(1).join(' '),
          },
        }),
    ...(classes === undefined || course === undefined
      ? {}
      : { classes: classes.map((name) => ({ id: classId(course, name), name })) }),
    ...(courses === undefined ? {} : { courses: courses.map((name) => ref('course', name)) }),
    ...numbers,
  };
}

describe('readinessOf', () => {
  describe.each(table.cases)('table of cases', (testCase) => {
    it(testCase.name, () => {
      const result = readinessOf(problemOf(testCase), compareNames);

      expect(result.blocking).toEqual(testCase.expected.blocking.map(issueOf));
      expect(result.warnings).toEqual(testCase.expected.warnings.map(issueOf));
      expect(result.ready).toBe(testCase.expected.blocking.length === 0);
    });
  });

  it('covers the seventeen codes with the table', () => {
    const codes = new Set(
      table.cases.flatMap(({ expected }) =>
        [...expected.blocking, ...expected.warnings].map(({ code }) => code),
      ),
    );

    expect(codes.size).toBe(17);
  });

  it('does not depend on the order of the courses, the subjects or the professors', () => {
    const testCase = table.cases.at(-1) as FixtureCase;
    const problem = problemOf(testCase);
    const reversed: SchedulingProblem = {
      courses: [...problem.courses].reverse().map((course) => ({
        ...course,
        subjects: [...course.subjects].reverse(),
      })),
      professors: [...problem.professors].reverse(),
    };

    expect(readinessOf(reversed, compareNames)).toEqual(readinessOf(problem, compareNames));
  });

  it('does not change what it receives', () => {
    const problem = problemOf(table.cases.at(-1) as FixtureCase);
    const before = structuredClone(problem);

    readinessOf(problem, compareNames);

    expect(problem).toEqual(before);
  });
});
