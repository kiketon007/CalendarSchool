import type { Calendar } from '../../domain/calendar/calendar.js';
import { CalendarNotFound } from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import { byName } from '../courses/courseOrdering.js';

export interface GetCalendarInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  calendarId: string;
}

/**
 * Caso de uso: devuelve un calendario del colegio con sus periodos en orden y los cursos que lo siguen en
 * orden natural (US-BASE_b). Uno de otro colegio o inexistente lanza `CalendarNotFound`, sin distinguir el
 * caso (`404`). No registra nada: leer no deja evento.
 */
export class GetCalendar {
  constructor(
    private readonly dependencies: { calendarRepository: Pick<CalendarRepository, 'findById'> },
  ) {}

  async execute({ schoolId, calendarId }: GetCalendarInput): Promise<Calendar> {
    const calendar = await this.dependencies.calendarRepository.findById(schoolId, calendarId);
    if (calendar === null) {
      throw new CalendarNotFound();
    }
    return { ...calendar, courses: [...calendar.courses].sort(byName) };
  }
}
