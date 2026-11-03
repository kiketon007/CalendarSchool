import type { UnavailableInterval } from '../professor/availability.js';

/** Una celda de un horario: un día (1, lunes, a 5) y el número de la sesión en la jornada. */
export interface ProblemCell {
  readonly dayOfWeek: number;
  readonly sessionNumber: number;
}

/** Un periodo de la jornada de un calendario, en minutos desde las 00:00. */
export interface ProblemPeriod {
  readonly kind: 'SESSION' | 'BREAK';
  readonly startMinute: number;
  readonly endMinute: number;
}

/** El calendario de un curso: sus periodos en el orden de la jornada, igual de lunes a viernes. */
export interface ProblemCalendar {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly periods: readonly ProblemPeriod[];
}

/** Una referencia a una fila con su nombre. */
export interface ProblemRef {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
}

/** Quién da una asignatura en una clase de su curso. */
export interface ProblemTeacher {
  /** UUIDv7 de la clase. */
  readonly classId: string;
  /** UUIDv7 del profesor. */
  readonly professorId: string;
}

/**
 * Una asignatura impartida en un curso, con todo lo que el motor necesita para colocarla: su carga, sus reglas, sus
 * franjas guardadas (tal como están, aunque ya no existan en el calendario) y quién la da en cada clase.
 */
export interface ProblemSubject {
  /** UUIDv7. */
  readonly subjectId: string;
  readonly subjectName: string;
  /** Una asignatura inactiva no se genera. */
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly sessionsPerWeek: number;
  /** Máximo de sesiones sueltas al día (2 a 5), o `null` sin regla. */
  readonly maxPerDay: number | null;
  /** Tamaño del bloque (2 o 3), o `null` sin regla. */
  readonly blockSize: number | null;
  readonly forbiddenCells: readonly ProblemCell[];
  readonly preferredCells: readonly ProblemCell[];
  readonly teachers: readonly ProblemTeacher[];
}

/** Un curso con su calendario (o `null`), sus clases y sus asignaturas. */
export interface ProblemCourse {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly calendar: ProblemCalendar | null;
  readonly classes: readonly ProblemRef[];
  readonly subjects: readonly ProblemSubject[];
}

/** Un profesor con los tramos en los que no puede dar clase. */
export interface ProblemProfessor {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly unavailable: readonly UnavailableInterval[];
}

/**
 * La «foto del problema» de un colegio (US-ALGO-CHECK): todo lo que hace falta para decidir si se puede generar el
 * horario y, después, para generarlo (US-ALGO-RUN). Son datos en bruto, tal como están guardados: los cálculos (sesiones
 * por día, celdas fuera del calendario, celdas no disponibles) los hace el dominio.
 */
export interface SchedulingProblem {
  readonly courses: readonly ProblemCourse[];
  readonly professors: readonly ProblemProfessor[];
}
