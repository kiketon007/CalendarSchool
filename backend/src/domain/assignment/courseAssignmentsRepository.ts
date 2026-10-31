import type { AssignmentCell, CourseAssignmentsSnapshot } from './courseAssignments.js';

/** Un campo de una entrada del cuerpo cuya referencia no vale. */
export interface InvalidReference {
  /** Posición (desde 0) de la entrada en el cuerpo. */
  readonly position: number;
  readonly field: 'subjectId' | 'classId' | 'professorId';
}

/** Resultado de guardar la matriz de profesores de un curso. */
export type ReplaceAssignmentsResult =
  /** El curso no es del colegio (o no existe): no se ha escrito nada. */
  | { readonly kind: 'notFound' }
  /** Alguna referencia no vale (asignatura no impartida en el curso, clase de otro curso o profesor de otro colegio). */
  | { readonly kind: 'invalidReferences'; readonly references: readonly InvalidReference[] }
  /** Lo pedido ya era lo guardado: no se ha escrito nada. */
  | { readonly kind: 'unchanged'; readonly assignments: CourseAssignmentsSnapshot }
  /** Se han aplicado las diferencias; `assignments` es lo que quedó guardado. */
  | {
      readonly kind: 'replaced';
      readonly added: number;
      readonly removed: number;
      readonly changed: number;
      readonly assignments: CourseAssignmentsSnapshot;
    };

/**
 * Puerto de las asignaciones de profesores (US-PROF-ASSIGN). Todo método recibe el colegio, que sale siempre de la
 * identidad de la petición: un curso o un profesor de otro colegio no existe para quien llama.
 */
export interface CourseAssignmentsRepository {
  /** La matriz del curso, sin ordenar, o `null` si no es del colegio (o no existe). No bloquea nada. */
  find(schoolId: string, courseId: string): Promise<CourseAssignmentsSnapshot | null>;

  /**
   * Deja las asignaciones del curso exactamente como `wanted` (el estado final; lo que no viene queda sin
   * asignar) en una única transacción: bloquea el curso (`FOR UPDATE`, filtrado por colegio; sin fila devuelve
   * `notFound` sin tocar nada) y, con `FOR SHARE` y en orden de `id`, los profesores que intervienen (los pedidos
   * y los que ya tenían asignaciones en el curso); comprueba las referencias (`invalidReferences` por posición,
   * sin escribir nada) y aplica solo las diferencias, conservando la fecha de creación de las que no cambian.
   * Dos guardados del mismo curso se serializan en su bloqueo y queda el estado entero del último.
   */
  replace(
    schoolId: string,
    courseId: string,
    wanted: readonly AssignmentCell[],
  ): Promise<ReplaceAssignmentsResult>;
}
