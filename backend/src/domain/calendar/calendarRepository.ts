import type { Calendar, CalendarPeriod } from './calendar.js';

/** Lo que una edición deja en un calendario: su nombre y todos sus periodos, en el orden del día. */
export interface CalendarChanges {
  readonly name: string;
  readonly normalizedName: string;
  readonly periods: readonly CalendarPeriod[];
}

/** Calendario nuevo con todos sus periodos, en el orden del día. */
export interface NewCalendar extends CalendarChanges {
  /** UUIDv7. */
  readonly id: string;
}

/** El calendario como era antes de editarlo y como quedó, para registrar qué cambió sin una segunda lectura. */
export interface CalendarUpdate {
  readonly before: Calendar;
  readonly after: Calendar;
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

  /** El calendario del colegio con sus periodos y cursos, o `null` si no es de ese colegio o no existe. */
  findById(schoolId: string, calendarId: string): Promise<Calendar | null>;

  /**
   * Guarda el estado final del calendario en una única transacción: bloquea primero su fila y después, en
   * orden de `id`, los cursos pedidos y los que lo siguen hoy; reemplaza el nombre y todos los periodos; deja
   * los cursos de `courseIds` siguiendo este calendario (también los que seguían otro) y sin calendario los
   * que lo seguían y ya no están. Devuelve el calendario como era y como quedó, o `null` (sin cambiar nada) si
   * no es del colegio. Lanza `CalendarCoursesNotFound` si algún curso pedido no es del colegio y
   * `CalendarAlreadyExists` si otro calendario del colegio ya usa el nombre normalizado.
   */
  update(
    schoolId: string,
    calendarId: string,
    changes: CalendarChanges,
    courseIds: readonly string[],
  ): Promise<CalendarUpdate | null>;
}
