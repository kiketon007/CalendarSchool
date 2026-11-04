import type { ProblemRef, SchedulingProblem } from '../../src/domain/schedule/schedulingProblem.js';

/** Una asignatura de una tabla de casos: todo por nombre, con las celdas como pares `[día, sesión]`. */
export interface FixtureSubject {
  name: string;
  status: string;
  sessions: number;
  maxPerDay: number | null;
  blockSize: number | null;
  forbidden: number[][];
  preferred: number[][];
  /** Nombre de la clase → nombre del profesor. */
  teachers: Record<string, string>;
}

export interface FixtureCourse {
  name: string;
  calendar: string | null;
  classes: string[];
  subjects: FixtureSubject[];
}

/** Un profesor de una tabla de casos, con sus tramos como `[día, inicio, fin]` en minutos. */
export interface FixtureProfessor {
  firstName: string;
  lastName: string;
  unavailable: number[][];
}

/** Calendarios de una tabla de casos: periodos `[S|B, inicio, fin]`, iguales de lunes a viernes. */
export type FixtureCalendars = Record<string, { periods: (string | number)[][] }>;

export const ref = (prefix: string, name: string): ProblemRef => ({
  id: `${prefix}-${name}`,
  name,
});
export const professorId = (name: string) => `professor-${name}`;
export const classId = (course: string, name: string) => `class-${course}-${name}`;

const cells = (list: readonly (readonly number[])[]) =>
  list.map(([dayOfWeek = 0, sessionNumber = 0]) => ({ dayOfWeek, sessionNumber }));

/** El problema de un caso de una tabla, con los identificadores derivados de los nombres. */
export function problemOf(
  calendars: FixtureCalendars,
  courses: readonly FixtureCourse[],
  professors: readonly FixtureProfessor[],
): SchedulingProblem {
  return {
    courses: courses.map((course) => {
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
    professors: professors.map(({ firstName, lastName, unavailable }) => ({
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

/** Una asignatura activa con los valores por defecto, para escribir casos a mano. */
export const subject = (
  name: string,
  sessions: number,
  teachers: Record<string, string>,
  extra: Partial<FixtureSubject> = {},
): FixtureSubject => ({
  name,
  status: 'ACTIVE',
  sessions,
  maxPerDay: null,
  blockSize: null,
  forbidden: [],
  preferred: [],
  teachers,
  ...extra,
});

/** Un profesor `Nombre Apellido` sin tramos no disponibles, o con ellos. */
export const professor = (fullName: string, unavailable: number[][] = []): FixtureProfessor => {
  const [firstName = '', ...rest] = fullName.split(' ');
  return { firstName, lastName: rest.join(' '), unavailable };
};
