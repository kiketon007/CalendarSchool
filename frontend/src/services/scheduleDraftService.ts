import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { SUBJECT_COLORS } from '../utils/subjectOptions';
import { isRecord, readJson } from './httpResponse';

export type ScheduleDraft = components['schemas']['ScheduleDraft'];
export type ScheduleDraftCourse = components['schemas']['ScheduleDraftCourse'];
export type ScheduleDraftSubject = components['schemas']['ScheduleDraftSubject'];
export type ScheduleDraftProfessor = components['schemas']['ScheduleDraftProfessor'];
export type ScheduleDraftEntry = components['schemas']['ScheduleDraftEntry'];

/** Resultado de pedir el borrador, ya interpretado: la interfaz decide según el estado. */
export type ScheduleDraftOutcome =
  /** El borrador del colegio, o `null` si no hay ninguno. */
  | { status: 'loaded'; schedule: ScheduleDraft | null }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
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
function referencesAreCoherent(draft: ScheduleDraft): boolean {
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

function isDraft(value: unknown): value is ScheduleDraft {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.status === 'DRAFT' &&
    isDateText(value.generatedAt) &&
    typeof value.placedSessions === 'number' &&
    Number.isInteger(value.placedSessions) &&
    value.placedSessions >= 0 &&
    Array.isArray(value.courses) &&
    value.courses.every(isCourse) &&
    Array.isArray(value.subjects) &&
    value.subjects.every(isSubject) &&
    Array.isArray(value.professors) &&
    value.professors.every(isProfessor) &&
    Array.isArray(value.entries) &&
    value.entries.every(isEntryShape) &&
    referencesAreCoherent(value as unknown as ScheduleDraft)
  );
}

async function interpretDraft(response: Response): Promise<ScheduleDraftOutcome> {
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
  return isDraft(data.schedule)
    ? { status: 'loaded', schedule: data.schedule }
    : { status: 'unavailable' };
}

export const scheduleDraftService = {
  /** Pide el horario borrador del colegio con `GET /api/schedule/draft`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch): Promise<ScheduleDraftOutcome> {
    try {
      return await interpretDraft(await authorizedFetch('/api/schedule/draft'));
    } catch {
      return { status: 'unavailable' };
    }
  },
};
