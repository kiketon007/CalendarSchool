import type { SubjectColor, SubjectStatus } from '../subject/subject.js';
import type { WorkloadWarning } from './workloadWarnings.js';

/** Una asignatura del colegio con las sesiones semanales que lleva en el curso (`null` si no se imparte en él). */
export interface WorkloadSubject {
  /** UUIDv7 de la asignatura. */
  readonly id: string;
  readonly name: string;
  /** Código corto tal como se escribió, o `null` si no tiene. */
  readonly code: string | null;
  readonly color: SubjectColor;
  readonly status: SubjectStatus;
  readonly sessionsPerWeek: number | null;
}

/** Calendario base del curso con el número de sesiones de su jornada (los recreos no cuentan). */
export interface WorkloadCalendar {
  /** UUIDv7 del calendario. */
  readonly id: string;
  readonly name: string;
  readonly sessionsPerDay: number;
}

/**
 * Lo que lee el repositorio: el curso, su calendario (o `null`) y **todas** las asignaturas del colegio sin
 * ordenar. Los totales y los avisos los calcula la aplicación (`buildCourseWorkload`).
 */
export interface CourseWorkloadSnapshot {
  readonly course: { readonly id: string; readonly name: string };
  readonly calendar: WorkloadCalendar | null;
  readonly subjects: readonly WorkloadSubject[];
}

/** La carga horaria de un curso (US19) con su balance frente al calendario. */
export interface CourseWorkload extends CourseWorkloadSnapshot {
  /** Suma de las sesiones semanales de las asignaturas que se imparten en el curso. */
  readonly assignedSessions: number;
  /** Sesiones de la semana del calendario (`sesiones al día × 5`), o `null` si el curso no tiene calendario. */
  readonly availableSessions: number | null;
  readonly warnings: readonly WorkloadWarning[];
}

/** Cambio de la carga de una asignatura en un curso: `null` hace que deje de impartirse. */
export interface CourseWorkloadChange {
  /** UUID de la asignatura. */
  readonly subjectId: string;
  /** De 1 a 5, o `null` para quitar la asignatura del curso. */
  readonly sessionsPerWeek: number | null;
}
