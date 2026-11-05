import { ScheduleNotDraft, ScheduleNotFound } from '../../domain/schedule/scheduleErrors.js';
import type { ScheduleRepository } from '../../domain/schedule/scheduleRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface DiscardScheduleDraftInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que descarta, de la identidad de la petición. */
  actorId: string;
  scheduleId: string;
}

/**
 * Caso de uso: descarta el borrador del colegio (US-ALGO-CONFIRM): lo borra con sus entradas, sin recuperación. Un
 * horario que no es del colegio lanza `ScheduleNotFound` y uno oficial (vigente o sustituido), `ScheduleNotDraft`: un
 * oficial no se borra. Registra solo identificadores: ningún nombre.
 */
export class DiscardScheduleDraft {
  constructor(
    private readonly dependencies: {
      scheduleRepository: Pick<ScheduleRepository, 'discard'>;
      logger: ApplicationLogger;
    },
  ) {}

  async execute({ schoolId, actorId, scheduleId }: DiscardScheduleDraftInput): Promise<void> {
    const { scheduleRepository, logger } = this.dependencies;
    const outcome = await scheduleRepository.discard(schoolId, scheduleId);
    const context = { school_id: schoolId, actor_id: actorId, schedule_id: scheduleId };

    if (outcome.kind !== 'discarded') {
      logger.warn(
        {
          event: 'SCHEDULE_DISCARD_REJECTED',
          ...context,
          reason: outcome.kind === 'notFound' ? 'NOT_FOUND' : 'NOT_DRAFT',
        },
        'Descarte del borrador rechazado',
      );
      throw outcome.kind === 'notFound' ? new ScheduleNotFound() : new ScheduleNotDraft();
    }

    logger.info(
      { event: 'SCHEDULE_DRAFT_DISCARDED', ...context },
      'Borrador de horario descartado',
    );
  }
}
