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

/** Resultado de pedir un curso, ya interpretado. */
export type CourseOutcome =
  | { status: 'loaded'; course: Course }
  /** El curso no existe en el colegio (`404`): otro colegio, inexistente o un id mal formado. */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de editar un curso, ya interpretado por `error.code`. */
export type UpdateCourseOutcome =
  | { status: 'updated'; course: Course }
  | { status: 'validationError'; details: FieldError[] }
  /** Otro curso del colegio ya tiene ese nombre (`409 COURSE_ALREADY_EXISTS`). */
  | { status: 'alreadyExists' }
  /** Una clase enviada ya no pertenece al curso (`409 COURSE_CHANGED`): hay que recargarlo. */
  | { status: 'courseChanged' }
  /** Un profesor elegido ya tutoriza otra clase que la edición no libera (`409 PROFESSOR_ALREADY_TUTOR`). */
  | { status: 'professorAlreadyTutor' }
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Lo que se pierde (o se ha perdido) al borrar un curso: sus clases y los alumnos asignados. */
export type CourseImpact = components['schemas']['CourseImpact'];

/** Resultado de pedir el impacto de borrar un curso, ya interpretado. */
export type CourseImpactOutcome =
  | { status: 'loaded'; impact: CourseImpact }
  /** El curso ya no existe en el colegio (`404`). */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de borrar un curso, ya interpretado. */
export type DeleteCourseOutcome =
  /** Borrado; `deleted` es lo que se borró de verdad, que puede diferir del impacto que se vio. */
  | { status: 'deleted'; deleted: CourseImpact }
  /** El curso ya no existe en el colegio (`404`): otra persona lo borró antes. */
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Datos del formulario: el nombre del curso y el nombre de cada clase, en orden. */
export interface CreateCourseInput {
  name: string;
  classNames: string[];
}

/**
 * Estado final del curso que se envía al editar: una clase con `id` ya existe; sin él, es nueva. El
 * `tutorId` de cada clase es opcional: ausente, el tutor no cambia; `null`, se quita; un UUID, ese
 * profesor pasa a ser su tutor.
 */
export interface UpdateCourseInput {
  name: string;
  classes: { id?: string; name: string; tutorId?: string | null }[];
}

const FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_LENGTH',
  'INVALID_FORMAT',
  'INVALID_CHARACTERS',
  'WEAK_PASSWORD',
  'DUPLICATE',
] as const;

function isTutor(value: unknown): value is NonNullable<SchoolClass['tutor']> {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

/** Número de alumnos (US14_b): un entero no negativo; otra cosa pintaría «NaN» o un número absurdo. */
function isStudentCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isSchoolClass(value: unknown): value is SchoolClass {
  // El tutor es el profesor que la tutoriza o `null` si la clase no tiene (US09).
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.tutor === null || isTutor(value.tutor)) &&
    isStudentCount(value.studentCount) &&
    // Las asignaciones de profesores de la clase (US-PROF-ASSIGN_b): un entero no negativo, como los alumnos.
    isStudentCount(value.assignmentCount)
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
    isStudentCount(value.studentCount) &&
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

/** Lee `data.course` de una respuesta correcta. */
function courseOf(body: unknown): Course | undefined {
  const course = isRecord(body) && isRecord(body.data) ? body.data.course : undefined;
  return isCourse(course) ? course : undefined;
}

/** Un recuento del contrato: un entero no negativo. */
const isCount = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;

function isImpact(value: unknown): value is CourseImpact {
  return (
    isRecord(value) &&
    isCount(value.classCount) &&
    isCount(value.studentCount) &&
    isCount(value.constraintCount) &&
    isCount(value.assignmentCount)
  );
}

/** Lee `data[key]` de una respuesta correcta como un impacto. */
function impactOf(body: unknown, key: 'impact' | 'deleted'): CourseImpact | undefined {
  const impact = isRecord(body) && isRecord(body.data) ? body.data[key] : undefined;
  return isImpact(impact) ? impact : undefined;
}

async function interpretImpact(response: Response): Promise<CourseImpactOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const impact = impactOf(body, 'impact');
    return impact ? { status: 'loaded', impact } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretDelete(response: Response): Promise<DeleteCourseOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const deleted = impactOf(body, 'deleted');
    return deleted ? { status: 'deleted', deleted } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretGet(response: Response): Promise<CourseOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const course = courseOf(body);
    return course ? { status: 'loaded', course } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateCourseOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    const course = courseOf(body);
    return course ? { status: 'updated', course } : { status: 'unavailable' };
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
  if (response.status === 409 && code === 'COURSE_ALREADY_EXISTS') {
    return { status: 'alreadyExists' };
  }
  if (response.status === 409 && code === 'COURSE_CHANGED') {
    return { status: 'courseChanged' };
  }
  if (response.status === 409 && code === 'PROFESSOR_ALREADY_TUTOR') {
    return { status: 'professorAlreadyTutor' };
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

  /**
   * Lee un curso con `GET /api/courses/{id}`. El `id` viene de la barra de direcciones, así que se
   * codifica. Nunca rechaza.
   */
  async get(authorizedFetch: AuthorizedFetch, id: string): Promise<CourseOutcome> {
    try {
      return await interpretGet(await authorizedFetch(`/api/courses/${encodeURIComponent(id)}`));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Deja un curso en el estado indicado con `PUT /api/courses/{id}`: las clases con `id` se conservan
   * (renombradas), las que no lo tienen se crean y las ausentes se borran. Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    id: string,
    { name, classes }: UpdateCourseInput,
  ): Promise<UpdateCourseOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(`/api/courses/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, classes }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Pide qué se perdería al borrar un curso con `GET /api/courses/{id}/impact`: lo usa el diálogo de
   * confirmación. El `id` se codifica. Nunca rechaza.
   */
  async getImpact(authorizedFetch: AuthorizedFetch, id: string): Promise<CourseImpactOutcome> {
    try {
      return await interpretImpact(
        await authorizedFetch(`/api/courses/${encodeURIComponent(id)}/impact`),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },

  /** Borra un curso con sus clases con `DELETE /api/courses/{id}` (sin cuerpo). Nunca rechaza. */
  async delete(authorizedFetch: AuthorizedFetch, id: string): Promise<DeleteCourseOutcome> {
    try {
      return await interpretDelete(
        await authorizedFetch(`/api/courses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
