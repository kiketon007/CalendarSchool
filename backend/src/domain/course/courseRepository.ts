import type { Course } from './course.js';

/** Clase nueva: el nombre limpio para mostrar y el normalizado para comparar. */
export interface NewClass {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

/** Curso nuevo con todas sus clases, en el orden en que se recibieron. */
export interface NewCourse {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly classes: readonly NewClass[];
}

/**
 * Puerto de los cursos. Todo método recibe el colegio, que sale siempre de la identidad de la petición:
 * un curso de otro colegio no existe para quien llama.
 */
export interface CourseRepository {
  /**
   * Crea el curso y todas sus clases en una única transacción: o se crea todo o no se crea nada.
   * Lanza `CourseAlreadyExists` si el colegio ya tiene un curso con el mismo nombre normalizado.
   */
  create(schoolId: string, course: NewCourse): Promise<Course>;

  /** Cursos del colegio con sus clases, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<Course[]>;
}
