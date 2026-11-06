import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { isScheduleScore } from '../utils/scheduleScore';
import { SUBJECT_COLORS } from '../utils/subjectOptions';
import { isRecord, readJson } from './httpResponse';

export type ScheduleDetail = components['schemas']['ScheduleDetail'];
type ScheduleStatus = ScheduleDetail['status'];
export type ScheduleDraftCourse = components['schemas']['ScheduleDraftCourse'];
export type ScheduleDraftSubject = components['schemas']['ScheduleDraftSubject'];
export type ScheduleDraftProfessor = components['schemas']['ScheduleDraftProfessor'];
export type ScheduleDraftEntry = components['schemas']['ScheduleDraftEntry'];

/** Resultado de pedir el borrador, ya interpretado: la interfaz decide según el estado. */
export type ScheduleDraftOutcome =
  /** El borrador del colegio, o `null` si no hay ninguno. */
  | { status: 'loaded'; schedule: ScheduleDetail | null }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de pedir un horario oficial por su id (US-ALGO-CONFIRM_b). */
export type ScheduleByIdOutcome =
  /** El oficial, vigente o sustituido. */
  | { status: 'loaded'; schedule: ScheduleDetail }
  /** No existe, no es un oficial o es de otro colegio (`404`). */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Una hora `HH:MM` de 24 horas, como la escribe la API. */
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/u;

function minutesOf(value: unknown): number | null {
  const match = typeof value === 'string' ? CLOCK.exec(value) : null;
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** Un objeto con `id` y `name` de texto. */
function hasIdAndName(value: Record<string, unknown>): boolean {
  return typeof value.id === 'string' && typeof value.name === 'string';
}

function isRef(value: unknown): value is { id: string; name: string } {
  return isRecord(value) && hasIdAndName(value);
}

function isDateText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isPeriod(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === 'SESSION' || value.type === 'BREAK') &&
    minutesOf(value.startTime) !== null &&
    minutesOf(value.endTime) !== null
  );
}

function isCalendar(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      hasIdAndName(value) &&
      Array.isArray(value.periods) &&
      value.periods.every(isPeriod))
  );
}

function isCourse(value: unknown): value is ScheduleDraftCourse {
  return (
    isRecord(value) &&
    hasIdAndName(value) &&
    isCalendar(value.calendar) &&
    Array.isArray(value.classes) &&
    value.classes.every(isRef)
  );
}

function isSubject(value: unknown): value is ScheduleDraftSubject {
  return (
    isRecord(value) &&
    hasIdAndName(value) &&
    (value.code === null || typeof value.code === 'string') &&
    (SUBJECT_COLORS as readonly unknown[]).includes(value.color)
  );
}

function isProfessor(value: unknown): value is ScheduleDraftProfessor {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

/** Una entrada es válida si su día, su sesión y sus horas lo son; sus referencias se comprueban aparte. */
function isEntryShape(value: unknown): value is ScheduleDraftEntry {
  if (!isRecord(value)) {
    return false;
  }
  const start = minutesOf(value.startTime);
  const end = minutesOf(value.endTime);
  return (
    typeof value.courseId === 'string' &&
    typeof value.classId === 'string' &&
    typeof value.subjectId === 'string' &&
    (value.professorId === null || typeof value.professorId === 'string') &&
    typeof value.dayOfWeek === 'number' &&
    Number.isInteger(value.dayOfWeek) &&
    value.dayOfWeek >= 1 &&
    value.dayOfWeek <= 5 &&
    typeof value.sessionNumber === 'number' &&
    Number.isInteger(value.sessionNumber) &&
    value.sessionNumber >= 1 &&
    start !== null &&
    end !== null &&
    start < end
  );
}

/**
 * Toda entrada apunta a un curso, a una clase de ese curso, a una asignatura y, si no es `null`, a un profesor de la
 * respuesta: las vistas las buscan por id y una referencia rota no tendría dónde pintarse.
 */
function referencesAreCoherent(draft: ScheduleDetail): boolean {
  const classesOf = new Map(
    draft.courses.map(({ id, classes }) => [
      id,
      new Set(classes.map((schoolClass) => schoolClass.id)),
    ]),
  );
  const subjects = new Set(draft.subjects.map(({ id }) => id));
  const professors = new Set(draft.professors.map(({ id }) => id));
  return draft.entries.every(
    ({ courseId, classId, subjectId, professorId }) =>
      classesOf.get(courseId)?.has(classId) === true &&
      subjects.has(subjectId) &&
      (professorId === null || professors.has(professorId)),
  );
}

/** Quién confirmó un horario: su nombre y sus apellidos. */
function isConfirmedBy(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.firstName === 'string' && typeof value.lastName === 'string'
  );
}

