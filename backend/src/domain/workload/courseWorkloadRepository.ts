import type { CourseWorkloadChange, CourseWorkloadSnapshot } from './courseWorkload.js';

/** Resultado de aplicar los cambios de la carga de un curso. */
export type ApplyWorkloadChangesResult =
  | {
      readonly kind: 'applied';
      /** Asignaturas que pasan a impartirse en el curso. */
      readonly added: number;
      /** Asignaturas que dejan de impartirse en el curso. */
      readonly removed: number;
      /** Asignaturas que ya se impartían y cambian de sesiones. */
      readonly changed: number;
      /** La carga tal como quedó, leída en la misma transacción. */
      readonly workload: CourseWorkloadSnapshot;
    }
  | { readonly kind: 'courseNotFound' }
  /** Posiciones (desde 0) de `changes` cuya asignatura no es del colegio; no se ha escrito nada. */
  | { readonly kind: 'subjectsNotFound'; readonly positions: readonly number[] };

/**
 * Puerto de la carga horaria de un curso (US19). Todo método recibe el colegio, que sale siempre de la
 * identidad de la petición: un curso o una asignatura de otro colegio no existe para quien llama.
 */
export interface CourseWorkloadRepository {
  /**
   * El curso con su calendario (o `null`) y todas las asignaturas del colegio sin ordenar, o `null` si el
   * curso no es del colegio o no existe. No bloquea nada.
   */
  findByCourse(schoolId: string, courseId: string): Promise<CourseWorkloadSnapshot | null>;

  /**
   * Aplica **solo** los cambios recibidos en una única transacción: bloquea las asignaturas de `changes`
   * (`FOR UPDATE`, en orden de `id`) y después el curso (`FOR SHARE`), y crea, actualiza o borra las filas de
   * `subject_courses` de esas asignaturas en el curso sin tocar las demás (las actualizadas conservan su
   * `created_at`). Un `null` sobre una asignatura que no se imparte en el curso no cambia nada. Devuelve
   * `courseNotFound` si el curso no es del colegio (sin escribir) y `subjectsNotFound` si alguna asignatura
   * no lo es (sin escribir). Si algo falla, no cambia nada. No bloquea el calendario.
   */
  applyChanges(
    schoolId: string,
    courseId: string,
    changes: readonly CourseWorkloadChange[],
  ): Promise<ApplyWorkloadChangesResult>;
}
