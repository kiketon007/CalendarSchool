import type { CalendarPeriod } from '../services/calendarsService';
import type { ProfessorUnavailability } from '../services/professorAvailabilityService';
import { toClock, toMinutes } from './calendarPeriods';

/**
 * Un tramo no disponible de un profesor (US-PROF-AVAIL): el día (1, lunes, a 5) y las horas en minutos desde las
 * 00:00. Es semiabierto, `[startMinute, endMinute)`: dos tramos que se tocan no se solapan, pero se unen al
 * normalizar. Es lo que guarda la página; las celdas de la cuadrícula se derivan de aquí.
 */
export interface Interval {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

/** Una sesión de la jornada de un calendario: su número por orden entre las sesiones y sus horas en minutos. */
export interface Session {
  number: number;
  startMinute: number;
  endMinute: number;
}

/** Una celda de la cuadrícula: un día y el número de una sesión de la jornada elegida. */
export interface AvailabilityCell {
  dayOfWeek: number;
  sessionNumber: number;
}

/** El estado de una celda: sin tramos, cubierta entera por tramos, o solapada por alguno sin cubrirla. */
export type CellState = 'available' | 'unavailable' | 'partial';

export interface CellInfo {
  state: CellState;
  /** Los tramos que se solapan con la sesión (vacío si está disponible), para decir cuáles en el nombre. */
  intervals: Interval[];
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export const cellKey = ({ dayOfWeek, sessionNumber }: AvailabilityCell) =>
  `${String(dayOfWeek)}-${String(sessionNumber)}`;

/**
 * Ordena los tramos por día y por inicio y une los de un mismo día que se solapan o se tocan. Es la misma regla
 * que `normalizeUnavailability` del backend y los dos tests recorren
 * `test-fixtures/professor-unavailability-normalization.json`. No modifica la entrada.
 */
export function normalizeUnavailability(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const joined: Interval[] = [];
  for (const interval of sorted) {
    const last = joined.at(-1);
    if (
      last !== undefined &&
      last.dayOfWeek === interval.dayOfWeek &&
      interval.startMinute <= last.endMinute
    ) {
      joined[joined.length - 1] = {
        dayOfWeek: last.dayOfWeek,
        startMinute: last.startMinute,
        endMinute: Math.max(last.endMinute, interval.endMinute),
      };
    } else {
      joined.push({ ...interval });
    }
  }
  return joined;
}

/** Pasa los tramos de la API («HH:MM») a minutos. Los que traen una hora no válida se descartan. */
export function fromApi(unavailable: readonly ProfessorUnavailability[]): Interval[] {
  return unavailable.flatMap(({ dayOfWeek, startTime, endTime }) => {
    const startMinute = toMinutes(startTime);
    const endMinute = toMinutes(endTime);
    return startMinute === null || endMinute === null
      ? []
      : [{ dayOfWeek, startMinute, endMinute }];
  });
}

/** Pasa los tramos a la forma de la API («HH:MM»), en el mismo orden. */
export function toApi(intervals: readonly Interval[]): ProfessorUnavailability[] {
  return intervals.map(({ dayOfWeek, startMinute, endMinute }) => ({
    dayOfWeek,
    startTime: toClock(startMinute),
    endTime: toClock(endMinute),
  }));
}

/**
 * Las sesiones de la jornada de un calendario, numeradas por su orden entre las sesiones (los recreos no cuentan,
 * como en las franjas de US19_c). Un periodo con horas no válidas se descarta.
 */
export function sessionsOf(
  periods: readonly Pick<CalendarPeriod, 'type' | 'startTime' | 'endTime'>[],
): Session[] {
  const sessions: Session[] = [];
  for (const { type, startTime, endTime } of periods) {
    if (type !== 'SESSION') {
      continue;
    }
    const startMinute = toMinutes(startTime);
    const endMinute = toMinutes(endTime);
    if (startMinute !== null && endMinute !== null) {
      sessions.push({ number: sessions.length + 1, startMinute, endMinute });
    }
  }
  return sessions;
}

/** Suma el tramo `[start, end)` de un día a los tramos y normaliza. */
export function addRange(
  intervals: readonly Interval[],
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
): Interval[] {
  return normalizeUnavailability([...intervals, { dayOfWeek, startMinute, endMinute }]);
}

/**
 * Resta el tramo `[start, end)` de un día a los tramos: lo recorta, lo parte en dos si queda en medio o lo quita
 * si queda cubierto. Los tramos de otros días y los que solo tocan el rango no cambian.
 */
export function subtractRange(
  intervals: readonly Interval[],
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals) {
    if (
      interval.dayOfWeek !== dayOfWeek ||
      interval.endMinute <= startMinute ||
      interval.startMinute >= endMinute
    ) {
      result.push(interval);
      continue;
    }
    if (interval.startMinute < startMinute) {
      result.push({ ...interval, endMinute: startMinute });
    }
    if (interval.endMinute > endMinute) {
      result.push({ ...interval, startMinute: endMinute });
    }
  }
  return normalizeUnavailability(result);
}

/**
 * El estado de cada celda (`día-sesión`) de la jornada: **disponible** si ningún tramo se solapa con la sesión,
 * **no disponible** si los tramos la cubren entera (también si la cubren entre varios que se tocan) y **parcial** si
 * alguno se solapa sin cubrirla.
 */
export function cellStates(
  intervals: readonly Interval[],
  sessions: readonly Session[],
): Map<string, CellInfo> {
  const states = new Map<string, CellInfo>();
  const normalized = normalizeUnavailability(intervals);
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
    const ofDay = normalized.filter((interval) => interval.dayOfWeek === dayOfWeek);
    for (const session of sessions) {
      const overlapping = ofDay.filter(
        (interval) =>
          interval.startMinute < session.endMinute && session.startMinute < interval.endMinute,
      );
      const covered = overlapping.some(
        (interval) =>
          interval.startMinute <= session.startMinute && interval.endMinute >= session.endMinute,
      );
      states.set(cellKey({ dayOfWeek, sessionNumber: session.number }), {
        state: overlapping.length === 0 ? 'available' : covered ? 'unavailable' : 'partial',
        intervals: overlapping,
      });
    }
  }
  return states;
}

