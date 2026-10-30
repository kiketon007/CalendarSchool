import type { SubjectColor, SubjectStatus } from '../subject/subject.js';
import type { SlotCell, WorkloadWarning } from './workloadWarnings.js';

/**
 * Una asignatura del colegio con las sesiones semanales que lleva en el curso (`null` si no se imparte en él)
 * y sus reglas de reparto en él (US19_b).
 */
export interface WorkloadSubject {
  /** UUIDv7 de la asignatura. */
  readonly id: string;
  readonly name: string;
  /** Código corto tal como se escribió, o `null` si no tiene. */
  readonly code: string | null;
  readonly color: SubjectColor;
  readonly status: SubjectStatus;
  readonly sessionsPerWeek: number | null;
  /** Máximo de sesiones sueltas al día (2 a 5), o `null` sin regla (como mucho una al día). */
  readonly maxPerDay: number | null;
  /** Tamaño del bloque de sesiones seguidas (2 o 3), o `null` sin regla. */
  readonly blockSize: number | null;
  /** Número de reglas de reparto de la asignatura en el curso (0 si no se imparte). */
  readonly constraintCount: number;
  /**
   * Las celdas prohibidas de la asignatura en el curso que existen en el calendario actual, por día y por
   * sesión; vacía si no se imparte, no tiene franjas o el curso no tiene calendario (US19_c).
   */
  readonly forbiddenSlots: readonly SlotCell[];
  /** Cuántas celdas guardadas ya no existen en el calendario actual (sin calendario, todas). */
  readonly outsideSlotCount: number;
}

/** Calendario base del curso con el número de sesiones de su jornada (los recreos no cuentan). */
export interface WorkloadCalendar {
  /** UUIDv7 del calendario. */
  readonly id: string;
  readonly name: string;
  readonly sessionsPerDay: number;
  /** El tramo más largo de sesiones seguidas de la jornada, sin un recreo entre ellas. */
  readonly maxConsecutiveSessions: number;
  /** Los tamaños de los tramos de sesiones seguidas entre recreos, en orden: suman `sessionsPerDay`. */
  readonly sessionGroups: readonly number[];
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

/**
 * Una asignatura de la carga ya completada con sus avisos en el curso (vacíos si no se imparte). El recuento de
 * celdas fuera del calendario solo sirve para calcular los avisos y no sale en la respuesta.
 */
export interface CourseWorkloadSubject extends Omit<WorkloadSubject, 'outsideSlotCount'> {
  readonly warnings: readonly WorkloadWarning[];
}

/** La carga horaria de un curso (US19) con su balance frente al calendario. */
export interface CourseWorkload extends Omit<CourseWorkloadSnapshot, 'subjects'> {
  /** Todas las asignaturas del colegio por nombre, cada una con sus avisos. */
  readonly subjects: readonly CourseWorkloadSubject[];
  /** Suma de las sesiones semanales de las asignaturas que se imparten en el curso. */
  readonly assignedSessions: number;
  /** Sesiones de la semana del calendario (`sesiones al día × 5`), o `null` si el curso no tiene calendario. */
  readonly availableSessions: number | null;
  readonly warnings: readonly WorkloadWarning[];
}

/**
 * Cambio de la carga de una asignatura en un curso (US19_b): la fila entera con el estado en que debe quedar.
 * `null` en las sesiones hace que deje de impartirse; `null` en una regla la borra.
 */
export interface CourseWorkloadChange {
  /** UUID de la asignatura. */
  readonly subjectId: string;
  /** De 1 a 5, o `null` para quitar la asignatura del curso. */
  readonly sessionsPerWeek: number | null;
  /** De 2 a 5, o `null` sin regla; solo con sesiones. */
  readonly maxPerDay: number | null;
  /** 2 o 3, o `null` sin regla; solo con sesiones. */
  readonly blockSize: number | null;
}
