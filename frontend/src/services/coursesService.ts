import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type Course = components['schemas']['Course'];
export type SchoolClass = components['schemas']['SchoolClass'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la lista de cursos, ya interpretado: la interfaz decide qué hacer según el estado. */
export type CoursesOutcome =
  | { status: 'loaded'; courses: Course[] }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de crear un curso, ya interpretado por `error.code`. */
export type CreateCourseOutcome =
  | { status: 'created'; course: Course }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`). */
  | { status: 'validationError'; details: FieldError[] }
  /** El colegio ya tiene un curso con ese nombre (`409 COURSE_ALREADY_EXISTS`). */
  | { status: 'alreadyExists' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Datos del formulario: el nombre del curso y el nombre de cada clase, en orden. */
export interface CreateCourseInput {
  name: string;
  classNames: string[];
}

const FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_LENGTH',
  'INVALID_FORMAT',
  'INVALID_CHARACTERS',
  'WEAK_PASSWORD',
  'DUPLICATE',
] as const;

function isSchoolClass(value: unknown): value is SchoolClass {
  // El tutor es siempre `null` hasta que existan los profesores: cualquier otra cosa no es el contrato.
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    value.tutor === null
  );
}

/** Una fecha en texto que `Date` entiende: si no, la interfaz mostraría «Invalid Date». */
function isDateText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isCourse(value: unknown): value is Course {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isDateText(value.createdAt) &&
    Array.isArray(value.classes) &&
    value.classes.every(isSchoolClass)
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

async function interpretList(response: Response): Promise<CoursesOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const courses = isRecord(body) && isRecord(body.data) ? body.data.courses : undefined;
    return Array.isArray(courses) && courses.every(isCourse)
      ? { status: 'loaded', courses }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

async function interpretCreate(response: Response): Promise<CreateCourseOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 201) {
    const course = isRecord(body) && isRecord(body.data) ? body.data.course : undefined;
    return isCourse(course) ? { status: 'created', course } : { status: 'unavailable' };
  }
  if (response.status === 400 && code === 'VALIDATION_ERROR') {
    const details = fieldErrorsOf(body);
    return details ? { status: 'validationError', details } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 409 && code === 'COURSE_ALREADY_EXISTS') {
    return { status: 'alreadyExists' };
  }
  return { status: 'unavailable' };
}

export const coursesService = {
  /** Lista los cursos del colegio con `GET /api/courses`. Nunca rechaza (un fallo de red es `unavailable`). */
  async list(authorizedFetch: AuthorizedFetch): Promise<CoursesOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/courses'));
    } catch {
      // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
      return { status: 'unavailable' };
    }
  },

  /** Crea un curso con sus clases con `POST /api/courses`. Nunca rechaza. */
  async create(
    authorizedFetch: AuthorizedFetch,
    { name, classNames }: CreateCourseInput,
  ): Promise<CreateCourseOutcome> {
    try {
      return await interpretCreate(
        await authorizedFetch('/api/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            classes: classNames.map((className) => ({ name: className })),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