/** Cuántas celdas están disponibles del todo: una parcial no cuenta. */
export function countAvailable(states: ReadonlyMap<string, CellInfo>): number {
  return [...states.values()].filter(({ state }) => state === 'available').length;
}

const sessionOf = (sessions: readonly Session[], number: number) =>
  sessions.find((session) => session.number === number);

/**
 * Pulsar una celda: si está no disponible, quita el tramo de su sesión (puede partir un tramo mayor); si está
 * disponible o parcial, marca la sesión entera. Una celda cuya sesión no está en la vista no cambia nada.
 */
export function toggleCell(
  intervals: readonly Interval[],
  cell: AvailabilityCell,
  sessions: readonly Session[],
): Interval[] {
  const session = sessionOf(sessions, cell.sessionNumber);
  if (session === undefined) {
    return [...intervals];
  }
  const { state } = cellStates(intervals, sessions).get(cellKey(cell)) ?? { state: 'available' };
  return state === 'unavailable'
    ? subtractRange(intervals, cell.dayOfWeek, session.startMinute, session.endMinute)
    : addRange(intervals, cell.dayOfWeek, session.startMinute, session.endMinute);
}

/**
 * Pulsar la cabecera de un día o de una sesión: si todas las celdas de la línea están no disponibles, las quita;
 * si falta alguna (también si hay una parcial), marca todas. Una línea vacía no cambia nada.
 */
export function toggleLine(
  intervals: readonly Interval[],
  line: readonly AvailabilityCell[],
  sessions: readonly Session[],
): Interval[] {
  const states = cellStates(intervals, sessions);
  const known = line.filter((cell) => sessionOf(sessions, cell.sessionNumber) !== undefined);
  if (known.length === 0) {
    return [...intervals];
  }
  const allMarked = known.every((cell) => states.get(cellKey(cell))?.state === 'unavailable');
  let result = [...intervals];
  for (const cell of known) {
    const session = sessionOf(sessions, cell.sessionNumber);
    if (session === undefined) {
      continue;
    }
    result = allMarked
      ? subtractRange(result, cell.dayOfWeek, session.startMinute, session.endMinute)
      : addRange(result, cell.dayOfWeek, session.startMinute, session.endMinute);
  }
  return result;
}

/** Los tramos que no se solapan con ninguna sesión de la vista: no se ven en la cuadrícula pero se conservan. */
export function outsideView(
  intervals: readonly Interval[],
  sessions: readonly Session[],
): Interval[] {
  return intervals.filter(
    (interval) =>
      !sessions.some(
        (session) =>
          interval.startMinute < session.endMinute && session.startMinute < interval.endMinute,
      ),
  );
}

/**
 * El calendario con el que se abre la vista: el que siguen más cursos y, con empate, el primero por nombre con la
 * comparación del castellano.
 */
export function defaultCalendar<T extends { name: string; courses: readonly unknown[] }>(
  calendars: readonly T[],
): T | undefined {
  return [...calendars].sort(
    (a, b) => b.courses.length - a.courses.length || collator.compare(a.name, b.name),
  )[0];
}
