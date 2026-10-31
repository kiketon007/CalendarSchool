import { parseClock } from '../../domain/calendar/clock.js';
import type { UnavailableInterval } from '../../domain/professor/availability.js';
import type { FieldError } from '../validationError.js';

/** Máximo de tramos en una petición (entre todos los días). */
export const MAX_INTERVALS = 200;
/** Máximo de tramos en un mismo día. */
export const MAX_INTERVALS_PER_DAY = 40;

export interface UpdateProfessorAvailabilityInput {
  /** Los tramos tal como llegaron, ya en minutos y sin normalizar (los solapes no son un error). */
  intervals: UnavailableInterval[];
}

export type ParseUpdateProfessorAvailabilityResult =
  | { success: true; data: UpdateProfessorAvailabilityInput }
  | { success: false; details: FieldError[] };

/** Lee una hora `HH:MM` en minutos: `REQUIRED` si falta, `INVALID_FORMAT` si no es un texto con ese formato. */
function parseTime(value: unknown, field: string, details: FieldError[]): number | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  const minutes = typeof value === 'string' ? parseClock(value) : null;
  if (minutes === null) {
    details.push({ field, code: 'INVALID_FORMAT' });
    return undefined;
  }
  return minutes;
}

/** Lee el día: `REQUIRED` si falta, `OUT_OF_RANGE` si no es un entero de 1 (lunes) a 5 (viernes). */
function parseDay(value: unknown, field: string, details: FieldError[]): number | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    details.push({ field, code: 'OUT_OF_RANGE' });
    return undefined;
  }
  return value;
}

/**
 * Valida el cuerpo de `PUT /api/professors/{id}/availability` (US-PROF-AVAIL), que es el **estado final** de los
 * tramos no disponibles. Devuelve un error por campo en el orden del cuerpo: `unavailable` (`REQUIRED` si falta o no
 * es una lista, `INVALID_LENGTH` con más de 200 tramos, y entonces no se lee ninguno), por cada tramo `dayOfWeek`
 * (`REQUIRED`, `OUT_OF_RANGE`), `startTime` y `endTime` (`REQUIRED`, `INVALID_FORMAT`) y `endTime` (`INVALID_RANGE`
 * si no es posterior al inicio) y, al final, `unavailable[i]` con `INVALID_LENGTH` por cada tramo que pasa de 40 en
 * un mismo día. Los solapes no son un error: los une `normalizeUnavailability`. Cualquier otra propiedad, también un
 * `schoolId`, se ignora.
 */
export function parseUpdateProfessorAvailabilityRequest(
  body: unknown,
): ParseUpdateProfessorAvailabilityResult {
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const list = raw.unavailable;
  if (!Array.isArray(list)) {
    return { success: false, details: [{ field: 'unavailable', code: 'REQUIRED' }] };
  }
  if (list.length > MAX_INTERVALS) {
    return { success: false, details: [{ field: 'unavailable', code: 'INVALID_LENGTH' }] };
  }

  const details: FieldError[] = [];
  const intervals: UnavailableInterval[] = [];
  const perDay = new Map<number, number>();
  const overLimit: FieldError[] = [];

  list.forEach((item: unknown, index) => {
    const prefix = `unavailable[${String(index)}]`;
    const fields =
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const dayOfWeek = parseDay(fields.dayOfWeek, `${prefix}.dayOfWeek`, details);
    const startMinute = parseTime(fields.startTime, `${prefix}.startTime`, details);
    const endMinute = parseTime(fields.endTime, `${prefix}.endTime`, details);
    if (startMinute !== undefined && endMinute !== undefined && endMinute <= startMinute) {
      details.push({ field: `${prefix}.endTime`, code: 'INVALID_RANGE' });
      return;
    }
    if (dayOfWeek === undefined || startMinute === undefined || endMinute === undefined) {
      return;
    }
    const count = (perDay.get(dayOfWeek) ?? 0) + 1;
    perDay.set(dayOfWeek, count);
    if (count > MAX_INTERVALS_PER_DAY) {
      overLimit.push({ field: prefix, code: 'INVALID_LENGTH' });
    }
    intervals.push({ dayOfWeek, startMinute, endMinute });
  });

  details.push(...overLimit);
  return details.length > 0 ? { success: false, details } : { success: true, data: { intervals } };
}
