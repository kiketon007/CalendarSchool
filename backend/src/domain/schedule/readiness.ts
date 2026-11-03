import { sessionGroupsOf } from '../calendar/sessionGroups.js';
import {
  teachingLoadOf,
  type TeachingAssignment,
  type TeachingCalendar,
} from '../professor/teachingLoad.js';
import {
  preferredSlotsWarnings,
  SCHOOL_DAYS_PER_WEEK,
  subjectWarnings,
  workloadWarnings,
  type SlotCell,
} from '../workload/workloadWarnings.js';
import type {
  ProblemCalendar,
  ProblemCell,
  ProblemProfessor,
  ProblemRef,
  ProblemSubject,
  SchedulingProblem,
} from './schedulingProblem.js';
import { unavailableCellsOf } from './unavailableCells.js';

/** Lo que impide generar el horario, en el orden en que se muestra. */
export const BLOCKING_CODES = [
  'SCHOOL_WITHOUT_COURSES',
  'COURSE_WITHOUT_CALENDAR',
  'WORKLOAD_EXCEEDS_SLOTS',
  'BLOCK_LARGER_THAN_LOAD',
  'SUBJECT_DOES_NOT_FIT',
  'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
  'CLASSES_WITHOUT_PROFESSOR',
  'EXCEEDS_MAX_HOURS',
  'AVAILABILITY_INSUFFICIENT',
] as const;

/** Lo que solo puede empeorar el resultado, en el orden en que se muestra. */
export const WARNING_CODES = [
  'SUBJECT_INACTIVE',
  'COURSE_WITHOUT_CLASSES',
  'COURSE_WITHOUT_SUBJECTS',
  'MAY_EXCEED_MAX_HOURS',
  'SEVERAL_CALENDARS',
  'SLOTS_OUTSIDE_CALENDAR',
  'PREFERRED_SLOTS_FORBIDDEN',
] as const;

export type ReadinessIssueCode = (typeof BLOCKING_CODES)[number] | (typeof WARNING_CODES)[number];

/** Un profesor citado en un problema. */
export interface ReadinessProfessor {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Un problema de la comprobación: su código y, según cuál sea, las referencias y las cifras que lo explican. Debe
 * coincidir con `ReadinessIssue` de `docs/api-spec.yml`.
 */
export interface ReadinessIssue {
  readonly code: ReadinessIssueCode;
  readonly course?: ProblemRef;
  readonly subject?: ProblemRef;
  readonly schoolClass?: ProblemRef;
  readonly calendar?: ProblemRef;
  readonly professor?: ReadinessProfessor;
  readonly classes?: readonly ProblemRef[];
  readonly courses?: readonly ProblemRef[];
  readonly assigned?: number;
  readonly available?: number;
  readonly sessions?: number;
  readonly count?: number;
  readonly missingCount?: number;
}

export interface ScheduleReadiness {
  /** `true` si y solo si no hay bloqueantes. */
  readonly ready: boolean;
  readonly blocking: readonly ReadinessIssue[];
  readonly warnings: readonly ReadinessIssue[];
}

const professorRef = ({ id, firstName, lastName }: ProblemProfessor): ReadinessProfessor => ({
  id,
  firstName,
  lastName,
});

/** Las celdas que existen en un calendario de `sessionsPerDay` sesiones. */
const insideOf = (cells: readonly ProblemCell[], sessionsPerDay: number): ProblemCell[] =>
  cells.filter(
    ({ dayOfWeek, sessionNumber }) =>
      dayOfWeek >= 1 &&
      dayOfWeek <= SCHOOL_DAYS_PER_WEEK &&
      sessionNumber >= 1 &&
      sessionNumber <= sessionsPerDay,
  );

/** El calendario de un curso tal como lo necesita `teachingLoadOf`: solo las sesiones. */
const teachingCalendarOf = ({ id, name, periods }: ProblemCalendar): TeachingCalendar => ({
  id,
  name,
  sessions: periods
    .filter(({ kind }) => kind === 'SESSION')
    .map(({ startMinute, endMinute }) => ({ startMinute, endMinute })),
});

/** Ordena una lista de códigos por su posición, conservando el orden de aparición dentro de cada código. */
function ordered(issues: readonly ReadinessIssue[], codes: readonly ReadinessIssueCode[]) {
  return [...issues].sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code));
}

