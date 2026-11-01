/** El profesor que tutoriza una clase, con lo mínimo para mostrarlo. */
export interface Tutor {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Clase de un curso (un grupo de alumnos: A, B…). */
export interface SchoolClass {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** Profesor que tutoriza la clase (US09), o `null` si no tiene tutor. */
  readonly tutor: Tutor | null;
  /** Alumnos asignados a esta clase (US14_b). */
  readonly studentCount: number;
  /** Asignaciones de profesores de esta clase (US-PROF-ASSIGN_b). */
  readonly assignmentCount: number;
}

/** Curso de un colegio con sus clases. */
export interface Course {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** Instante de creación, el que guarda la base de datos. */
  readonly createdAt: Date;
  readonly classes: readonly SchoolClass[];
  /**
   * Alumnos del curso, con y sin clase (US14_b). Los que no tienen clase son este número menos la suma
   * de los de sus clases.
   */
  readonly studentCount: number;
}
