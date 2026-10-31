import type { ConstraintListSnapshot } from './constraintList.js';

/**
 * Puerto del listado de reglas de reparto (US20). El colegio sale siempre de la identidad de la petición: las
 * reglas de otro colegio no existen para quien llama.
 */
export interface ConstraintListRepository {
  /**
   * Todas las parejas asignatura-curso del colegio que tienen alguna regla, con el calendario resumido de su
   * curso y todas las reglas con sus celdas, sin ordenar. Una sola lectura, sin bloquear nada.
   */
  listBySchool(schoolId: string): Promise<ConstraintListSnapshot>;
}
