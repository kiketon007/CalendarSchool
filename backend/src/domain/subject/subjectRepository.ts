import type { Subject, SubjectColor, SubjectStatus, SubjectType } from './subject.js';

/** Curso en el que se impartirá una asignatura nueva, con sus sesiones semanales en él. */
export interface NewSubjectCourse {
  /** UUIDv7 del curso. */
  readonly courseId: string;
  readonly sessionsPerWeek: number;
}

/** Asignatura nueva con los cursos en que se imparte, en el orden en que llegaron. */
export interface NewSubject {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  /** Código limpio, o `null` si no tiene. */
  readonly code: string | null;
  /** Código en minúsculas, o `null` si no tiene. */
  readonly normalizedCode: string | null;
  readonly type: SubjectType;
  readonly status: SubjectStatus;
  readonly description: string | null;
  readonly color: SubjectColor;
  readonly courses: readonly NewSubjectCourse[];
}

/** Estado final de una asignatura editada: lo mismo que una nueva, salvo el identificador, que no cambia. */
export type SubjectChanges = Omit<NewSubject, 'id'>;

/**
 * Puerto de las asignaturas. Todo método recibe el colegio, que sale siempre de la identidad de la
 * petición: una asignatura o un curso de otro colegio no existe para quien llama.
 */
export interface SubjectRepository {
  /**
   * Crea la asignatura y sus filas de `subject_courses` en una única transacción: o se crea todo o no se
   * crea nada. Bloquea los cursos pedidos (`FOR SHARE`) en orden de `id` antes de escribir. Lanza
   * `SubjectCoursesNotFound` si algún curso no es del colegio (antes de escribir nada),
   * `SubjectAlreadyExists` si el colegio ya tiene una asignatura con el mismo nombre normalizado y
   * `SubjectCodeAlreadyExists` si ya tiene una con el mismo código normalizado. Devuelve la asignatura tal
   * como quedó guardada.
   */
  create(schoolId: string, subject: NewSubject): Promise<Subject>;

  /** Asignaturas del colegio con sus cursos, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<Subject[]>;

  /** La asignatura con sus cursos sin ordenar, o `null` si no existe o es de otro colegio. */
  findById(schoolId: string, id: string): Promise<Subject | null>;

  /**
   * Guarda el estado final de la asignatura (US-SUBJECT_b) en una única transacción: bloquea la asignatura
   * (`FOR UPDATE`) y después, en orden de `id`, los cursos pedidos y los que tiene hoy (`FOR SHARE`), y
   * **reemplaza** sus filas de `subject_courses`. Devuelve cómo era y cómo quedó, para registrar qué cambió sin
   * una segunda lectura, o `null` si la asignatura no es del colegio (sin tocar nada). Lanza
   * `SubjectCoursesNotFound` si algún curso pedido no es del colegio, `SubjectAlreadyExists` si otra asignatura
   * del colegio usa el nombre y `SubjectCodeAlreadyExists` si usa el código; la propia asignatura no choca
   * consigo misma. Si algo falla, no cambia nada.
   */
  update(
    schoolId: string,
    id: string,
    changes: SubjectChanges,
  ): Promise<{ before: Subject; after: Subject } | null>;

  /**
   * Borra de verdad la asignatura (US-SUBJECT_c) en una única transacción: bloquea solo su fila (`FOR UPDATE`,
   * filtrada por colegio, sin bloquear los cursos) y la borra; sus filas de `subject_courses` caen por el
   * `ON DELETE CASCADE` de la base de datos y los cursos no se tocan. Devuelve `true` si la borró y `false`
   * si no es del colegio, no existe o ya estaba borrada (sin tocar nada). Si algo falla, no cambia nada.
   */
  delete(schoolId: string, subjectId: string): Promise<boolean>;
}
