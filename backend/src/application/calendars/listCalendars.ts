import type { Calendar } from '../../domain/calendar/calendar.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import { byName } from '../courses/courseOrdering.js';

/**
 * Caso de uso: lista los calendarios de un colegio con sus periodos y los cursos que los siguen (US-BASE).
 * Los calendarios van ordenados por nombre y, los cursos de cada uno, en orden natural («2º» antes que
 * «10º»), con la comparación del castellano de `courseOrdering`: la colación de PostgreSQL depende de cómo
 * se creó la base de datos, así que el orden es de la aplicación. Los periodos conservan el orden del día.
 * El colegio lo toma el router de la identidad de la petición y nunca de lo que envía el cliente.
 */
export class ListCalendars {
  constructor(
    private readonly dependencies: {
      calendarRepository: Pick<CalendarRepository, 'listBySchool'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<Calendar[]> {
    const calendars = await this.dependencies.calendarRepository.listBySchool(schoolId);
    return calendars
      .map((calendar) => ({ ...calendar, courses: [...calendar.courses].sort(byName) }))
      .sort(byName);
  }
}
