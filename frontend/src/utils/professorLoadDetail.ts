import type { Calendar } from '../services/calendarsService';
import type { ProfessorLoadCalendar } from '../services/professorsSummaryService';
import { sessionsOf } from './professorAvailability';

/** La duración de la sesión más corta y de la más larga de un calendario, en minutos. */
export interface SessionLengths {
  shortest: number;
  longest: number;
}

/** El calendario que sigue un curso, con la duración de sus sesiones (`null` si no tiene ninguna válida). */
export interface CourseCalendar {
  calendarName: string;
  lengths: SessionLengths | null;
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * La duración de la sesión más corta y de la más larga de una jornada, sin contar los recreos. Una sesión con horas no
 * válidas se descarta (como en la cuadrícula de disponibilidad). Sin sesiones, `null`.
 */
export function sessionLengthsOf(periods: Calendar['periods']): SessionLengths | null {
  const minutes = sessionsOf(periods).map(({ startMinute, endMinute }) => endMinute - startMinute);
  if (minutes.length === 0) {
    return null;
  }
  return { shortest: Math.min(...minutes), longest: Math.max(...minutes) };
}

/**
 * A cada curso, el nombre de su calendario y la duración de sus sesiones, a partir de los calendarios del colegio (que
 * llevan los cursos que los siguen). Un curso que no está aquí no tiene calendario.
 */
export function lengthsByCourse(
  calendars: readonly Pick<Calendar, 'name' | 'periods' | 'courses'>[],
): Map<string, CourseCalendar> {
  const byCourse = new Map<string, CourseCalendar>();
  for (const { name, periods, courses } of calendars) {
    const lengths = sessionLengthsOf(periods);
    for (const { id } of courses) {
      byCourse.set(id, { calendarName: name, lengths });
    }
  }
  return byCourse;
}

/**
 * El calendario con el que se abre la cuadrícula del detalle: el de mayor carga del profesor y, con empate, el
 * primero por nombre con la comparación del castellano. No modifica la lista.
 */
export function defaultLoadCalendar(
  entries: readonly ProfessorLoadCalendar[],
): ProfessorLoadCalendar | undefined {
  return [...entries].sort(
    (a, b) => b.sessions - a.sessions || collator.compare(a.calendar.name, b.calendar.name),
  )[0];
}