/**
 * La comprobación previa a generar los horarios (US-ALGO-CHECK): si se puede (`ready`), qué lo impide (`blocking`) y
 * qué solo empeoraría el resultado (`warnings`). Pura, sin dependencias y sin modificar la foto del problema. Reutiliza
 * las reglas que ya usan la carga del curso, las reglas de reparto y el resumen de carga (`workloadWarnings`,
 * `subjectWarnings`, `preferredSlotsWarnings` y `teachingLoadOf`) y añade la combinación de una asignatura con su
 * profesor. Solo cuentan las asignaturas **activas**: una inactiva no se genera, no cuenta en ninguna comprobación y solo
 * da `SUBJECT_INACTIVE`. Que no haya bloqueantes es necesario pero no suficiente para que exista un horario.
 *
 * Los problemas salen en el orden de sus códigos y, dentro de cada uno, por curso, asignatura, clase y profesor.
 *
 * @param compareNames Orden de los nombres (la comparación del castellano de la aplicación, que el dominio no puede
 * importar).
 */
export function readinessOf(
  problem: SchedulingProblem,
  compareNames: (a: string, b: string) => number,
): ScheduleReadiness {
  const byName = (a: { name: string }, b: { name: string }) => compareNames(a.name, b.name);
  const bySubjectName = (a: ProblemSubject, b: ProblemSubject) =>
    compareNames(a.subjectName, b.subjectName);
  const courses = [...problem.courses].sort(byName);
  const professors = [...problem.professors].sort(
    (a, b) => compareNames(a.lastName, b.lastName) || compareNames(a.firstName, b.firstName),
  );
  const professorById = new Map(problem.professors.map((professor) => [professor.id, professor]));

  const blocking: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const inactive = new Map<string, { subject: ProblemRef; courses: ProblemRef[] }>();

  if (courses.length === 0) {
    blocking.push({ code: 'SCHOOL_WITHOUT_COURSES' });
  }

  for (const course of courses) {
    const courseRef: ProblemRef = { id: course.id, name: course.name };
    const subjects = [...course.subjects].sort(bySubjectName);
    const active = subjects.filter(({ status }) => status === 'ACTIVE');
    const classes = [...course.classes].sort(byName);

    for (const subject of subjects.filter(({ status }) => status === 'INACTIVE')) {
      const known = inactive.get(subject.subjectId);
      if (known === undefined) {
        inactive.set(subject.subjectId, {
          subject: { id: subject.subjectId, name: subject.subjectName },
          courses: [courseRef],
        });
      } else {
        known.courses.push(courseRef);
      }
    }

    if (classes.length === 0) {
      warnings.push({ code: 'COURSE_WITHOUT_CLASSES', course: courseRef });
    }

    const { calendar } = course;
    if (calendar === null) {
      if (active.length > 0) {
        blocking.push({ code: 'COURSE_WITHOUT_CALENDAR', course: courseRef });
      }
    } else {
      const groups = sessionGroupsOf(calendar.periods.map(({ kind }) => kind));
      const sessionsPerDay = groups.reduce((total, size) => total + size, 0);
      const day = { sessionGroups: groups };

      if (active.length === 0 && classes.length > 0) {
        warnings.push({ code: 'COURSE_WITHOUT_SUBJECTS', course: courseRef });
      }

      const workload = workloadWarnings({
        assignedSessions: active.reduce((total, { sessionsPerWeek }) => total + sessionsPerWeek, 0),
        availableSessions: sessionsPerDay * SCHOOL_DAYS_PER_WEEK,
      }).find(({ code }) => code === 'WORKLOAD_EXCEEDS_SLOTS');
      if (workload?.code === 'WORKLOAD_EXCEEDS_SLOTS') {
        blocking.push({
          code: 'WORKLOAD_EXCEEDS_SLOTS',
          course: courseRef,
          assigned: workload.assigned,
          available: workload.available,
        });
      }

      for (const subject of active) {
        const subjectRef: ProblemRef = { id: subject.subjectId, name: subject.subjectName };
        const forbidden: SlotCell[] = insideOf(subject.forbiddenCells, sessionsPerDay);
        const preferred: SlotCell[] = insideOf(subject.preferredCells, sessionsPerDay);
        const rules = {
          sessionsPerWeek: subject.sessionsPerWeek,
          maxPerDay: subject.maxPerDay,
          blockSize: subject.blockSize,
        };
        const codes = subjectWarnings(rules, day, { cells: forbidden, outsideCount: 0 }).map(
          ({ code }) => code,
        );

        if (codes.includes('BLOCK_LARGER_THAN_LOAD')) {
          blocking.push({ code: 'BLOCK_LARGER_THAN_LOAD', course: courseRef, subject: subjectRef });
        } else if (codes.includes('SUBJECT_DOES_NOT_FIT')) {
          blocking.push({ code: 'SUBJECT_DOES_NOT_FIT', course: courseRef, subject: subjectRef });
        } else {
          // Cabe con sus reglas: se comprueba clase a clase con las horas en que su profesor no puede.
          for (const schoolClass of classes) {
            const teacher = subject.teachers.find(({ classId }) => classId === schoolClass.id);
            const professor =
              teacher === undefined ? undefined : professorById.get(teacher.professorId);
            if (professor === undefined || professor.unavailable.length === 0) {
              continue;
            }
            const cells = [
              ...forbidden,
              ...unavailableCellsOf(calendar.periods, professor.unavailable),
            ];
            if (
              subjectWarnings(rules, day, { cells, outsideCount: 0 }).some(
                ({ code }) => code === 'SUBJECT_DOES_NOT_FIT',
              )
            ) {
              blocking.push({
                code: 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
                course: courseRef,
                subject: subjectRef,
                schoolClass: { id: schoolClass.id, name: schoolClass.name },
                professor: professorRef(professor),
              });
            }
          }
        }

        const outside =
          subject.forbiddenCells.length -
          forbidden.length +
          (subject.preferredCells.length - preferred.length);
        if (outside > 0) {
          warnings.push({
            code: 'SLOTS_OUTSIDE_CALENDAR',
            course: courseRef,
            subject: subjectRef,
            count: outside,
          });
        }
        const contradiction = preferredSlotsWarnings(preferred, forbidden).find(
          ({ code }) => code === 'PREFERRED_SLOTS_FORBIDDEN',
        );
        if (contradiction?.code === 'PREFERRED_SLOTS_FORBIDDEN') {
          warnings.push({
            code: 'PREFERRED_SLOTS_FORBIDDEN',
            course: courseRef,
            subject: subjectRef,
            count: contradiction.count,
          });
        }
      }
    }

    for (const subject of active) {
      const taught = new Set(subject.teachers.map(({ classId }) => classId));
      const missing = classes.filter(({ id }) => !taught.has(id));
      if (missing.length > 0) {
        blocking.push({
          code: 'CLASSES_WITHOUT_PROFESSOR',
          course: courseRef,
          subject: { id: subject.subjectId, name: subject.subjectName },
          classes: missing.map(({ id, name }) => ({ id, name })),
          missingCount: missing.length,
        });
      }
    }
  }

  for (const professor of professors) {
    const assignments: TeachingAssignment[] = [];
    for (const course of courses) {
      const classIds = new Set(course.classes.map(({ id }) => id));
      const calendar = course.calendar === null ? null : teachingCalendarOf(course.calendar);
      for (const subject of course.subjects.filter(({ status }) => status === 'ACTIVE')) {
        for (const teacher of subject.teachers) {
          if (teacher.professorId === professor.id && classIds.has(teacher.classId)) {
            assignments.push({
              courseId: course.id,
              courseName: course.name,
              calendar,
              sessionsPerWeek: subject.sessionsPerWeek,
            });
          }
        }
      }
    }
    const load = teachingLoadOf(assignments, professor.unavailable, compareNames);
    for (const warning of load.warnings) {
      switch (warning.code) {
        case 'EXCEEDS_MAX_HOURS':
          blocking.push({ code: 'EXCEEDS_MAX_HOURS', professor: professorRef(professor) });
          break;
        case 'AVAILABILITY_INSUFFICIENT':
          blocking.push({
            code: 'AVAILABILITY_INSUFFICIENT',
            professor: professorRef(professor),
            calendar: warning.calendar,
            sessions: warning.sessions,
            available: warning.available,
          });
          break;
        case 'MAY_EXCEED_MAX_HOURS':
          warnings.push({ code: 'MAY_EXCEED_MAX_HOURS', professor: professorRef(professor) });
          break;
        case 'SEVERAL_CALENDARS':
          warnings.push({
            code: 'SEVERAL_CALENDARS',
            professor: professorRef(professor),
            count: warning.calendarCount,
          });
          break;
        case 'COURSE_WITHOUT_CALENDAR':
          // Ya bloquea el curso entero (`COURSE_WITHOUT_CALENDAR`): no se repite por profesor.
          break;
      }
    }
  }

  for (const { subject, courses: inCourses } of [...inactive.values()].sort((a, b) =>
    compareNames(a.subject.name, b.subject.name),
  )) {
    warnings.push({
      code: 'SUBJECT_INACTIVE',
      subject,
      courses: [...inCourses].sort(byName),
    });
  }

  const sortedBlocking = ordered(blocking, BLOCKING_CODES);
  return {
    ready: sortedBlocking.length === 0,
    blocking: sortedBlocking,
    warnings: ordered(warnings, WARNING_CODES),
  };
}
