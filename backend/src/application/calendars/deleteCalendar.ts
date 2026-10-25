import { CalendarNotFound } from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface DeleteCalendarDependencies {
  calendarRepository: Pick<CalendarRepository, 'delete'>;
  logger: ApplicationLogger;
}

export interface DeleteCalendarInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que borra el calendario, de la identidad de la petición. */
  actorId: string;
  calendarId: string;
}

export interface DeletedCalendar {
  id: string;
  /** Cursos que seguían el calendario y han quedado sin calendario. */
  courseCount: number;
}

/**
 * Caso de uso: borra de verdad un calendario del colegio y sus periodos (US-BASE_c). El repositorio lo hace
 * en una transacción con el calendario y sus cursos bloqueados y devuelve cuántos cursos quedaron sin
 * calendario; un calendario de otro colegio, inexistente o ya borrado lanza `CalendarNotFound` (`404`) y no
 * deja traza. `CALENDAR_DELETED` lleva solo identificadores y el recuento, nunca nombres.
 */
export class DeleteCalendar {
  constructor(private readonly dependencies: DeleteCalendarDependencies) {}

  async execute({ schoolId, actorId, calendarId }: DeleteCalendarInput): Promise<DeletedCalendar> {
    const { calendarRepository, logger } = this.dependencies;

    const deleted = await calendarRepository.delete(schoolId, calendarId);
    if (deleted === null) {
      throw new CalendarNotFound();
    }

    logger.info(
      {
        event: 'CALENDAR_DELETED',
        school_id: schoolId,
        actor_id: actorId,
        calendar_id: calendarId,
        course_count: deleted.courseCount,
      },
      'Calendario borrado',
    );
    return { id: calendarId, courseCount: deleted.courseCount };
  }
}
