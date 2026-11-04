import { STUCK_AFTER_MS } from '../../domain/schedule/generation.js';
import type { GenerationRepository } from '../../domain/schedule/generationRepository.js';
import { toGenerationView, type GenerationView } from './generationView.js';

/**
 * Caso de uso: la generación en curso del colegio o, si no hay, la última (`null` si nunca se ha generado). Sirve para
 * retomar el progreso al recargar la página (US-ALGO-RUN). Marca antes como interrumpidas las generaciones atascadas,
 * igual que `GetGeneration`.
 */
export class GetCurrentGeneration {
  constructor(
    private readonly dependencies: {
      generationRepository: Pick<GenerationRepository, 'failStuck' | 'findCurrent'>;
      now: () => Date;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<GenerationView | null> {
    const { generationRepository, now } = this.dependencies;
    const current = now();
    await generationRepository.failStuck(
      schoolId,
      new Date(current.getTime() - STUCK_AFTER_MS),
      current,
    );
    const generation = await generationRepository.findCurrent(schoolId);
    return generation === null ? null : toGenerationView(generation);
  }
}
