import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { isRecord, readJson } from './httpResponse';
import { isProfessorSubject } from './professorsService';

export type ProfessorsSummary = components['schemas']['ProfessorsSummary'];
export type ProfessorLoad = components['schemas']['ProfessorLoad'];
export type ProfessorLoadWarning = components['schemas']['ProfessorLoadWarning'];
export type ProfessorLoadStatus = ProfessorLoad['status'];
export type UnassignedCourse = components['schemas']['UnassignedCourse'];

/** Los estados de la carga en el orden de los filtros. Deben coincidir con `ProfessorLoad.status` del contrato. */
export const PROFESSOR_LOAD_STATUSES = [
  'NO_LOAD',
  'FITS',
  'MAY_EXCEED',
  'EXCEEDS',
] as const satisfies readonly ProfessorLoadStatus[];

/** El máximo de horas lectivas a la semana de un profesor (23 h) en minutos, el que dice el contrato. */
const MAX_TEACHING_MINUTES = 1380;

/** Resultado de pedir el resumen de carga, ya interpretado: la interfaz decide según el estado. */
export type ProfessorsSummaryOutcome =
  | { status: 'loaded'; summary: ProfessorsSummary }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isCount(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

function isRef(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

/** Un aviso lleva su código y, según cuál sea, los datos que lo explican. */
function isWarning(value: unknown): value is ProfessorLoadWarning {
  if (!isRecord(value) || typeof value.code !== 'string') {
    return false;
  }
  switch (value.code) {
    case 'EXCEEDS_MAX_HOURS':
    case 'MAY_EXCEED_MAX_HOURS':
      return true;
    case 'AVAILABILITY_INSUFFICIENT':
      return isRef(value.calendar) && isCount(value.sessions) && isCount(value.available);
    case 'COURSE_WITHOUT_CALENDAR':
      return isRef(value.course) && isCount(value.assignmentCount, 1);
    case 'SEVERAL_CALENDARS':
      return isCount(value.calendarCount, 2);
    default:
      return false;
  }
}

function isLoad(value: unknown): value is ProfessorLoad {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string' &&
    Array.isArray(value.subjects) &&
    value.subjects.every(isProfessorSubject) &&
    Array.isArray(value.courses) &&
    value.courses.every(isRef) &&
    isCount(value.sessionsPerWeek) &&
    isCount(value.minMinutes) &&
    isCount(value.maxMinutes) &&
    value.minMinutes <= value.maxMinutes &&
    typeof value.status === 'string' &&
    (PROFESSOR_LOAD_STATUSES as readonly string[]).includes(value.status) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWarning)
  );
}

function isUnassigned(value: unknown): value is UnassignedCourse {
  return (
    isRecord(value) &&
    typeof value.courseId === 'string' &&
    typeof value.courseName === 'string' &&
    isCount(value.missingCount, 1)
  );
}

function isSummary(value: unknown): value is ProfessorsSummary {
  return (
    isRecord(value) &&
    value.maxTeachingMinutes === MAX_TEACHING_MINUTES &&
    Array.isArray(value.professors) &&
    value.professors.every(isLoad) &&
    Array.isArray(value.unassigned) &&
    value.unassigned.every(isUnassigned)
  );
}

async function interpretSummary(response: Response): Promise<ProfessorsSummaryOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const body = await readJson(response);
  const summary = isRecord(body) && isRecord(body.data) ? body.data.summary : undefined;
  return isSummary(summary) ? { status: 'loaded', summary } : { status: 'unavailable' };
}

export const professorsSummaryService = {
  /** Pide el resumen de carga con `GET /api/professors/summary`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch): Promise<ProfessorsSummaryOutcome> {
    try {
      return await interpretSummary(await authorizedFetch('/api/professors/summary'));
    } catch {
      return { status: 'unavailable' };
    }
  },
};
