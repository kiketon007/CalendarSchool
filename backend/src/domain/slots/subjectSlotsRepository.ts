import type { SlotCell } from '../workload/workloadWarnings.js';
import type { SubjectSlotsSnapshot } from './subjectSlots.js';

/** Resultado de guardar las franjas prohibidas de una asignatura en un curso. */
export type ReplaceSlotsResult =
  | {
      readonly kind: 'saved';
      /** `false` si las celdas pedidas ya eran las guardadas: no se ha escrito nada. */
      readonly changed: boolean;
      /** Cuántas celdas quedan guardadas. */
      readonly slotCount: number;
      /** Las franjas tal como quedaron, leídas en la misma transacción. */
      readonly snapshot: SubjectSlotsSnapshot;
    }
  /** El curso o la asignatura no son del colegio, o la asignatura no se imparte en el curso. */
  | { readonly kind: 'notFound' }
  | { readonly kind: 'noCalendar' }
  /** Posiciones (desde 0) de las celdas cuya sesión no existe en el calendario actual; no se ha escrito nada. */
  | { readonly kind: 'outOfCalendar'; readonly positions: readonly number[] };

/**
 * Puerto de las franjas prohibidas (US19_c). Todo método recibe el colegio, que sale siempre de la identidad
 * de la petición: un curso o una asignatura de otro colegio no existe para quien llama.
 */
export interface SubjectSlotsRepository {
  /**
   * Las franjas de la asignatura en el curso con su calendario, o `null` si el curso o la asignatura no son
   * del colegio o la asignatura no se imparte en el curso. Las celdas que no existen en el calendario actual
   * no salen en `cells`, se cuentan en `outsideCount`. No bloquea nada ni cambia nada.
   */
  find(schoolId: string, courseId: string, subjectId: string): Promise<SubjectSlotsSnapshot | null>;

  /**
   * Deja las celdas prohibidas exactamente como `cells` (ya validadas de forma) en una única transacción:
   * bloquea la asignatura (`FOR UPDATE`) y después el curso (`FOR SHARE`), comprueba la pareja y el
   * calendario (sin bloquearlo), crea la regla `FORBIDDEN_SLOTS` si hacía falta y reemplaza sus celdas, o
   * borra la regla con la lista vacía. Las celdas que habían quedado fuera del calendario desaparecen. Una
   * lista igual a lo guardado no escribe nada. Devuelve `notFound`, `noCalendar` u `outOfCalendar` sin
   * escribir. Si algo falla, no cambia nada.
   */
  replace(
    schoolId: string,
    courseId: string,
    subjectId: string,
    cells: readonly SlotCell[],
  ): Promise<ReplaceSlotsResult>;
}
