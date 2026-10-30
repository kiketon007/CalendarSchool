import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { SUBJECT_COLORS, SUBJECT_STATUSES } from '../utils/subjectOptions';
import { errorCodeOf, fieldErrorsOf, isRecord, readJson } from './httpResponse';

export type CourseWorkload = components['schemas']['CourseWorkload'];
export type CourseWorkloadSubject = components['schemas']['CourseWorkloadSubject'];
export type WorkloadWarning = components['schemas']['WorkloadWarning'];
export type WorkloadWarningCode = components['schemas']['WorkloadWarningCode'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la carga horaria de un curso, ya interpretado: la interfaz decide según el estado. */
export type CourseWorkloadOutcome =
  | { status: 'loaded'; workload: CourseWorkload }
  /** El curso no existe, es de otro colegio o el id no es un UUID (`404`): no se distingue el caso. */
  | { status: 'notFound' }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de cambiar la carga horaria de un curso, ya interpretado por el estado y `error.code`. */
export type UpdateCourseWorkloadOutcome =
  /** Guardado: lleva la carga releída del servidor. */
  | { status: 'updated'; workload: CourseWorkload }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `changes[<i>].subjectId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  /** El curso ya no existe (`404`). */
  | { status: 'notFound' }
  /** El rol de la sesión no puede cambiar la carga (`403 FORBIDDEN`): solo el `ADMIN`. */
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Un cambio de la carga: `null` hace que la asignatura deje de impartirse en el curso. */
export interface CourseWorkloadChange {
  subjectId: string;
  sessionsPerWeek: number | null;
}

const WARNING_CODES: readonly string[] = [
  'COURSE_WITHOUT_CALENDAR',
  'WORKLOAD_EXCEEDS_SLOTS',
] satisfies WorkloadWarningCode[];

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Texto o `null`, y ausente no vale: el contrato manda siempre `code`. */
function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCalendar(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isCount(value.sessionsPerDay) &&
    value.sessionsPerDay >= 1
  );
}

function isWorkloadSubject(value: unknown): value is CourseWorkloadSubject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isTextOrNull(value.code) &&
    typeof value.color === 'string' &&
    (SUBJECT_COLORS as readonly string[]).includes(value.color) &&
    typeof value.status === 'string' &&
    (SUBJECT_STATUSES as readonly string[]).includes(value.status) &&
    (value.sessionsPerWeek === null ||
      (isCount(value.sessionsPerWeek) && value.sessionsPerWeek >= 1 && value.sessionsPerWeek <= 5))
  );
}

function isWarning(value: unknown): value is WorkloadWarning {
  if (!isRecord(value) || typeof value.code !== 'string' || !WARNING_CODES.includes(value.code)) {
    return false;
  }
  // El exceso lleva los dos números: sin ellos la interfaz no podría decir cuánto se pasa.
  return (
    value.code !== 'WORKLOAD_EXCEEDS_SLOTS' || (isCount(value.assigned) && isCount(value.available))
  );
}

function isCourseWorkload(value: unknown): value is CourseWorkload {
  return (
    isRecord(value) &&
    isRecord(value.course) &&
    typeof value.course.id === 'string' &&
    typeof value.course.name === 'string' &&
    (value.calendar === null || isCalendar(value.calendar)) &&
    Array.isArray(value.subjects) &&
    value.subjects.every(isWorkloadSubject) &&
    isCount(value.assignedSessions) &&
    (value.availableSessions === null || isCount(value.availableSessions)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWarning)
  );
}

/** La carga de un `200`, o `undefined` si no viene como el contrato dice. */
function workloadOf(body: unknown): CourseWorkload | undefined {
  const workload = isRecord(body) && isRecord(body.data) ? body.data.workload : undefined;
  return isCourseWorkload(workload) ? workload : undefined;
}

async function interpretGet(response: Response): Promise<CourseWorkloadOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const workload = workloadOf(body);
    return workload ? { status: 'loaded', workload } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateCourseWorkloadOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    const workload = workloadOf(body);
    return workload ? { status: 'updated', workload } : { status: 'unavailable' };
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
  return { status: 'unavailable' };
}

export const courseWorkloadService = {
  /** Pide la carga de un curso con `GET /api/courses/{id}/workload`; el `id` se codifica. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, courseId: string): Promise<CourseWorkloadOutcome> {
    try {
      return await interpretGet(
        await authorizedFetch(`/api/courses/${encodeURIComponent(courseId)}/workload`),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Cambia la carga de un curso con `PATCH /api/courses/{id}/workload` (solo el `ADMIN`): envía solo las filas
   * que cambian, con la asignatura y las sesiones de cada una y nada más (nunca el colegio). Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    courseId: string,
    changes: readonly CourseWorkloadChange[],
  ): Promise<UpdateCourseWorkloadOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(`/api/courses/${encodeURIComponent(courseId)}/workload`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changes: changes.map(({ subjectId, sessionsPerWeek }) => ({
              subjectId,
              sessionsPerWeek,
            })),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
