import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { SUBJECT_COLORS, SUBJECT_STATUSES, SUBJECT_TYPES } from '../utils/subjectOptions';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type Subject = components['schemas']['Subject'];
export type SubjectCourse = components['schemas']['SubjectCourse'];
export type SubjectType = components['schemas']['SubjectType'];
export type SubjectStatus = components['schemas']['SubjectStatus'];
export type SubjectColor = components['schemas']['SubjectColor'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la lista de asignaturas, ya interpretado: la interfaz decide según el estado. */
export type SubjectsOutcome =
  | { status: 'loaded'; subjects: Subject[] }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de crear una asignatura, ya interpretado por `error.code`. */
export type CreateSubjectOutcome =
  | { status: 'created'; subject: Subject }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `courses[<i>].courseId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  /** El colegio ya tiene una asignatura con ese nombre (`409 SUBJECT_ALREADY_EXISTS`). */
  | { status: 'alreadyExists' }
  /** El colegio ya tiene una asignatura con ese código (`409 SUBJECT_CODE_ALREADY_EXISTS`). */
  | { status: 'codeAlreadyExists' }
  /** El rol de la sesión no puede crear asignaturas (`403 FORBIDDEN`): solo el `ADMIN`. */
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de pedir una asignatura por su id (US-SUBJECT_b). */
export type SubjectOutcome =
  | { status: 'loaded'; subject: Subject }
  /** No existe, es de otro colegio o el id no es un UUID (`404`): no se distingue el caso. */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de editar una asignatura, ya interpretado por `error.code`. */
export type UpdateSubjectOutcome =
  | { status: 'updated'; subject: Subject }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `courses[<i>].courseId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  /** Otra asignatura del colegio ya tiene ese nombre (`409 SUBJECT_ALREADY_EXISTS`). */
  | { status: 'alreadyExists' }
  /** Otra asignatura del colegio ya tiene ese código (`409 SUBJECT_CODE_ALREADY_EXISTS`). */
  | { status: 'codeAlreadyExists' }
  /** La asignatura ya no existe (`404`). */
  | { status: 'notFound' }
  /** El rol de la sesión no puede editar asignaturas (`403 FORBIDDEN`): solo el `ADMIN`. */
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de borrar una asignatura, ya interpretado por el estado y `error.code`. */
export type DeleteSubjectOutcome =
  | { status: 'deleted'; id: string }
  /** La asignatura ya no existe (`404`). */
  | { status: 'notFound' }
  /** El rol de la sesión no puede borrar asignaturas (`403 FORBIDDEN`): solo el `ADMIN`. */
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Datos del formulario ya listos para enviar: lo vacío ya es `null` y los cursos llevan sus sesiones. */
export interface CreateSubjectInput {
  name: string;
  code: string | null;
  type: SubjectType;
  status: SubjectStatus;
  description: string | null;
  color: SubjectColor;
  courses: { courseId: string; sessionsPerWeek: number }[];
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
  'OUT_OF_RANGE',
] as const;

/** Una fecha en texto que `Date` entiende: si no, la interfaz mostraría «Invalid Date». */
function isDateText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isSubjectCourse(value: unknown): value is SubjectCourse {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.sessionsPerWeek === 'number' &&
    Number.isInteger(value.sessionsPerWeek) &&
    value.sessionsPerWeek >= 1 &&
    value.sessionsPerWeek <= 5
  );
}

/** Texto o `null`, y ausente no vale: el contrato manda siempre `code` y `description`. */
function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isSubject(value: unknown): value is Subject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isTextOrNull(value.code) &&
    typeof value.type === 'string' &&
    (SUBJECT_TYPES as readonly string[]).includes(value.type) &&
    typeof value.status === 'string' &&
    (SUBJECT_STATUSES as readonly string[]).includes(value.status) &&
    isTextOrNull(value.description) &&
    typeof value.color === 'string' &&
    (SUBJECT_COLORS as readonly string[]).includes(value.color) &&
    isDateText(value.createdAt) &&
    Array.isArray(value.courses) &&
    value.courses.every(isSubjectCourse)
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

async function interpretList(response: Response): Promise<SubjectsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const subjects = isRecord(body) && isRecord(body.data) ? body.data.subjects : undefined;
    return Array.isArray(subjects) && subjects.every(isSubject)
      ? { status: 'loaded', subjects }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

async function interpretCreate(response: Response): Promise<CreateSubjectOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 201) {
    const subject = isRecord(body) && isRecord(body.data) ? body.data.subject : undefined;
    return isSubject(subject) ? { status: 'created', subject } : { status: 'unavailable' };
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
  if (response.status === 409 && code === 'SUBJECT_ALREADY_EXISTS') {
    return { status: 'alreadyExists' };
  }
  if (response.status === 409 && code === 'SUBJECT_CODE_ALREADY_EXISTS') {
    return { status: 'codeAlreadyExists' };
  }
  return { status: 'unavailable' };
}

async function interpretGet(response: Response): Promise<SubjectOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const subject = isRecord(body) && isRecord(body.data) ? body.data.subject : undefined;
    return isSubject(subject) ? { status: 'loaded', subject } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateSubjectOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    const subject = isRecord(body) && isRecord(body.data) ? body.data.subject : undefined;
    return isSubject(subject) ? { status: 'updated', subject } : { status: 'unavailable' };
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
  if (response.status === 409 && code === 'SUBJECT_ALREADY_EXISTS') {
    return { status: 'alreadyExists' };
  }
  if (response.status === 409 && code === 'SUBJECT_CODE_ALREADY_EXISTS') {
    return { status: 'codeAlreadyExists' };
  }
  return { status: 'unavailable' };
}

async function interpretDelete(response: Response): Promise<DeleteSubjectOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const deleted = isRecord(body) && isRecord(body.data) ? body.data.deleted : undefined;
    return isRecord(deleted) && typeof deleted.id === 'string'
      ? { status: 'deleted', id: deleted.id }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403 && errorCodeOf(body) === 'FORBIDDEN') {
    return { status: 'forbidden' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

export const subjectsService = {
  /** Lista las asignaturas del colegio con `GET /api/subjects`. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<SubjectsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/subjects'));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Crea una asignatura con `POST /api/subjects` (solo el `ADMIN`). Envía exactamente los campos que decide el
   * formulario, nada más (nunca el colegio). Nunca rechaza.
   */
  async create(
    authorizedFetch: AuthorizedFetch,
    { name, code, type, status, description, color, courses }: CreateSubjectInput,
  ): Promise<CreateSubjectOutcome> {
    try {
      return await interpretCreate(
        await authorizedFetch('/api/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code, type, status, description, color, courses }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Pide una asignatura con `GET /api/subjects/{id}`; el `id` se codifica. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, id: string): Promise<SubjectOutcome> {
    try {
      return await interpretGet(await authorizedFetch(`/api/subjects/${encodeURIComponent(id)}`));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Deja una asignatura en el estado indicado con `PUT /api/subjects/{id}` (solo el `ADMIN`): el mismo
   * cuerpo que el alta, nada más (nunca el colegio ni el id). Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    id: string,
    { name, code, type, status, description, color, courses }: CreateSubjectInput,
  ): Promise<UpdateSubjectOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(`/api/subjects/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code, type, status, description, color, courses }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Borra una asignatura con `DELETE /api/subjects/{id}` (solo el `ADMIN`), sin cuerpo; el `id` se codifica.
   * Nunca rechaza.
   */
  async delete(authorizedFetch: AuthorizedFetch, id: string): Promise<DeleteSubjectOutcome> {
    try {
      return await interpretDelete(
        await authorizedFetch(`/api/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
