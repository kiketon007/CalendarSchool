import { z } from 'zod';
import type { CalendarPeriod } from '../../domain/calendar/calendar.js';
import { validatePeriods } from '../../domain/calendar/calendarPeriods.js';
import { parseClock } from '../../domain/calendar/clock.js';
import { COURSE_NAME, isRecord } from '../courses/courseFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

/** Máximo de periodos de un calendario: 8 sesiones y 2 recreos. */
const MAX_PERIODS = 10;
/** Máximo de cursos que pueden seguir un calendario a la vez. */
const MAX_COURSE_IDS = 100;

const courseIdSchema = z.uuid();

/** Calendario nuevo ya validado: nombre limpio, periodos con horas `HH:MM` y cursos en minúsculas, sin colegio. */
export interface CreateCalendarInput {
  name: string;
  periods: CalendarPeriod[];
  courseIds: string[];
}

export type ParseCreateCalendarResult =
  { success: true; data: CreateCalendarInput } | { success: false; details: FieldError[] };

/** Lee el nombre del calendario con las reglas del nombre de un curso: añade `name` a `details` si no vale. */
function parseName(source: Record<string, unknown>, details: FieldError[]): string | undefined {
  const name = COURSE_NAME.safeParse(source.name);
  if (!name.success) {
    details.push({ field: 'name', code: name.error.issues[0]?.message as FieldErrorCode });
    return undefined;
  }
  return name.data;
}

/** Lee una hora `HH:MM`: `REQUIRED` si falta, `INVALID_FORMAT` si no es un texto con ese formato. */
function parseTime(value: unknown, field: string, details: FieldError[]): string | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (typeof value !== 'string' || parseClock(value) === null) {
    details.push({ field, code: 'INVALID_FORMAT' });
    return undefined;
  }
  return value;
}

/** Lee un periodo; devuelve `undefined` (con sus errores en `details`) si alguno de sus campos no vale. */
function parsePeriod(
  raw: unknown,
  index: number,
  details: FieldError[],
): CalendarPeriod | undefined {
  const prefix = `periods[${String(index)}]`;
  if (!isRecord(raw)) {
    details.push({ field: prefix, code: 'INVALID_FORMAT' });
    return undefined;
  }

  const before = details.length;
  let type: CalendarPeriod['type'] | undefined;
  if (raw.type === undefined || raw.type === null) {
    details.push({ field: `${prefix}.type`, code: 'REQUIRED' });
  } else if (raw.type === 'SESSION' || raw.type === 'BREAK') {
    type = raw.type;
  } else {
    details.push({ field: `${prefix}.type`, code: 'INVALID_FORMAT' });
  }
  const startTime = parseTime(raw.startTime, `${prefix}.startTime`, details);
  const endTime = parseTime(raw.endTime, `${prefix}.endTime`, details);

  if (
    details.length > before ||
    type === undefined ||
    startTime === undefined ||
    endTime === undefined
  ) {
    return undefined;
  }
  return { type, startTime, endTime };
}

/**
 * Lee la lista de periodos: la forma de cada uno primero y, solo si todos están bien escritos, las reglas de
 * la jornada (`validatePeriods`: sesiones, recreos, rango, duración y solapes). Devuelve `undefined` si hay
 * algún error.
 */
function parsePeriods(value: unknown, details: FieldError[]): CalendarPeriod[] | undefined {
  if (value === undefined || value === null) {
    details.push({ field: 'periods', code: 'REQUIRED' });
    return undefined;
  }
  if (!Array.isArray(value)) {
    details.push({ field: 'periods', code: 'INVALID_FORMAT' });
    return undefined;
  }
  if (value.length === 0) {
    details.push({ field: 'periods', code: 'REQUIRED' });
    return undefined;
  }
  if (value.length > MAX_PERIODS) {
    details.push({ field: 'periods', code: 'INVALID_LENGTH' });
    return undefined;
  }

  const periods = value.map((raw: unknown, index) => parsePeriod(raw, index, details));
  if (periods.some((period) => period === undefined)) {
    return undefined;
  }
  const valid = periods as CalendarPeriod[];

  const issues = validatePeriods(valid);
  details.push(...issues);
  return issues.length > 0 ? undefined : valid;
}

/** Lee los cursos que siguen el calendario: opcional, UUID, sin repetidos (sin distinguir mayúsculas). */
function parseCourseIds(value: unknown, details: FieldError[]): string[] | undefined {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    details.push({ field: 'courseIds', code: 'INVALID_FORMAT' });
    return undefined;
  }
  if (value.length > MAX_COURSE_IDS) {
    details.push({ field: 'courseIds', code: 'INVALID_LENGTH' });
    return undefined;
  }

  const before = details.length;
  const seen = new Set<string>();
  const courseIds: string[] = [];
  value.forEach((raw: unknown, index) => {
    const field = `courseIds[${String(index)}]`;
    const parsed = courseIdSchema.safeParse(raw);
    if (!parsed.success) {
      details.push({ field, code: 'INVALID_FORMAT' });
      return;
    }
    const courseId = parsed.data.toLowerCase();
    if (seen.has(courseId)) {
      details.push({ field, code: 'DUPLICATE' });
      return;
    }
    seen.add(courseId);
    courseIds.push(courseId);
  });
  return details.length > before ? undefined : courseIds;
}

/**
 * Valida y limpia el cuerpo de `POST /api/calendars` con las reglas de US-BASE. Devuelve un `{ field, code }`
 * por cada campo inválido, sin detenerse en el primero y en el orden del cuerpo: `name`, `periods` (y
 * `periods[<i>].…`) y `courseIds[<i>]`. Ignora las propiedades desconocidas (el colegio nunca se lee del
 * cuerpo).
 */
export function parseCreateCalendarRequest(body: unknown): ParseCreateCalendarResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];

  const name = parseName(source, details);
  const periods = parsePeriods(source.periods, details);
  const courseIds = parseCourseIds(source.courseIds, details);

  if (
    details.length > 0 ||
    name === undefined ||
    periods === undefined ||
    courseIds === undefined
  ) {
    return { success: false, details };
  }
  return { success: true, data: { name, periods, courseIds } };
}
