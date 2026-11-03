import type { SchedulingProblem } from './schedulingProblem.js';

/**
 * Puerto de lectura de la foto del problema (US-ALGO-CHECK). Recibe el colegio, que sale siempre de la identidad de la
 * petición. Solo lee, sin bloqueos: es una foto que se recalcula en cada petición.
 */
export interface SchedulingProblemRepository {
  /** Todos los cursos y los profesores del colegio, sin ordenar. */
  read(schoolId: string): Promise<SchedulingProblem>;
}
