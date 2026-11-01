import type { ProfessorSubject } from '../assignment/courseAssignments.js';
import type { UnavailableInterval } from './availability.js';
import type { TeachingCalendar } from './teachingLoad.js';

/** Un profesor con lo que necesita el resumen de carga: lo que imparte y cuándo no puede dar clase. */
export interface SummaryProfessor {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Una entrada por asignatura y clase, sin ordenar. */
  readonly subjects: readonly ProfessorSubject[];
  /** Sus tramos no disponibles guardados. */
  readonly unavailable: readonly UnavailableInterval[];
}

/** Una asignatura que se imparte en un curso y a cuántas clases del curso se ha asignado profesor. */
export interface SummaryCourseSubject {
  /** UUIDv7. */
  readonly subjectId: string;
  /** Asignaciones de la asignatura en las clases del curso (de 0 al número de clases). */
  readonly assignmentCount: number;
}

/** Un curso con lo que necesita el resumen de carga. */
export interface SummaryCourse {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** El calendario que sigue, con las sesiones de un día, o `null` si no tiene. */
  readonly calendar: TeachingCalendar | null;
  readonly classCount: number;
  /** Las asignaturas que se imparten en el curso. */
  readonly subjects: readonly SummaryCourseSubject[];
}

/** Lo que lee el resumen de carga de un colegio (US-PROF-SUMMARY), sin ordenar. */
export interface ProfessorsSummarySnapshot {
  readonly professors: readonly SummaryProfessor[];
  readonly courses: readonly SummaryCourse[];
}

/**
 * Puerto de lectura del resumen de carga de los profesores (US-PROF-SUMMARY). Recibe el colegio, que sale siempre de
 * la identidad de la petición. Solo lee, sin bloqueos: es una foto que se recalcula en cada petición.
 */
export interface ProfessorsSummaryRepository {
  /** Todos los profesores del colegio (también los que no tienen asignaciones) y todos sus cursos. */
  read(schoolId: string): Promise<ProfessorsSummarySnapshot>;
}
