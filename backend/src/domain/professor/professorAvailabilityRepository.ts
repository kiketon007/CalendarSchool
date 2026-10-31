import type { ProfessorAvailability, UnavailableInterval } from './availability.js';

/** Resultado de guardar la disponibilidad de un profesor. */
export type ReplaceAvailabilityResult =
  /** El profesor no es del colegio (o no existe): no se ha escrito nada. */
  | { readonly kind: 'notFound' }
  /** Lo pedido ya era lo guardado: no se ha escrito nada. */
  | { readonly kind: 'unchanged'; readonly availability: ProfessorAvailability }
  /** Los tramos se han reemplazado; `availability` es lo que quedó guardado. */
  | { readonly kind: 'replaced'; readonly availability: ProfessorAvailability };

/**
 * Puerto de la disponibilidad de los profesores (US-PROF-AVAIL). Todo método recibe el colegio, que sale siempre
 * de la identidad de la petición: un profesor de otro colegio no existe para quien llama.
 */
export interface ProfessorAvailabilityRepository {
  /** Los tramos del profesor ordenados por día y por inicio, o `null` si no es del colegio (o no existe). */
  find(schoolId: string, professorId: string): Promise<ProfessorAvailability | null>;

  /**
   * Deja los tramos del profesor exactamente como `intervals`, que ya llegan normalizados, en una única
   * transacción: bloquea al profesor (`FOR UPDATE`, filtrado por colegio; sin fila devuelve `notFound` sin tocar
   * nada), compara con lo guardado y, solo si difiere, borra sus tramos e inserta los nuevos. Dos guardados del
   * mismo profesor se serializan en su bloqueo y queda el estado entero del último.
   */
  replace(
    schoolId: string,
    professorId: string,
    intervals: readonly UnavailableInterval[],
  ): Promise<ReplaceAvailabilityResult>;
}
