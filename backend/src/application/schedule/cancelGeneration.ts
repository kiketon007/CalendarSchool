import {
  GenerationNotCancellable,
  GenerationNotFound,
} from '../../domain/schedule/generationErrors.js';
import type { GenerationRepository } from '../../domain/schedule/generationRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { toGenerationView, type GenerationView } from './generationView.js';

export interface CancelGenerationInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que cancela, de la identidad de la petición. */
  actorId: string;
  generationId: string;
}

/**
 * Caso de uso: pide cancelar una generación `QUEUED` o `RUNNING` del colegio (US-ALGO-RUN). Si seguía en cola pasa
 * directamente a `CANCELLED` (el worker no la reclamará); si corría, queda marcada y el worker detiene la búsqueda en
 * unos segundos y es él quien la deja `CANCELLED` y lo registra. Devuelve la generación tal como está en ese momento.
 * Una ya terminada lanza `GenerationNotCancellable` y una que no es del colegio, `GenerationNotFound`. Registra solo
 * identificadores y cifras: ningún nombre.
 */
export class CancelGeneration {
  constructor(
    private readonly dependencies: {
      generationRepository: Pick<GenerationRepository, 'requestCancel'>;
      logger: ApplicationLogger;
      now: () => Date;
    },
  ) {}

  async execute({
    schoolId,
    actorId,
    generationId,
  }: CancelGenerationInput): Promise<GenerationView> {
    const { generationRepository, logger, now } = this.dependencies;

    const outcome = await generationRepository.requestCancel(schoolId, generationId, now());
    if (outcome.kind === 'notFound') {
      throw new GenerationNotFound();
    }
    if (outcome.kind === 'notCancellable') {
      throw new GenerationNotCancellable();
    }

    const { generation } = outcome;
    const context = {
      school_id: schoolId,
      actor_id: actorId,
      generation_id: generation.id,
    };
    if (generation.status === 'CANCELLED') {
      logger.info(
        {
          event: 'SCHEDULE_GENERATION_CANCELLED',
          ...context,
          placed: generation.placed,
          total: generation.total,
          duration_ms: (generation.finishedAt ?? now()).getTime() - generation.createdAt.getTime(),
          error_code: null,
        },
        'Generación de horarios cancelada antes de empezar',
      );
    } else {
      logger.info(
        { event: 'SCHEDULE_GENERATION_CANCEL_REQUESTED', ...context },
        'Cancelación de la generación de horarios solicitada',
      );
    }
    return toGenerationView(generation);
  }
}
