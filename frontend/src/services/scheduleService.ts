import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type ScheduleSummary = components['schemas']['ScheduleSummary'];

/** Qué horarios tiene el colegio: el borrador, el oficial vigente y cuántos oficiales se sustituyeron. */
export interface ScheduleOverview {
  draft: ScheduleSummary | null;
  official: ScheduleSummary | null;
  previousCount: number;
}

export type ScheduleOverviewOutcome =
  | { status: 'loaded'; overview: ScheduleOverview }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export type ConfirmScheduleOutcome =
  /** El horario confirmado, ya oficial. */
  | { status: 'confirmed'; schedule: ScheduleSummary }
  | { status: 'unauthenticated' }
  /** Solo un administrador confirma (`403`). */
  | { status: 'forbidden' }
  /** El borrador ya no existe: otra generación lo sustituyó, o no es del colegio (`404`). */
  | { status: 'notFound' }
  /** Ya no es un borrador: otra persona lo confirmó o lo descartó (`409 SCHEDULE_NOT_DRAFT`). */
  | { status: 'notDraft' }
  | { status: 'unavailable' };

export type DiscardScheduleOutcome =
  | { status: 'discarded' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'notFound' }
  | { status: 'notDraft' }
  | { status: 'unavailable' };

function isDateText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isConfirmedBy(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.firstName === 'string' && typeof value.lastName === 'string'
  );
}

/** La cabecera de un horario del estado dado: un borrador no lleva confirmación; un oficial sí. */
function isSummary(value: unknown, status: ScheduleSummary['status']): value is ScheduleSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.status !== status ||
    !isDateText(value.generatedAt) ||
    typeof value.placedSessions !== 'number' ||
    !Number.isInteger(value.placedSessions) ||
    value.placedSessions < 0
  ) {
    return false;
  }
  if (status === 'DRAFT') {
    return value.confirmedAt === null && value.confirmedBy === null && value.replacedAt === null;
  }
  return (
    isDateText(value.confirmedAt) &&
    isConfirmedBy(value.confirmedBy) &&
    (value.replacedAt === null || isDateText(value.replacedAt))
  );
}

async function interpretOverview(response: Response): Promise<ScheduleOverviewOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const body = await readJson(response);
  const data = isRecord(body) ? body.data : undefined;
  if (
    !isRecord(data) ||
    typeof data.previousCount !== 'number' ||
    !Number.isInteger(data.previousCount) ||
    data.previousCount < 0 ||
    (data.draft !== null && !isSummary(data.draft, 'DRAFT')) ||
    (data.official !== null && !isSummary(data.official, 'OFFICIAL'))
  ) {
    return { status: 'unavailable' };
  }
  return {
    status: 'loaded',
    overview: {
      draft: data.draft,
      official: data.official,
      previousCount: data.previousCount,
    },
  };
}

/** Los resultados de error que comparten confirmar y descartar. */
async function interpretFailure(
  response: Response,
): Promise<
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'notFound' }
  | { status: 'notDraft' }
  | { status: 'unavailable' }
> {
  switch (response.status) {
    case 401:
      return { status: 'unauthenticated' };
    case 403:
      return { status: 'forbidden' };
    case 404:
      return { status: 'notFound' };
    case 409:
      return errorCodeOf(await readJson(response)) === 'SCHEDULE_NOT_DRAFT'
        ? { status: 'notDraft' }
        : { status: 'unavailable' };
    default:
      return { status: 'unavailable' };
  }
}

async function interpretConfirm(response: Response): Promise<ConfirmScheduleOutcome> {
  if (response.status !== 200) {
    return interpretFailure(response);
  }
  const body = await readJson(response);
  const data = isRecord(body) ? body.data : undefined;
  const schedule = isRecord(data) ? data.schedule : undefined;
  return isSummary(schedule, 'OFFICIAL')
    ? { status: 'confirmed', schedule }
    : { status: 'unavailable' };
}

async function interpretDiscard(response: Response): Promise<DiscardScheduleOutcome> {
  return response.status === 204 ? { status: 'discarded' } : interpretFailure(response);
}

const schedulePath = (id: string) => `/api/schedule/${encodeURIComponent(id)}`;

export const scheduleService = {
  /** Pide qué horarios tiene el colegio con `GET /api/schedule/overview`. Nunca rechaza. */
  async overview(authorizedFetch: AuthorizedFetch): Promise<ScheduleOverviewOutcome> {
    try {
      return await interpretOverview(await authorizedFetch('/api/schedule/overview'));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Confirma el borrador como oficial con `POST /api/schedule/{id}/confirm` (solo `ADMIN`). Nunca rechaza. */
  async confirm(authorizedFetch: AuthorizedFetch, id: string): Promise<ConfirmScheduleOutcome> {
    try {
      return await interpretConfirm(
        await authorizedFetch(`${schedulePath(id)}/confirm`, { method: 'POST' }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Descarta el borrador con `DELETE /api/schedule/{id}` (solo `ADMIN`). Nunca rechaza. */
  async discard(authorizedFetch: AuthorizedFetch, id: string): Promise<DiscardScheduleOutcome> {
    try {
      return await interpretDiscard(await authorizedFetch(schedulePath(id), { method: 'DELETE' }));
    } catch {
      return { status: 'unavailable' };
    }
  },
};
