/** Tipos de asignatura: troncal, optativa y propia del centro. */
export const SUBJECT_TYPES = ['CORE', 'ELECTIVE', 'CUSTOM'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/**
 * Estados de una asignatura. Por ahora solo se guarda y se filtra: lo que implica estar inactiva (no
 * ofrecerla al asignar profesores ni al generar horarios) llega con esas historias.
 */
export const SUBJECT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

/**
 * Paleta cerrada de colores de una asignatura en el horario, en el orden en que se proponen. Son claves, no
 * colores: el fondo y el texto de cada una (con contraste AA) los define el frontend. Debe coincidir con el
 * enum `SubjectColor` del contrato y de la base de datos.
 */
export const SUBJECT_COLORS = [
  'blue',
  'indigo',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'brown',
  'gray',
] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

/** Sesiones semanales mínimas y máximas de una asignatura en un curso. */
export const MIN_SESSIONS_PER_WEEK = 1;
export const MAX_SESSIONS_PER_WEEK = 5;

/** Curso en el que se imparte una asignatura, con sus sesiones semanales en él. */
export interface SubjectCourse {
  /** UUIDv7 del curso. */
  readonly id: string;
  readonly name: string;
  readonly sessionsPerWeek: number;
  /** Número de reglas de reparto de la asignatura en este curso, de cualquier tipo (US19_b). */
  readonly constraintCount: number;
}

/** Asignatura de un colegio (US-SUBJECT) con los cursos en los que se imparte. */
export interface Subject {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** Código corto tal como se escribió, o `null` si no tiene (nunca una cadena vacía). */
  readonly code: string | null;
  readonly type: SubjectType;
  readonly status: SubjectStatus;
  /** Descripción opcional, o `null` si no tiene. */
  readonly description: string | null;
  readonly color: SubjectColor;
  /** Cursos en los que se imparte, sin ordenar; puede estar vacía si se borraron todos. */
  readonly courses: readonly SubjectCourse[];
  /** Instante de creación, el que guarda la base de datos. */
  readonly createdAt: Date;
}
