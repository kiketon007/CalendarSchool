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
}

/** Curso de un colegio con sus clases. */
export interface Course {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** Instante de creación, el que guarda la base de datos. */
  readonly createdAt: Date;
  readonly classes: readonly SchoolClass[];
}
