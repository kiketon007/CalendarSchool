import type { CalendarPeriod } from '../services/calendarsService';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/** Días lectivos de la semana: la estructura de un calendario es la misma de lunes a viernes. */
const SCHOOL_DAYS = 5;

/**
 * Lee una hora `HH:MM` de 24 horas (de `00:00` a `23:59`) y la devuelve en minutos desde las 00:00, o
 * `null` si no tiene exactamente ese formato (el `input type="time"` vacío da `''`).
 */
export function toMinutes(clock: string): number | null {
  const match = CLOCK.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Escribe unos minutos desde las 00:00 como `HH:MM`. Una hora pasada la medianoche sale fuera de rango
 * (`25:00`), a propósito: la validación la marca en lugar de esconderla recortándola.
 */
export function toClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Lo que pide el bloque «Generar sesiones» del formulario. */
export interface GenerateParams {
  /** Hora de inicio de la primera sesión, `HH:MM`. */
  start: string;
  sessionCount: number;
  /** Duración de cada sesión, en minutos. */
  duration: number;
  /** Número de la sesión tras la que va el recreo (de 1 a `sessionCount - 1`), o `null` si no hay. */
  breakAfter: number | null;
  /** Duración del recreo, en minutos. */
  breakDuration: number;
}

/**
 * Genera la jornada del formulario: sesiones contiguas de la misma duración desde la hora de inicio y, si se
 * pide, un recreo tras la sesión indicada. Un recreo solo va entre dos sesiones, así que un `breakAfter`
 * fuera de 1 a `sessionCount - 1` no genera ninguno. Una hora de inicio que no es una hora da una lista vacía.
 * Las horas no se recortan al día: una jornada que pasa de la medianoche sale con horas fuera de rango.
 */
export function generatePeriods({
  start,
  sessionCount,
  duration,
  breakAfter,
  breakDuration,
}: GenerateParams): CalendarPeriod[] {
  let cursor = toMinutes(start);
  if (cursor === null) {
    return [];
  }

  const periods: CalendarPeriod[] = [];
  for (let number = 1; number <= sessionCount; number += 1) {
    periods.push({
      type: 'SESSION',
      startTime: toClock(cursor),
      endTime: toClock(cursor + duration),
    });
    cursor += duration;

    if (breakAfter !== null && number === breakAfter && number < sessionCount) {
      periods.push({
        type: 'BREAK',
        startTime: toClock(cursor),
        endTime: toClock(cursor + breakDuration),
      });
      cursor += breakDuration;
    }
  }
  return periods;
}

/**
 * El número de cada sesión (1, 2, 3…) por su orden entre las sesiones, y `null` en los recreos. No se guarda:
 * quitar o mover un periodo renumera las demás sin más.
 */
export function sessionNumbers(
  periods: readonly Pick<CalendarPeriod, 'type'>[],
): (number | null)[] {
  let sessions = 0;
  return periods.map(({ type }) => {
    if (type === 'BREAK') {
      return null;
    }
    sessions += 1;
    return sessions;
  });
}

/** Resumen de la jornada de un calendario. */
export interface PeriodsSummary {
  sessionsPerDay: number;
  sessionsPerWeek: number;
  /** Minutos de clase al día: los recreos no cuentan. */
  lectiveMinutes: number;
}

/** Sesiones al día y a la semana y minutos lectivos al día. Un periodo con horas no válidas suma 0 minutos. */
export function summaryOf(periods: readonly CalendarPeriod[]): PeriodsSummary {
  const sessions = periods.filter(({ type }) => type === 'SESSION');
  const lectiveMinutes = sessions.reduce((total, { startTime, endTime }) => {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    return start !== null && end !== null && end > start ? total + (end - start) : total;
  }, 0);
  return {
    sessionsPerDay: sessions.length,
    sessionsPerWeek: sessions.length * SCHOOL_DAYS,
    lectiveMinutes,
  };
}
