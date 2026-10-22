import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

/** Alumno con todos sus datos, incluidos los sensibles: solo lo devuelven el alta, la lectura y la edición. */
export type Student = components['schemas']['Student'];
/** Alumno tal como lo muestra el listado: sin tipo de comida ni observaciones. */
export type StudentSummary = components['schemas']['StudentSummary'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la lista de alumnos, ya interpretado: la interfaz decide según el estado. */
export type StudentsOutcome =
  | { status: 'loaded'; students: StudentSummary[] }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de crear un alumno, ya interpretado por `error.code`. */
export type CreateStudentOutcome =
  | { status: 'created'; student: Student }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `courseId` o `classId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de leer un alumno con `GET /api/students/{id}`, ya interpretado. */
export type StudentOutcome =
  | { status: 'loaded'; student: Student }
  /** Otro colegio, inexistente o un identificador que no es un UUID: no se distingue el caso. */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de editar un alumno con `PUT /api/students/{id}`, ya interpretado por `error.code`. */
export type UpdateStudentOutcome =
  | { status: 'updated'; student: Student }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también `courseId` o `classId` con `NOT_FOUND`. */
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/**
 * Datos del formulario (los mismos al crear y al editar): la clase, el tipo de comida y las observaciones vacíos significan «ninguno», y la
 * beca y el tipo de comida solo se envían si el alumno come en el comedor.
 */
export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  courseId: string;
  classId: string;
  cafeteria: boolean;
  scholarship: boolean;
  foodType: string;
  observations: string;
}

/**
 * Cuerpo que se envía al crear y al editar un alumno: el **estado final**. No lleva la clase, el tipo de
 * comida ni las observaciones si están vacíos, ni la beca ni el tipo de comida si no come en el comedor.
 */
export function toStudentBody({
  firstName,
  lastName,
  courseId,
  classId,
  cafeteria,
  scholarship,
  foodType,
  observations,
}: CreateStudentInput) {
  return {
    firstName,
    lastName,
    courseId,
    ...(classId !== '' && { classId }),
    cafeteria,
    ...(cafeteria && { scholarship }),
    ...(cafeteria && foodType !== '' && { foodType }),
    ...(observations !== '' && { observations }),
  };
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
] as const;

function isReference(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isStudentSummary(value: unknown): value is StudentSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string' &&
    (value.course === null || isReference(value.course)) &&
    (value.class === null || isReference(value.class)) &&
    typeof value.cafeteria === 'boolean' &&
    (value.scholarship === null || typeof value.scholarship === 'boolean')
  );
}

function isStudent(value: unknown): value is Student {
  if (!isStudentSummary(value)) {
    return false;
  }
  // Los datos sensibles son obligatorios en el alta (texto o `null`), aunque el resumen no los lleve.
  const sensitive: Record<string, unknown> = { ...value };
  return (
    (sensitive.foodType === null || typeof sensitive.foodType === 'string') &&
    (sensitive.observations === null || typeof sensitive.observations === 'string')
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

async function interpretList(response: Response): Promise<StudentsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const students = isRecord(body) && isRecord(body.data) ? body.data.students : undefined;
    return Array.isArray(students) && students.every(isStudentSummary)
      ? { status: 'loaded', students }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

async function interpretCreate(response: Response): Promise<CreateStudentOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 201) {
    const student = isRecord(body) && isRecord(body.data) ? body.data.student : undefined;
    return isStudent(student) ? { status: 'created', student } : { status: 'unavailable' };
  }
  if (response.status === 400 && code === 'VALIDATION_ERROR') {
    const details = fieldErrorsOf(body);
    return details ? { status: 'validationError', details } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

async function interpretGet(response: Response): Promise<StudentOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const student = isRecord(body) && isRecord(body.data) ? body.data.student : undefined;
    return isStudent(student) ? { status: 'loaded', student } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateStudentOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    const student = isRecord(body) && isRecord(body.data) ? body.data.student : undefined;
    return isStudent(student) ? { status: 'updated', student } : { status: 'unavailable' };
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
  return { status: 'unavailable' };
}

export const studentsService = {
  /** Lista los alumnos del colegio con `GET /api/students`. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<StudentsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/students'));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Crea un alumno con `POST /api/students`. No envía la clase, el tipo de comida ni las observaciones si
   * están vacíos, ni la beca ni el tipo de comida si no come en el comedor. Nunca rechaza.
   */
  async create(
    authorizedFetch: AuthorizedFetch,
    input: CreateStudentInput,
  ): Promise<CreateStudentOutcome> {
    try {
      return await interpretCreate(
        await authorizedFetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toStudentBody(input)),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Lee un alumno con todos sus datos con `GET /api/students/{id}`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, id: string): Promise<StudentOutcome> {
    try {
      return await interpretGet(await authorizedFetch(`/api/students/${encodeURIComponent(id)}`));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Deja un alumno en el estado indicado con `PUT /api/students/{id}`: el mismo cuerpo que el alta
   * (`toStudentBody`), en el que lo que falta queda vacío. Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    id: string,
    input: CreateStudentInput,
  ): Promise<UpdateStudentOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(`/api/students/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toStudentBody(input)),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
