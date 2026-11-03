import { readinessOf, type ScheduleReadiness } from '../../domain/schedule/readiness.js';
import type { SchedulingProblemRepository } from '../../domain/schedule/schedulingProblemRepository.js';
import { compareText } from '../courses/courseOrdering.js';

/**
 * Caso de uso: comprueba si se pueden generar los horarios del colegio (US-ALGO-CHECK). Es una lectura: no registra
 * eventos y no cambia nada. Lee la foto del problema y la comprueba con `readinessOf`, ordenando los nombres con la
 * comparación del castellano. El colegio lo toma el router de la identidad de la petición y nunca de lo que envía el
 * cliente; un fallo de la base de datos llega tal cual al manejador de errores.
 */
export class GetScheduleReadiness {
  constructor(
    private readonly dependencies: {
      schedulingProblemRepository: Pick<SchedulingProblemRepository, 'read'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<ScheduleReadiness> {
    const problem = await this.dependencies.schedulingProblemRepository.read(schoolId);
    return readinessOf(problem, compareText);
  }
}
