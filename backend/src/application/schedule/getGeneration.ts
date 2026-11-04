import { STUCK_AFTER_MS } from '../../domain/schedule/generation.js';
import { GenerationNotFound } from '../../domain/schedule/generationErrors.js';
import type { GenerationRepository } from '../../domain/schedule/generationRepository.js';
import { toGenerationView, type GenerationView } from './generationView.js';

/**
 * Caso de uso: el estado y el progreso de una generación del colegio (US-ALGO-RUN). Antes de leerla marca como
 * interrumpidas las generaciones atascadas del colegio (`RUNNING` sin latido, o `QUEUED` sin reclamar, desde hace más
 * de 90 segundos), así que quien consulta ve `FAILED` en lugar de una barra parada para siempre. Una generación que no
 * es del colegio, que no existe o cuyo id no es un UUID lanza `GenerationNotFound`, sin distinguir el caso. El colegio
 * lo toma el router de la identidad de la petición.
 */
export class GetGeneration {
  constructor(
    private readonly dependencies: {
      generationRepository: Pick<GenerationRepository, 'failStuck' | 'findById'>;
      now: () => Date;
    },
  ) {}

  async execute({
    schoolId,
    generationId,
  }: {
    schoolId: string;
    generationId: string;
  }): Promise<GenerationView> {
    const { generationRepository, now } = this.dependencies;
    const current = now();
    await generationRepository.failStuck(
      schoolId,
      new Date(current.getTime() - STUCK_AFTER_MS),
      current,
    );
    const generation = await generationRepository.findById(schoolId, generationId);
    if (generation === null) {
      throw new GenerationNotFound();
    }
    return toGenerationView(generation);
  }
}
