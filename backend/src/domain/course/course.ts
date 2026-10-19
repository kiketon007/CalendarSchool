/** Clase de un curso (un grupo de alumnos: A, B…). */
export interface SchoolClass {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** Tutor de la clase. Siempre `null` hasta que existan los profesores (US09). */
  readonly tutor: null;
}

/** Curso de un colegio con sus clases. */
export interface Course {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly classes: readonly SchoolClass[];
}
