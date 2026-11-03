import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { isRecord, readJson } from './httpResponse';

export type ScheduleReadiness = components['schemas']['ScheduleReadiness'];
export type ReadinessIssue = components['schemas']['ReadinessIssue'];
export type ReadinessIssueCode = components['schemas']['ReadinessIssueCode'];

/** Lo que impide generar, en el orden en que se muestra. Deben coincidir con el contrato y con el backend. */
export const BLOCKING_CODES = [
  'SCHOOL_WITHOUT_COURSES',
  'COURSE_WITHOUT_CALENDAR',
  'WORKLOAD_EXCEEDS_SLOTS',
  'BLOCK_LARGER_THAN_LOAD',
  'SUBJECT_DOES_NOT_FIT',
  'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
  'CLASSES_WITHOUT_PROFESSOR',
  'EXCEEDS_MAX_HOURS',
  'AVAILABILITY_INSUFFICIENT',
] as const satisfies readonly ReadinessIssueCode[];

/** Lo que solo puede empeorar el resultado, en el orden en que se muestra. */
export const WARNING_CODES = [
  'SUBJECT_INACTIVE',
  'COURSE_WITHOUT_CLASSES',
  'COURSE_WITHOUT_SUBJECTS',
  'MAY_EXCEED_MAX_HOURS',
  'SEVERAL_CALENDARS',
  'SLOTS_OUTSIDE_CALENDAR',
  'PREFERRED_SLOTS_FORBIDDEN',
] as const satisfies readonly ReadinessIssueCode[];

/** Resultado de pedir la comprobación, ya interpretado: la interfaz decide según el estado. */
export type ScheduleReadinessOutcome =
  | { status: 'loaded'; readiness: ScheduleReadiness }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isCount(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

function isRef(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isProfessor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

/** Una lista de referencias con al menos una. */
function isRefList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isRef);
}

/** Un problema lleva su código y, según cuál sea, las referencias y las cifras que lo explican. */
function isIssue(value: unknown): value is ReadinessIssue {
  if (!isRecord(value) || typeof value.code !== 'string') {
    return false;
  }
  switch (value.code) {
    case 'SCHOOL_WITHOUT_COURSES':
      return true;
    case 'COURSE_WITHOUT_CALENDAR':
    case 'COURSE_WITHOUT_CLASSES':
    case 'COURSE_WITHOUT_SUBJECTS':
      return isRef(value.course);
    case 'WORKLOAD_EXCEEDS_SLOTS':
      return isRef(value.course) && isCount(value.assigned) && isCount(value.available);
    case 'BLOCK_LARGER_THAN_LOAD':
    case 'SUBJECT_DOES_NOT_FIT':
      return isRef(value.course) && isRef(value.subject);
    case 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR':
      return (
        isRef(value.course) &&
        isRef(value.subject) &&
        isRef(value.schoolClass) &&
        isProfessor(value.professor)
      );
    case 'CLASSES_WITHOUT_PROFESSOR':
      return (
        isRef(value.course) &&
        isRef(value.subject) &&
        isRefList(value.classes) &&
        isCount(value.missingCount, 1)
      );
    case 'EXCEEDS_MAX_HOURS':
    case 'MAY_EXCEED_MAX_HOURS':
      return isProfessor(value.professor);
    case 'AVAILABILITY_INSUFFICIENT':
      return (
        isProfessor(value.professor) &&
        isRef(value.calendar) &&
        isCount(value.sessions) &&
        isCount(value.available)
      );
    case 'SUBJECT_INACTIVE':
      return isRef(value.subject) && isRefList(value.courses);
    case 'SEVERAL_CALENDARS':
      return isProfessor(value.professor) && isCount(value.count, 2);
    case 'SLOTS_OUTSIDE_CALENDAR':
    case 'PREFERRED_SLOTS_FORBIDDEN':
      return isRef(value.course) && isRef(value.subject) && isCount(value.count, 1);
    default:
      return false;
  }
}

/** Todos los problemas son válidos y de los códigos de su lista (los bloqueantes entre los bloqueantes). */
function isIssueList(value: unknown, codes: readonly string[]): value is ReadinessIssue[] {
  return (
    Array.isArray(value) && value.every((issue) => isIssue(issue) && codes.includes(issue.code))
  );
}

function isReadiness(value: unknown): value is ScheduleReadiness {
  return (
    isRecord(value) &&
    typeof value.ready === 'boolean' &&
    isIssueList(value.blocking, BLOCKING_CODES) &&
    isIssueList(value.warnings, WARNING_CODES) &&
    value.ready === (value.blocking.length === 0)
  );
}

async function interpretReadiness(response: Response): Promise<ScheduleReadinessOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const body = await readJson(response);
  const readiness = isRecord(body) && isRecord(body.data) ? body.data.readiness : undefined;
  return isReadiness(readiness) ? { status: 'loaded', readiness } : { status: 'unavailable' };
}

export const scheduleReadinessService = {
  /** Pide la comprobación previa a generar los horarios con `GET /api/schedule/readiness`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch): Promise<ScheduleReadinessOutcome> {
    try {
      return await interpretReadiness(await authorizedFetch('/api/schedule/readiness'));
    } catch {
      return { status: 'unavailable' };
    }
  },
};
