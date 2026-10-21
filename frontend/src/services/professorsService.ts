import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type Professor = components['schemas']['Professor'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la lista de profesores, ya interpretado: la interfaz decide según el estado. */
export type ProfessorsOutcome =
  | { status: 'loaded'; professors: Professor[] }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de crear un profesor, ya interpretado por `error.code`. */
export type CreateProfessorOutcome =
  | { status: 'created'; professor: Professor }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `classId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  /** La clase elegida ya tiene tutor (`409 CLASS_ALREADY_HAS_TUTOR`). */
  | { status: 'classHasTutor' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de pedir un profesor por su id, ya interpretado. */
export type ProfessorOutcome =
  | { status: 'loaded'; professor: Professor }
  /** El profesor no existe o es de otro colegio (`404`). */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** El profesor que perdió la tutoría de la clase elegida al editar a otro. */
export type ReplacedTutor = components['schemas']['TutorSummary'];

/** Resultado de editar un profesor, ya interpretado por `error.code`. */
export type UpdateProfessorOutcome =
  | { status: 'updated'; professor: Professor; replacedTutor: ReplacedTutor | null }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `classId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  /** El profesor no existe o es de otro colegio (`404`). */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Estado final del formulario de edición: el cargo vacío es «sin cargo». */
export interface UpdateProfessorInput {
  firstName: string;
  lastName: string;
  position: string;
  /** Ausente: no se toca la tutoría; vacío: sin clase; un id: esa clase. */
  classId?: string;
}

/** Datos del formulario: el cargo y la clase vacíos significan «sin cargo» y «sin clase». */
export interface CreateProfessorInput {
  firstName: string;
  lastName: string;
  position: string;
  classId: string;
}

const FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_LENGTH',
  'INVALID_FORMAT',
  'INVALID_CHARACTERS',
  'WEAK_PASSWORD',
  'DUPLICATE',
  'NOT_FOUND',
] as const;

const POSITIONS = ['DIRECTOR', 'JEFE_ESTUDIOS'] as const;

function isTutoredClass(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.courseId === 'string' &&
    typeof value.courseName === 'string'
  );
}

function isProfessor(value: unknown): value is Professor {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string' &&
    (value.position === null || (POSITIONS as readonly unknown[]).includes(value.position)) &&
    // Las asignaturas llegan con `US-PROF-ASSIGN`: hasta entonces el contrato las manda siempre vacías.
    Array.isArray(value.subjects) &&
    value.subjects.length === 0 &&
    (value.tutoredClass === null || isTutoredClass(value.tutoredClass))
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

async function interpretList(response: Response): Promise<ProfessorsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const professors = isRecord(body) && isRecord(body.data) ? body.data.professors : undefined;
    return Array.isArray(professors) && professors.every(isProfessor)
      ? { status: 'loaded', professors }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

async function interpretCreate(response: Response): Promise<CreateProfessorOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 201) {
    const professor = isRecord(body) && isRecord(body.data) ? body.data.professor : undefined;
    return isProfessor(professor) ? { status: 'created', professor } : { status: 'unavailable' };
  }
  if (response.status === 400 && code === 'VALIDATION_ERROR') {
    const details = fieldErrorsOf(body);
    return details ? { status: 'validationError', details } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 409 && code === 'CLASS_ALREADY_HAS_TUTOR') {
    return { status: 'classHasTutor' };
  }
  return { status: 'unavailable' };
}

function isReplacedTutor(value: unknown): value is ReplacedTutor {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

async function interpretGet(response: Response): Promise<ProfessorOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const professor = isRecord(body) && isRecord(body.data) ? body.data.professor : undefined;
    return isProfessor(professor) ? { status: 'loaded', professor } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateProfessorOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
    const replacedTutor = data?.replacedTutor;
    return data !== undefined &&
      isProfessor(data.professor) &&
      (replacedTutor === null || isReplacedTutor(replacedTutor))
      ? { status: 'updated', professor: data.professor, replacedTutor }
      : { status: 'unavailable' };
  }
  if (response.status === 400 && code === 'VALIDATION_ERROR') {
    const details = fieldErrorsOf(body);
    return details ? { status: 'validationError', details } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  // Un `409 PROFESSOR_ALREADY_TUTOR` (carrera con otra escritura) es un fallo general: se puede reintentar.
  return { status: 'unavailable' };
}

export const professorsService = {
  /** Lista los profesores del colegio con `GET /api/professors`. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<ProfessorsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/professors'));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Pide un profesor con `GET /api/professors/{id}` (el `id` se codifica). Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, id: string): Promise<ProfessorOutcome> {
    try {
      return await interpretGet(await authorizedFetch(`/api/professors/${encodeURIComponent(id)}`));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Deja un profesor en el estado indicado con `PUT /api/professors/{id}`: el cargo vacío se envía como
   * `null` y la clase solo se envía si se indica (vacía es «sin clase»). Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    id: string,
    { firstName, lastName, position, classId }: UpdateProfessorInput,
  ): Promise<UpdateProfessorOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(`/api/professors/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            lastName,
            position: position === '' ? null : position,
            ...(classId !== undefined && { classId: classId === '' ? null : classId }),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Crea un profesor con `POST /api/professors`. Nunca rechaza. */
  async create(
    authorizedFetch: AuthorizedFetch,
    { firstName, lastName, position, classId }: CreateProfessorInput,
  ): Promise<CreateProfessorOutcome> {
    try {
      return await interpretCreate(
        await authorizedFetch('/api/professors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            lastName,
            // El cargo y la clase son opcionales: sin valor, no se envían.
            ...(position !== '' && { position }),
            ...(classId !== '' && { classId }),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
