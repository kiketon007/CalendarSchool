import type { components } from '../api/generated/schema';
import { toMinutes } from '../utils/calendarPeriods';
import { validateCourseName, type FieldErrorCode } from './courseValidation';

type FieldError = components['schemas']['FieldError'];

/** Máximo de sesiones de la jornada. */
export const MAX_SESSIONS = 8;
/** Máximo de recreos de la jornada. */
export const MAX_BREAKS = 2;
/** Duración máxima de un periodo, sesión o recreo, en minutos. */
export const MAX_PERIOD_MINUTES = 90;

// Las reglas son las mismas que valida el backend (createCalendarRequest.ts y calendarPeriods.ts). Ambos
// lados recorren la tabla test-fixtures/calendar-fields.json para que no diverjan.

/** El nombre de un calendario tiene las reglas del nombre de un curso. */
export const validateCalendarName = validateCourseName;

/** Un periodo del formulario: las horas son el valor de un `input type="time"` (`''` si está vacío). */
export interface DraftPeriod {
  type: 'SESSION' | 'BREAK';
  startTime: string;
  endTime: string;
}

/** Lo que valida el formulario antes de enviar. */
export interface CalendarDraft {
  name: string;
  periods: readonly DraftPeriod[];
  courseIds: readonly string[];
}

/** Una hora: `REQUIRED` si el campo está vacío y `INVALID_FORMAT` si no es una hora `HH:MM`. */
function timeError(value: string): FieldErrorCode | undefined {
  if (value === '') {
    return 'REQUIRED';
  }
  return toMinutes(value) === null ? 'INVALID_FORMAT' : undefined;
}

/**
 * Las reglas de la jornada, con las horas ya bien escritas: primero las de la lista entera y después las de
 * cada periodo en su orden (`type`, `startTime`, `endTime`). Un periodo que ya es inválido por sí mismo no
 * se compara con el siguiente.
 */
function dayRules(periods: readonly DraftPeriod[]): FieldError[] {
  const issues: FieldError[] = [];

  const sessions = periods.filter(({ type }) => type === 'SESSION').length;
  const breaks = periods.length - sessions;
  if (sessions === 0) {
    issues.push({ field: 'periods', code: 'REQUIRED' });
  } else if (sessions > MAX_SESSIONS || breaks > MAX_BREAKS) {
    issues.push({ field: 'periods', code: 'INVALID_LENGTH' });
  }

  let previousEnd: number | null = null;
  periods.forEach((period, index) => {
    const prefix = `periods[${String(index)}]`;

    if (
      period.type === 'BREAK' &&
      (periods[index - 1]?.type !== 'SESSION' || periods[index + 1]?.type !== 'SESSION')
    ) {
      issues.push({ field: `${prefix}.type`, code: 'NOT_ALLOWED' });
    }

    const start = toMinutes(period.startTime) ?? 0;
    const end = toMinutes(period.endTime) ?? 0;
    if (previousEnd !== null && start < previousEnd) {
      issues.push({ field: `${prefix}.startTime`, code: 'OVERLAP' });
    }
    if (end <= start) {
      issues.push({ field: `${prefix}.endTime`, code: 'INVALID_RANGE' });
      previousEnd = null;
    } else if (end - start > MAX_PERIOD_MINUTES) {
      issues.push({ field: `${prefix}.endTime`, code: 'TOO_LONG' });
      previousEnd = null;
    } else {
      previousEnd = end;
    }
  });

  return issues;
}

/**
 * Valida el calendario del formulario con las mismas reglas que el backend y devuelve un `{ field, code }`
 * por campo inválido, en el mismo orden: `name`, la forma de cada hora y, solo si todas están bien escritas,
 * las reglas de la jornada. El orden es el de la pantalla, así que el primero es el que recibe el foco.
 */
export function validateCalendar({ name, periods }: CalendarDraft): FieldError[] {
  const details: FieldError[] = [];

  const nameError = validateCalendarName(name);
  if (nameError) {
    details.push({ field: 'name', code: nameError });
  }

  if (periods.length === 0) {
    details.push({ field: 'periods', code: 'REQUIRED' });
    return details;
  }

  const before = details.length;
  periods.forEach(({ startTime, endTime }, index) => {
    const start = timeError(startTime);
    if (start) {
      details.push({ field: `periods[${String(index)}].startTime`, code: start });
    }
    const end = timeError(endTime);
    if (end) {
      details.push({ field: `periods[${String(index)}].endTime`, code: end });
    }
  });
  if (details.length === before) {
    details.push(...dayRules(periods));
  }

  return details;
}

/** El error de cada campo de una fila de periodo. */
export interface PeriodRowErrors {
  type?: FieldErrorCode;
  startTime?: FieldErrorCode;
  endTime?: FieldErrorCode;
  /** El periodo entero no es válido (`periods[<i>]`): solo lo produce una petición hecha a mano. */
  whole?: FieldErrorCode;
}

/** Los errores del formulario de un calendario, repartidos por campo para pintarlos bajo cada uno. */
export interface CalendarErrors {
  name?: FieldErrorCode;
  /** Error de la lista de periodos entera: sin sesiones, o demasiadas sesiones o recreos. */
  periods?: FieldErrorCode;
  /** Errores por posición del periodo. */
  rows: Record<number, PeriodRowErrors>;
  /** Errores por posición del curso en `courseIds`. */
  courses: Record<number, FieldErrorCode>;
}

const PERIOD_FIELD = /^periods\[(\d+)\](?:\.(type|startTime|endTime))?$/u;
const COURSE_FIELD = /^courseIds\[(\d+)\]$/u;

/**
 * Reparte una lista de errores (los de `validateCalendar` o los de un `400` del servidor) por campo. De cada
 * campo se conserva el primer error, y un campo que no se conoce se ignora.
 */
export function groupCalendarErrors(details: readonly FieldError[]): CalendarErrors {
  const errors: CalendarErrors = { rows: {}, courses: {} };

  for (const { field, code } of details) {
    if (field === 'name') {
      errors.name ??= code;
      continue;
    }
    if (field === 'periods') {
      errors.periods ??= code;
      continue;
    }
    const period = PERIOD_FIELD.exec(field);
    if (period) {
      const row = (errors.rows[Number(period[1])] ??= {});
      const key = period[2] as 'type' | 'startTime' | 'endTime' | undefined;
      row[key ?? 'whole'] ??= code;
      continue;
    }
    const course = COURSE_FIELD.exec(field);
    if (course) {
      errors.courses[Number(course[1])] ??= code;
    }
  }
  return errors;
}
