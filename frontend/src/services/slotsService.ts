import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { SUBJECT_COLORS } from '../utils/subjectOptions';
import { isSlotCell, isWorkloadWarning } from './courseWorkloadService';
import { errorCodeOf, fieldErrorsOf, isRecord, readJson } from './httpResponse';

export type SlotCell = components['schemas']['SlotCell'];
export type SubjectSlotRule = components['schemas']['SubjectSlotRule'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir las franjas prohibidas de una asignatura en un curso, ya interpretado. */
export type SlotsOutcome =
  | { status: 'loaded'; slotRule: SubjectSlotRule }
  /** El curso o la asignatura no existen, son de otro colegio o la asignatura no se imparte en el curso (`404`). */
  | { status: 'notFound' }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de guardar las franjas, ya interpretado por el estado y `error.code`. */
export type UpdateSlotsOutcome =
  /** Guardado: lleva la regla releída del servidor. */
  | { status: 'updated'; slotRule: SubjectSlotRule }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también una sesión que ya no existe. */
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'notFound' }
  /** El curso no tiene calendario (`409 COURSE_HAS_NO_CALENDAR`). */
  | { status: 'noCalendar' }
  /** El rol de la sesión no puede guardar las franjas (`403 FORBIDDEN`): solo el `ADMIN`. */
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIntegerInRangeOrNull(value: unknown, min: number, max: number): boolean {
  return value === null || (isCount(value) && value >= min && value <= max);
}

function isPeriod(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === 'SESSION' || value.type === 'BREAK') &&
    typeof value.startTime === 'string' &&
    typeof value.endTime === 'string'
  );
}

function isCalendar(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.periods) &&
    value.periods.every(isPeriod)
  );
}

function isSubject(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.code === null || typeof value.code === 'string') &&
    typeof value.color === 'string' &&
    (SUBJECT_COLORS as readonly string[]).includes(value.color) &&
    isCount(value.sessionsPerWeek) &&
    value.sessionsPerWeek >= 1 &&
    value.sessionsPerWeek <= 5 &&
    isIntegerInRangeOrNull(value.maxPerDay, 2, 5) &&
    isIntegerInRangeOrNull(value.blockSize, 2, 3)
  );
}

function isSlotRule(value: unknown): value is SubjectSlotRule {
  return (
    isRecord(value) &&
    isRecord(value.course) &&
    typeof value.course.id === 'string' &&
    typeof value.course.name === 'string' &&
    isSubject(value.subject) &&
    (value.calendar === null || isCalendar(value.calendar)) &&
    Array.isArray(value.slots) &&
    value.slots.every(isSlotCell) &&
    isCount(value.outsideCalendarCount) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWorkloadWarning)
  );
}

/** La regla de un `200`, o `undefined` si no viene como el contrato dice. */
function slotRuleOf(body: unknown): SubjectSlotRule | undefined {
  const slotRule = isRecord(body) && isRecord(body.data) ? body.data.slotRule : undefined;
  return isSlotRule(slotRule) ? slotRule : undefined;
}

async function interpretGet(response: Response): Promise<SlotsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const slotRule = slotRuleOf(body);
    return slotRule ? { status: 'loaded', slotRule } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateSlotsOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    const slotRule = slotRuleOf(body);
    return slotRule ? { status: 'updated', slotRule } : { status: 'unavailable' };
  }
  if (response.status === 400 && code === 'VALIDATION_ERROR') {
    const details = fieldErrorsOf(body);
    return details ? { status: 'validationError', details } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403 && code === 'FORBIDDEN') {
    return { status: 'forbidden' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  if (response.status === 409 && code === 'COURSE_HAS_NO_CALENDAR') {
    return { status: 'noCalendar' };
  }
  return { status: 'unavailable' };
}

const slotsPath = (courseId: string, subjectId: string) =>
  `/api/courses/${encodeURIComponent(courseId)}/subjects/${encodeURIComponent(subjectId)}/forbidden-slots`;

export const slotsService = {
  /**
   * Pide las franjas prohibidas de una asignatura en un curso con
   * `GET /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots`; los dos `id` se codifican. Nunca rechaza.
   */
  async get(
    authorizedFetch: AuthorizedFetch,
    courseId: string,
    subjectId: string,
  ): Promise<SlotsOutcome> {
    try {
      return await interpretGet(await authorizedFetch(slotsPath(courseId, subjectId)));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Guarda las franjas con `PUT` en la misma ruta (solo el `ADMIN`): envía el estado final, solo el día y la
   * sesión de cada celda y nada más (nunca el colegio). Una lista vacía borra la regla. Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    courseId: string,
    subjectId: string,
    slots: readonly SlotCell[],
  ): Promise<UpdateSlotsOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(slotsPath(courseId, subjectId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slots: slots.map(({ dayOfWeek, sessionNumber }) => ({ dayOfWeek, sessionNumber })),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
