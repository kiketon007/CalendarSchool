import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type Calendar = components['schemas']['Calendar'];
export type CalendarPeriod = components['schemas']['CalendarPeriod'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la lista de calendarios, ya interpretado: la interfaz decide según el estado. */
export type CalendarsOutcome =
  | { status: 'loaded'; calendars: Calendar[] }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de crear un calendario, ya interpretado por `error.code`. */
export type CreateCalendarOutcome =
  | { status: 'created'; calendar: Calendar }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `courseIds[<i>]` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  /** El colegio ya tiene un calendario con ese nombre (`409 CALENDAR_ALREADY_EXISTS`). */
  | { status: 'alreadyExists' }
  /** El rol de la sesión no puede crear calendarios (`403 FORBIDDEN`): solo el `ADMIN`. */
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Datos del formulario ya listos para enviar: el nombre, los periodos en orden y los cursos que lo siguen. */
export interface CreateCalendarInput {
  name: string;
  periods: CalendarPeriod[];
  courseIds: string[];
}

const FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_LENGTH',
  'INVALID_FORMAT',
  'INVALID_CHARACTERS',
  'WEAK_PASSWORD',
  'DUPLICATE',
  'NOT_FOUND',
  'NOT_ALLOWED',
  'INVALID_RANGE',
  'TOO_LONG',
  'OVERLAP',
] as const;

/** Una hora `HH:MM` de 24 horas, como la escribe la API. */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/u;

function isPeriod(value: unknown): value is CalendarPeriod {
  return (
    isRecord(value) &&
    (value.type === 'SESSION' || value.type === 'BREAK') &&
    typeof value.startTime === 'string' &&
    CLOCK.test(value.startTime) &&
    typeof value.endTime === 'string' &&
    CLOCK.test(value.endTime)
  );
}

function isCalendarCourse(value: unknown): value is Calendar['courses'][number] {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

/** Una fecha en texto que `Date` entiende: si no, la interfaz mostraría «Invalid Date». */
function isDateText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isCalendar(value: unknown): value is Calendar {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isDateText(value.createdAt) &&
    Array.isArray(value.periods) &&
    value.periods.every(isPeriod) &&
    Array.isArray(value.courses) &&
    value.courses.every(isCalendarCourse)
  );
}

function isFieldError(value: unknown): value is FieldError {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.code === 'string' &&
    (FIELD_ERROR_CODES as readonly string[]).includes(value.code)
  );
}

/** Los campos de un `400 VALIDATION_ERROR`, o `undefined` si no vienen como el contrato dice. */
function fieldErrorsOf(body: unknown): FieldError[] | undefined {
  const details = isRecord(body) && isRecord(body.error) ? body.error.details : undefined;
  return Array.isArray(details) && details.every(isFieldError) ? details : undefined;
}

async function interpretList(response: Response): Promise<CalendarsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const calendars = isRecord(body) && isRecord(body.data) ? body.data.calendars : undefined;
    return Array.isArray(calendars) && calendars.every(isCalendar)
      ? { status: 'loaded', calendars }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

async function interpretCreate(response: Response): Promise<CreateCalendarOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 201) {
    const calendar = isRecord(body) && isRecord(body.data) ? body.data.calendar : undefined;
    return isCalendar(calendar) ? { status: 'created', calendar } : { status: 'unavailable' };
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
  if (response.status === 409 && code === 'CALENDAR_ALREADY_EXISTS') {
    return { status: 'alreadyExists' };
  }
  return { status: 'unavailable' };
}

export const calendarsService = {
  /** Lista los calendarios del colegio con `GET /api/calendars`. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<CalendarsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/calendars'));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Crea un calendario con `POST /api/calendars` (solo el `ADMIN`). Envía exactamente el nombre, los
   * periodos y los cursos, nada más. Nunca rechaza.
   */
  async create(
    authorizedFetch: AuthorizedFetch,
    { name, periods, courseIds }: CreateCalendarInput,
  ): Promise<CreateCalendarOutcome> {
    try {
      return await interpretCreate(
        await authorizedFetch('/api/calendars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, periods, courseIds }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