/**
 * La confirmación de un horario según su estado: un borrador no lleva ninguna (`confirmedAt`, `confirmedBy` y
 * `replacedAt` son `null`); un oficial sabe cuándo y quién lo confirmó, y puede estar sustituido.
 */
function confirmationIsCoherent(value: Record<string, unknown>, status: ScheduleStatus): boolean {
  if (status === 'DRAFT') {
    return value.confirmedAt === null && value.confirmedBy === null && value.replacedAt === null;
  }
  return (
    isDateText(value.confirmedAt) &&
    isConfirmedBy(value.confirmedBy) &&
    (value.replacedAt === null || isDateText(value.replacedAt))
  );
}

function isSchedule(value: unknown, status: ScheduleStatus): value is ScheduleDetail {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.status === status &&
    confirmationIsCoherent(value, status) &&
    isDateText(value.generatedAt) &&
    typeof value.placedSessions === 'number' &&
    Number.isInteger(value.placedSessions) &&
    value.placedSessions >= 0 &&
    (value.score === null || isScheduleScore(value.score)) &&
    Array.isArray(value.courses) &&
    value.courses.every(isCourse) &&
    Array.isArray(value.subjects) &&
    value.subjects.every(isSubject) &&
    Array.isArray(value.professors) &&
    value.professors.every(isProfessor) &&
    Array.isArray(value.entries) &&
    value.entries.every(isEntryShape) &&
    referencesAreCoherent(value as unknown as ScheduleDetail)
  );
}

async function interpretSchedule(
  response: Response,
  status: ScheduleStatus,
): Promise<ScheduleDraftOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const body = await readJson(response);
  const data = isRecord(body) ? body.data : undefined;
  if (!isRecord(data) || !('schedule' in data)) {
    return { status: 'unavailable' };
  }
  if (data.schedule === null) {
    return { status: 'loaded', schedule: null };
  }
  return isSchedule(data.schedule, status)
    ? { status: 'loaded', schedule: data.schedule }
    : { status: 'unavailable' };
}

async function read(
  authorizedFetch: AuthorizedFetch,
  path: string,
  status: ScheduleStatus,
): Promise<ScheduleDraftOutcome> {
  try {
    return await interpretSchedule(await authorizedFetch(path), status);
  } catch {
    return { status: 'unavailable' };
  }
}

async function readById(
  authorizedFetch: AuthorizedFetch,
  id: string,
): Promise<ScheduleByIdOutcome> {
  try {
    const response = await authorizedFetch(`/api/schedule/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return { status: 'notFound' };
    }
    const outcome = await interpretSchedule(response, 'OFFICIAL');
    if (outcome.status !== 'loaded') {
      return outcome;
    }
    // Por id nunca se devuelve `null`: un oficial que no existe es un `404`.
    return outcome.schedule === null
      ? { status: 'unavailable' }
      : { status: 'loaded', schedule: outcome.schedule };
  } catch {
    return { status: 'unavailable' };
  }
}

export const scheduleDraftService = {
  /** Pide el horario borrador del colegio con `GET /api/schedule/draft`. Nunca rechaza. */
  getDraft(authorizedFetch: AuthorizedFetch): Promise<ScheduleDraftOutcome> {
    return read(authorizedFetch, '/api/schedule/draft', 'DRAFT');
  },

  /** Pide el horario oficial vigente del colegio con `GET /api/schedule/official`. Nunca rechaza. */
  getOfficial(authorizedFetch: AuthorizedFetch): Promise<ScheduleDraftOutcome> {
    return read(authorizedFetch, '/api/schedule/official', 'OFFICIAL');
  },

  /**
   * Pide un horario oficial del colegio, vigente o sustituido, con `GET /api/schedule/{id}` (US-ALGO-CONFIRM_b).
   * Nunca rechaza.
   */
  getById(authorizedFetch: AuthorizedFetch, id: string): Promise<ScheduleByIdOutcome> {
    return readById(authorizedFetch, id);
  },
};
