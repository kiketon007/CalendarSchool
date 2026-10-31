import { z } from 'zod';
import type { AssignmentCell } from '../../domain/assignment/courseAssignments.js';
import type { FieldError } from '../validationError.js';

/** Máximo de asignaciones en una petición: por encima, la petición no es de una matriz de un curso. */
export const MAX_ASSIGNMENTS = 2000;

export interface UpdateCourseAssignmentsInput {
  /** Las asignaciones tal como llegaron, en el orden del cuerpo. */
  assignments: AssignmentCell[];
}

export type ParseUpdateCourseAssignmentsResult =
  { success: true; data: UpdateCourseAssignmentsInput } | { success: false; details: FieldError[] };

const uuid = z.uuid();
const FIELDS = ['subjectId', 'classId', 'professorId'] as const;

/** Lee un identificador: `REQUIRED` si falta, `INVALID_FORMAT` si no es un UUID. */
function parseId(value: unknown, field: string, details: FieldError[]): string | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  const parsed = uuid.safeParse(value);
  if (!parsed.success) {
    details.push({ field, code: 'INVALID_FORMAT' });
    return undefined;
  }
  return parsed.data;
}

/**
 * Valida el cuerpo de `PUT /api/courses/{id}/assignments` (US-PROF-ASSIGN), que es el **estado final** de las
 * asignaciones del curso. Devuelve un error por campo, por posición y en el orden del cuerpo: `assignments`
 * (`REQUIRED` si falta o no es una lista, `INVALID_LENGTH` con más de 2000 entradas, y entonces no se lee
 * ninguna), por cada entrada `subjectId`, `classId` y `professorId` (`REQUIRED`, `INVALID_FORMAT` si no es un
 * UUID) y `assignments[i]` con `DUPLICATE` desde la segunda entrada válida con la misma asignatura y clase (aunque
 * traiga otro profesor). Que la asignatura se imparta en el curso, la clase sea suya y el profesor sea del colegio
 * lo comprueba el repositorio bajo el bloqueo (`NOT_FOUND`). Cualquier otra propiedad, también un `schoolId`, se
 * ignora.
 */
export function parseUpdateCourseAssignmentsRequest(
  body: unknown,
): ParseUpdateCourseAssignmentsResult {
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const list = raw.assignments;
  if (!Array.isArray(list)) {
    return { success: false, details: [{ field: 'assignments', code: 'REQUIRED' }] };
  }
  if (list.length > MAX_ASSIGNMENTS) {
    return { success: false, details: [{ field: 'assignments', code: 'INVALID_LENGTH' }] };
  }

  const details: FieldError[] = [];
  const assignments: AssignmentCell[] = [];
  const seen = new Set<string>();

  list.forEach((item: unknown, index) => {
    const prefix = `assignments[${String(index)}]`;
    const fields =
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const [subjectId, classId, professorId] = FIELDS.map((field) =>
      parseId(fields[field], `${prefix}.${field}`, details),
    );
    if (subjectId === undefined || classId === undefined || professorId === undefined) {
      return;
    }
    const pair = `${subjectId}:${classId}`;
    if (seen.has(pair)) {
      details.push({ field: prefix, code: 'DUPLICATE' });
      return;
    }
    seen.add(pair);
    assignments.push({ subjectId, classId, professorId });
  });

  return details.length > 0
    ? { success: false, details }
    : { success: true, data: { assignments } };
}
