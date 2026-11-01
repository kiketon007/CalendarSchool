import type { ProfessorSubject } from '../assignment/courseAssignments.js';
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
  /** Lo que tiene asignado (US-PROF-ASSIGN): una entrada por asignatura y clase, en orden natural. */
  readonly subjects: readonly ProfessorSubject[];
  /** Número de tramos no disponibles guardados (US-PROF-AVAIL), ya normalizados; 0 si está disponible siempre. */
  readonly unavailableCount: number;
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

/** Nombre de un profesor, para nombrar al que pierde una tutoría sin devolver todos sus datos. */
export interface ProfessorName {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Estado final que se guarda al editar un profesor, con los nombres ya limpios. */
export interface ProfessorChanges {
  readonly firstName: string;
  readonly lastName: string;
  readonly position: ProfessorPosition | null;
  /**
   * Clase que tutorizará: un UUID la asigna, `null` deja al profesor sin clase y `undefined` (ausente)
   * no toca la tutoría actual.
   */
  readonly classId?: string | null;
}

/**
 * Lo que se borró con un profesor: la clase que tutorizaba y que ha quedado sin tutor, si tenía, y el número de
 * asignaciones que caen con él (US-PROF-ASSIGN_b), que solo va al log.
 */
export interface DeletedProfessor {
  readonly assignmentCount: number;
  readonly freedClass: {
    /** UUIDv7. */
    readonly id: string;
    readonly name: string;
    readonly courseName: string;
  } | null;
}

/** Resultado de editar un profesor: cómo estaba, cómo queda y quién perdió la tutoría, si alguien. */
export interface ProfessorUpdate {
  readonly before: Professor;
  readonly after: Professor;
  /** El profesor que tenía la clase elegida y la pierde, o `null` si estaba libre o no cambió. */
  readonly replacedTutor: ProfessorName | null;
}
