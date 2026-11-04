import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type Generation = components['schemas']['Generation'];
export type GenerationErrorDetails = components['schemas']['GenerationErrorDetails'];
export type GenerationLesson = components['schemas']['GenerationLesson'];

/** Los valores de las listas cerradas del contrato. Deben coincidir con `docs/api-spec.yml`. */
const STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const satisfies readonly Generation['status'][];
const ERROR_CODES = [
  'NOT_READY',
  'INFEASIBLE',
  'TIMEOUT',
  'INTERNAL',
] as const satisfies readonly NonNullable<Generation['errorCode']>[];
const REASONS = [
  'NO_FREE_CELLS',
  'CLASS_BUSY',
  'PROFESSOR_BUSY',
  'DAILY_RULE',
  'MAX_HOURS',
] as const satisfies readonly GenerationErrorDetails['reason'][];

/** Resultado de cada llamada, ya interpretado: la interfaz decide según el estado. */
export type StartGenerationOutcome =
  | { status: 'started'; generation: Generation }
  /** Hay problemas que impiden generar (`409 SCHEDULE_NOT_READY`). */
  | { status: 'notReady' }
  /** El colegio ya tiene una generación en curso (`409 GENERATION_IN_PROGRESS`). */
  | { status: 'inProgress' }
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export type LoadGenerationOutcome =
  | { status: 'loaded'; generation: Generation }
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** La última generación del colegio, que es `null` si nunca ha generado. */
export type CurrentGenerationOutcome =
  | { status: 'loaded'; generation: Generation | null }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export type CancelGenerationOutcome =
  /** La generación como la dejó el servidor: `CANCELLED`, o `RUNNING` con la cancelación pedida. */
  | { status: 'loaded'; generation: Generation }
  /** Ya había terminado (`409 GENERATION_NOT_CANCELLABLE`). */
  | { status: 'notCancellable' }
  | { status: 'forbidden' }
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isCount(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isRef(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isLesson(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRef(value.course) &&
    isRef(value.class) &&
    isRef(value.subject) &&
    isRef(value.professor)
  );
}

function isErrorDetails(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(REASONS, value.reason) &&
    (value.lesson === null || isLesson(value.lesson))
  );
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableDate(value: unknown): boolean {
  return value === null || isDate(value);
}

/** La forma del contrato, y que el error solo exista si falló y el borrador solo si terminó. */
function isGeneration(value: unknown): value is Generation {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isOneOf(STATUSES, value.status) ||
    !isCount(value.progress, 100) ||
    !isCount(value.placed) ||
    !isCount(value.total) ||
    !isDate(value.createdAt) ||
    !isNullableDate(value.startedAt) ||
    !isNullableDate(value.finishedAt)
  ) {
    return false;
  }
  const failed = value.status === 'FAILED';
  const errorIsValid = failed
    ? isOneOf(ERROR_CODES, value.errorCode)
    : value.errorCode === null && value.errorMessage === null && value.errorDetails === null;
  const messageIsValid = value.errorMessage === null || typeof value.errorMessage === 'string';
  const detailsAreValid = value.errorDetails === null || isErrorDetails(value.errorDetails);
  const scheduleIsValid = value.status === 'COMPLETED' ? true : value.scheduleId === null;
  return (
    errorIsValid &&
    messageIsValid &&
    detailsAreValid &&
    scheduleIsValid &&
    (value.scheduleId === null || typeof value.scheduleId === 'string')
  );
}

function generationOf(body: unknown): unknown {
  return isRecord(body) && isRecord(body.data) ? body.data.generation : undefined;
}

async function interpretLoad(response: Response): Promise<LoadGenerationOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const generation = generationOf(await readJson(response));
  return isGeneration(generation) ? { status: 'loaded', generation } : { status: 'unavailable' };
}

async function interpretCurrent(response: Response): Promise<CurrentGenerationOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const generation = generationOf(await readJson(response));
  return generation === null || isGeneration(generation)
    ? { status: 'loaded', generation }
    : { status: 'unavailable' };
}

async function interpretStart(response: Response): Promise<StartGenerationOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403) {
    return { status: 'forbidden' };
  }
  const body = await readJson(response);
  if (response.status === 409) {
    const code = errorCodeOf(body);
    if (code === 'SCHEDULE_NOT_READY') {
      return { status: 'notReady' };
    }
    return code === 'GENERATION_IN_PROGRESS' ? { status: 'inProgress' } : { status: 'unavailable' };
  }
  const generation = generationOf(body);
  return response.status === 202 && isGeneration(generation)
    ? { status: 'started', generation }
    : { status: 'unavailable' };
}

async function interpretCancel(response: Response): Promise<CancelGenerationOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403) {
    return { status: 'forbidden' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  const body = await readJson(response);
  if (response.status === 409) {
    return errorCodeOf(body) === 'GENERATION_NOT_CANCELLABLE'
      ? { status: 'notCancellable' }
      : { status: 'unavailable' };
  }
  const generation = generationOf(body);
  return response.status === 200 && isGeneration(generation)
    ? { status: 'loaded', generation }
    : { status: 'unavailable' };
}

const generationPath = (id: string) => `/api/schedule/generate/${encodeURIComponent(id)}`;

export const scheduleGenerationService = {
  /** Lanza una generación con `POST /api/schedule/generate`. Nunca rechaza. */
  async start(authorizedFetch: AuthorizedFetch): Promise<StartGenerationOutcome> {
    try {
      return await interpretStart(
        await authorizedFetch('/api/schedule/generate', { method: 'POST' }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Pide la última generación del colegio con `GET /api/schedule/generate`. Nunca rechaza. */
  async current(authorizedFetch: AuthorizedFetch): Promise<CurrentGenerationOutcome> {
    try {
      return await interpretCurrent(await authorizedFetch('/api/schedule/generate'));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Pide una generación con `GET /api/schedule/generate/{id}`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, id: string): Promise<LoadGenerationOutcome> {
    try {
      return await interpretLoad(await authorizedFetch(generationPath(id)));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Cancela una generación con `DELETE /api/schedule/generate/{id}`. Nunca rechaza. */
  async cancel(authorizedFetch: AuthorizedFetch, id: string): Promise<CancelGenerationOutcome> {
    try {
      return await interpretCancel(await authorizedFetch(generationPath(id), { method: 'DELETE' }));
    } catch {
      return { status: 'unavailable' };
    }
  },
};
