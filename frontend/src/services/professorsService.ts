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

export const professorsService = {
  /** Lista los profesores del colegio con `GET /api/professors`. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<ProfessorsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/professors'));
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
