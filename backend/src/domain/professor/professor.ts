/** Cargo de un profesor. Es informativo y no concede permisos en la aplicación (PRD §3.2). */
export type ProfessorPosition = 'DIRECTOR' | 'JEFE_ESTUDIOS';

/** La clase que tutoriza un profesor, con el curso al que pertenece. */
export interface TutoredClass {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly courseId: string;
  readonly courseName: string;
}

/** Profesor de un colegio: un registro del colegio, no una cuenta. */
export interface Professor {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly position: ProfessorPosition | null;
  /** Asignaturas que imparte. Siempre vacío hasta que existan las asignaturas (`US-PROF-ASSIGN`). */
  readonly subjects: readonly [];
  /** Clase que tutoriza, o `null` si no tutoriza ninguna (como mucho una). */
  readonly tutoredClass: TutoredClass | null;
}

/** Profesor nuevo, con los nombres ya limpios y su identificador. */
export interface NewProfessor {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly position: ProfessorPosition | null;
}
