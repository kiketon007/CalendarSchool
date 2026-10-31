import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, fieldErrorsOf, isRecord, readJson } from './httpResponse';

export type ProfessorAvailability = components['schemas']['ProfessorAvailability'];
export type ProfessorUnavailability = components['schemas']['ProfessorUnavailability'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la disponibilidad de un profesor, ya interpretado. */
export type AvailabilityOutcome =
  | { status: 'loaded'; availability: ProfessorAvailability }
  /** El profesor no existe, es de otro colegio o el id no es un UUID (`404`): no se distingue el caso. */
  | { status: 'notFound' }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de guardar la disponibilidad, ya interpretado por el estado y `error.code`. */
export type UpdateAvailabilityOutcome =
  /** Guardado: lleva lo que quedó, normalizado por el servidor. */
  | { status: 'updated'; availability: ProfessorAvailability }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`). */
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Una hora «HH:MM» de 24 horas, como la del contrato. */
const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function isUnavailability(value: unknown): value is ProfessorUnavailability {
  return (
    isRecord(value) &&
    typeof value.dayOfWeek === 'number' &&
    Number.isInteger(value.dayOfWeek) &&
    value.dayOfWeek >= 1 &&
    value.dayOfWeek <= 5 &&
    typeof value.startTime === 'string' &&
    CLOCK.test(value.startTime) &&
    typeof value.endTime === 'string' &&
    CLOCK.test(value.endTime)
  );
}

function isAvailability(value: unknown): value is ProfessorAvailability {
  return (
    isRecord(value) &&
    typeof value.professorId === 'string' &&
    Array.isArray(value.unavailable) &&
    value.unavailable.every(isUnavailability)
  );
}

/** La disponibilidad de un `200`, o `undefined` si no viene como el contrato dice. */
function availabilityOf(body: unknown): ProfessorAvailability | undefined {
  const availability = isRecord(body) && isRecord(body.data) ? body.data.availability : undefined;
  return isAvailability(availability) ? availability : undefined;
}

async function interpretGet(response: Response): Promise<AvailabilityOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const availability = availabilityOf(body);
    return availability ? { status: 'loaded', availability } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateAvailabilityOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const availability = availabilityOf(body);
    return availability ? { status: 'updated', availability } : { status: 'unavailable' };
  }
  if (response.status === 400 && errorCodeOf(body) === 'VALIDATION_ERROR') {
    const details = fieldErrorsOf(body);
    return details ? { status: 'validationError', details } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

const availabilityPath = (professorId: string) =>
  `/api/professors/${encodeURIComponent(professorId)}/availability`;

export const professorAvailabilityService = {
  /** Pide los tramos no disponibles de un profesor con `GET /api/professors/{id}/availability`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, professorId: string): Promise<AvailabilityOutcome> {
    try {
      return await interpretGet(await authorizedFetch(availabilityPath(professorId)));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Guarda la disponibilidad con `PUT` en la misma ruta: envía el estado final, solo el día y las horas de cada
   * tramo y nada más (nunca el colegio). Una lista vacía deja al profesor disponible siempre. Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    professorId: string,
    unavailable: readonly ProfessorUnavailability[],
  ): Promise<UpdateAvailabilityOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(availabilityPath(professorId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unavailable: unavailable.map(({ dayOfWeek, startTime, endTime }) => ({
              dayOfWeek,
              startTime,
              endTime,
            })),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
