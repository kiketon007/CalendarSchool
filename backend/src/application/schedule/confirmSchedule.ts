import { ScheduleNotDraft, ScheduleNotFound } from '../../domain/schedule/scheduleErrors.js';
import type { StoredScheduleSummary } from '../../domain/schedule/scheduleRead.js';
import type { ScheduleRepository } from '../../domain/schedule/scheduleRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface ConfirmScheduleInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que confirma, de la identidad de la petición. */
  actorId: string;
  scheduleId: string;
}

/**
 * Caso de uso: confirma el borrador como horario oficial del colegio (US-ALGO-CONFIRM). El repositorio lo hace en una
 * transacción (el oficial vigente pasa a sustituido y el borrador a oficial, con la fecha y el usuario) y solo si el
 * horario es del colegio y sigue siendo borrador: si no existe lanza `ScheduleNotFound` y si ya no es un borrador,
 * `ScheduleNotDraft`, sin cambiar nada. Registra solo identificadores: ningún nombre.
 */
export class ConfirmSchedule {
  constructor(
    private readonly dependencies: {
      scheduleRepository: Pick<ScheduleRepository, 'confirm'>;
      logger: ApplicationLogger;
      now: () => Date;
    },
  ) {}

  async execute({
    schoolId,
    actorId,
    scheduleId,
  }: ConfirmScheduleInput): Promise<StoredScheduleSummary> {
    const { scheduleRepository, logger, now } = this.dependencies;
    const outcome = await scheduleRepository.confirm(schoolId, scheduleId, actorId, now());
    const context = { school_id: schoolId, actor_id: actorId, schedule_id: scheduleId };

    if (outcome.kind !== 'confirmed') {
      logger.warn(
        {
          event: 'SCHEDULE_CONFIRM_REJECTED',
          ...context,
          reason: outcome.kind === 'notFound' ? 'NOT_FOUND' : 'NOT_DRAFT',
        },
        'Confirmación del horario rechazada',
      );
      throw outcome.kind === 'notFound' ? new ScheduleNotFound() : new ScheduleNotDraft();
    }

    logger.info(
      { event: 'SCHEDULE_CONFIRMED', ...context, replaced_schedule_id: outcome.replacedId },
      'Horario confirmado como oficial',
    );
    return outcome.schedule;
  }
}
