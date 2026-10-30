import { MAX_SESSIONS } from '../../domain/calendar/calendarPeriods.js';
import { SCHOOL_DAYS_PER_WEEK, type SlotCell } from '../../domain/workload/workloadWarnings.js';
import { isRecord } from '../courses/courseFields.js';
import type { FieldError } from '../validationError.js';

/** Máximo de celdas de una regla: cinco días por las ocho sesiones de la jornada más larga. */
export const MAX_FORBIDDEN_SLOTS = SCHOOL_DAYS_PER_WEEK * MAX_SESSIONS;

/** Franjas prohibidas ya validadas de forma: sin repetidas y en el orden del cuerpo (las posiciones de un error de calendario la usan). */
export interface UpdateSubjectSlotsInput {
  slots: SlotCell[];
}

export type ParseUpdateSubjectSlotsResult =
  { success: true; data: UpdateSubjectSlotsInput } | { success: false; details: FieldError[] };

/**
 * Lee un entero de una celda dentro de `[min, max]`: `REQUIRED` si falta, `INVALID_FORMAT` si no es un entero
 * y `OUT_OF_RANGE` fuera del rango. Devuelve `undefined` (con el error en `details`) si no vale.
 */
function parseBounded(
  value: unknown,
  field: string,
  max: number,
  details: FieldError[],
): number | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    details.push({ field, code: 'INVALID_FORMAT' });
    return undefined;
  }
  if (value < 1 || value > max) {
    details.push({ field, code: 'OUT_OF_RANGE' });
    return undefined;
  }
  return value;
}

/**
 * Valida el cuerpo de `PUT /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots` (US19_c):
 * `{ slots: [{ dayOfWeek, sessionNumber }] }`, el estado final de las celdas prohibidas, de 0 a 40 (la lista
 * vacía borra la regla). Devuelve un `{ field, code }` por cada campo inválido, sin detenerse en el primero y
 * en el orden del cuerpo: `slots` (`REQUIRED`, `INVALID_FORMAT` o `INVALID_LENGTH` si pasa de 40) y
 * `slots[<i>]…` (`INVALID_FORMAT`, en cada campo `REQUIRED`, `INVALID_FORMAT` u `OUT_OF_RANGE`, primero el día y
 * después la sesión, y `DUPLICATE` desde la segunda aparición de una celda válida). La sesión se valida aquí de
 * 1 a 8, el máximo de un calendario; que exista en **el calendario del curso** lo comprueba el repositorio.
 * Ignora las propiedades desconocidas: el colegio, el curso y la asignatura nunca salen del cuerpo.
 */
export function parseUpdateSubjectSlotsRequest(body: unknown): ParseUpdateSubjectSlotsResult {
  const value = isRecord(body) ? body.slots : undefined;
  if (value === undefined || value === null) {
    return { success: false, details: [{ field: 'slots', code: 'REQUIRED' }] };
  }
  if (!Array.isArray(value)) {
    return { success: false, details: [{ field: 'slots', code: 'INVALID_FORMAT' }] };
  }
  if (value.length > MAX_FORBIDDEN_SLOTS) {
    return { success: false, details: [{ field: 'slots', code: 'INVALID_LENGTH' }] };
  }

  const details: FieldError[] = [];
  const seen = new Set<string>();
  const slots: SlotCell[] = [];
  value.forEach((raw: unknown, index) => {
    const prefix = `slots[${String(index)}]`;
    if (!isRecord(raw)) {
      details.push({ field: prefix, code: 'INVALID_FORMAT' });
      return;
    }
    const dayOfWeek = parseBounded(
      raw.dayOfWeek,
      `${prefix}.dayOfWeek`,
      SCHOOL_DAYS_PER_WEEK,
      details,
    );
    const sessionNumber = parseBounded(
      raw.sessionNumber,
      `${prefix}.sessionNumber`,
      MAX_SESSIONS,
      details,
    );
    if (dayOfWeek === undefined || sessionNumber === undefined) {
      return;
    }
    const key = `${String(dayOfWeek)}-${String(sessionNumber)}`;
    if (seen.has(key)) {
      details.push({ field: prefix, code: 'DUPLICATE' });
      return;
    }
    seen.add(key);
    slots.push({ dayOfWeek, sessionNumber });
  });

  if (details.length > 0) {
    return { success: false, details };
  }
  return { success: true, data: { slots } };
}
