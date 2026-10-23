import type { Calendar, CalendarPeriod } from './calendar.js';

/** Calendario nuevo con todos sus periodos, en el orden del día. */
export interface NewCalendar {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly periods: readonly CalendarPeriod[];
}

/**
 * Puerto de los calendarios. Todo método recibe el colegio, que sale siempre de la identidad de la
 * petición: un calendario o un curso de otro colegio no existe para quien llama.
 */
export interface CalendarRepository {
  /**
   * Crea el calendario, sus periodos y las asignaciones de cursos en una única transacción: o se crea todo
   * o no se crea nada. Bloquea los cursos pedidos (`FOR UPDATE`) en orden de `id` y los pasa al calendario
   * nuevo, también los que seguían otro. Lanza `CalendarCoursesNotFound` si algún curso no es del colegio
   * (antes de escribir nada) y `CalendarAlreadyExists` si el colegio ya tiene un calendario con el mismo
   * nombre normalizado. Devuelve el calendario tal como quedó guardado.
   */
  create(schoolId: string, calendar: NewCalendar, courseIds: readonly string[]): Promise<Calendar>;

  /** Calendarios del colegio con sus periodos y cursos, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<Calendar[]>;
}
