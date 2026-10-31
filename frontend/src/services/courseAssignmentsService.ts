import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { SUBJECT_COLORS, SUBJECT_STATUSES } from '../utils/subjectOptions';
import { errorCodeOf, fieldErrorsOf, isRecord, readJson } from './httpResponse';

export type CourseAssignments = components['schemas']['CourseAssignments'];
export type CourseAssignment = components['schemas']['CourseAssignment'];
type FieldError = components['schemas']['FieldError'];

/** Resultado de pedir la matriz de profesores de un curso, ya interpretado. */
export type CourseAssignmentsOutcome =
  | { status: 'loaded'; assignments: CourseAssignments }
  /** El curso no existe, es de otro colegio o el id no es un UUID (`404`): no se distingue el caso. */
  | { status: 'notFound' }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Resultado de guardar la matriz, ya interpretado por el estado y `error.code`. */
export type UpdateCourseAssignmentsOutcome =
  /** Guardado: lleva la matriz releída del servidor. */
  | { status: 'updated'; assignments: CourseAssignments }
  /** El servidor rechaza campos concretos (`400 VALIDATION_ERROR`), también referencias que ya no existen. */
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'notFound' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isTutor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

function isSubject(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.code === null || typeof value.code === 'string') &&
    typeof value.color === 'string' &&
    (SUBJECT_COLORS as readonly string[]).includes(value.color) &&
    typeof value.status === 'string' &&
    (SUBJECT_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.sessionsPerWeek === 'number' &&
    Number.isInteger(value.sessionsPerWeek) &&
    value.sessionsPerWeek >= 1 &&
    value.sessionsPerWeek <= 5
  );
}

function isClass(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.tutor === null || isTutor(value.tutor))
  );
}

function isAssignment(value: unknown): value is CourseAssignment {
  return (
    isRecord(value) &&
    typeof value.subjectId === 'string' &&
    typeof value.classId === 'string' &&
    typeof value.professorId === 'string'
  );
}

function isCourseAssignments(value: unknown): value is CourseAssignments {
  return (
    isRecord(value) &&
    isRecord(value.course) &&
    typeof value.course.id === 'string' &&
    typeof value.course.name === 'string' &&
    Array.isArray(value.subjects) &&
    value.subjects.every(isSubject) &&
    Array.isArray(value.classes) &&
    value.classes.every(isClass) &&
    Array.isArray(value.assignments) &&
    value.assignments.every(isAssignment)
  );
}

/** La matriz de un `200`, o `undefined` si no viene como el contrato dice. */
function matrixOf(body: unknown): CourseAssignments | undefined {
  const assignments = isRecord(body) && isRecord(body.data) ? body.data.assignments : undefined;
  return isCourseAssignments(assignments) ? assignments : undefined;
}

async function interpretGet(response: Response): Promise<CourseAssignmentsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const assignments = matrixOf(body);
    return assignments ? { status: 'loaded', assignments } : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { status: 'notFound' };
  }
  return { status: 'unavailable' };
}

async function interpretUpdate(response: Response): Promise<UpdateCourseAssignmentsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const assignments = matrixOf(body);
    return assignments ? { status: 'updated', assignments } : { status: 'unavailable' };
  }
  if (response.status === 400 && errorCodeOf(body) === 'VALIDATION_ERROR') {
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

const assignmentsPath = (courseId: string) =>
  `/api/courses/${encodeURIComponent(courseId)}/assignments`;

export const courseAssignmentsService = {
  /** Pide la matriz de profesores de un curso con `GET /api/courses/{id}/assignments`. Nunca rechaza. */
  async get(authorizedFetch: AuthorizedFetch, courseId: string): Promise<CourseAssignmentsOutcome> {
    try {
      return await interpretGet(await authorizedFetch(assignmentsPath(courseId)));
    } catch {
      return { status: 'unavailable' };
    }
  },

  /**
   * Guarda la matriz con `PUT` en la misma ruta: envía el estado final, solo la asignatura, la clase y el
   * profesor de cada celda y nada más (nunca el colegio). Una lista vacía deja todo sin asignar. Nunca rechaza.
   */
  async update(
    authorizedFetch: AuthorizedFetch,
    courseId: string,
    assignments: readonly CourseAssignment[],
  ): Promise<UpdateCourseAssignmentsOutcome> {
    try {
      return await interpretUpdate(
        await authorizedFetch(assignmentsPath(courseId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignments: assignments.map(({ subjectId, classId, professorId }) => ({
              subjectId,
              classId,
              professorId,
            })),
          }),
        }),
      );
    } catch {
      return { status: 'unavailable' };
    }
  },
};
