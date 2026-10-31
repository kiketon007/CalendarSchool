import type { CourseAssignment, CourseAssignments } from '../services/courseAssignmentsService';

/**
 * El borrador de la matriz de profesores de un curso (US-PROF-ASSIGN): una celda por cada pareja asignatura-clase
 * (`cellKey`), con el `id` del profesor o `null` si está sin asignar. Se edita en la página y se envía entero.
 */
export type AssignmentsDraft = Record<string, string | null>;

/** La clave de una celda: la asignatura y la clase. */
export const cellKey = (subjectId: string, classId: string) => `${subjectId}:${classId}`;

/** El borrador con lo que dice el servidor: todas las celdas de la matriz, asignadas o `null`. */
export function draftFrom(matrix: CourseAssignments): AssignmentsDraft {
  const assigned = new Map(
    matrix.assignments.map(({ subjectId, classId, professorId }) => [
      cellKey(subjectId, classId),
      professorId,
    ]),
  );
  const draft: AssignmentsDraft = {};
  for (const subject of matrix.subjects) {
    for (const schoolClass of matrix.classes) {
      const key = cellKey(subject.id, schoolClass.id);
      draft[key] = assigned.get(key) ?? null;
    }
  }
  return draft;
}

/** Cuántas celdas están sin profesor. */
export function unassignedCount(draft: AssignmentsDraft): number {
  return Object.values(draft).filter((professorId) => professorId === null).length;
}

/**
 * «Asignar al tutor»: rellena con el tutor las celdas **vacías** de la clase y deja como están las que ya tienen
 * profesor y las de las demás clases. No modifica el borrador original.
 */
export function assignTutor(
  draft: AssignmentsDraft,
  classId: string,
  tutorId: string,
  subjects: readonly { id: string }[],
): AssignmentsDraft {
  const next = { ...draft };
  for (const { id } of subjects) {
    const key = cellKey(id, classId);
    if (key in next && next[key] === null) {
      next[key] = tutorId;
    }
  }
  return next;
}

/** Las sesiones que da cada profesor en el curso: la suma de las de la asignatura de cada una de sus celdas. */
export function sessionsByProfessor(
  draft: AssignmentsDraft,
  subjects: readonly { id: string; sessionsPerWeek: number }[],
): Map<string, number> {
  const sessions = new Map(subjects.map(({ id, sessionsPerWeek }) => [id, sessionsPerWeek]));
  const totals = new Map<string, number>();
  for (const [key, professorId] of Object.entries(draft)) {
    if (professorId === null) {
      continue;
    }
    const subjectId = key.slice(0, key.indexOf(':'));
    totals.set(professorId, (totals.get(professorId) ?? 0) + (sessions.get(subjectId) ?? 0));
  }
  return totals;
}

/** `true` si el borrador difiere de lo que dice el servidor (deshacer un cambio lo vuelve a `false`). */
export function hasChanges(draft: AssignmentsDraft, matrix: CourseAssignments): boolean {
  const saved = draftFrom(matrix);
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);
  return [...keys].some((key) => (saved[key] ?? null) !== (draft[key] ?? null));
}

/** Lo que se envía: las celdas con profesor, en el orden de la matriz (asignaturas y después clases). */
export function toBody(draft: AssignmentsDraft, matrix: CourseAssignments): CourseAssignment[] {
  const body: CourseAssignment[] = [];
  for (const subject of matrix.subjects) {
    for (const schoolClass of matrix.classes) {
      const professorId = draft[cellKey(subject.id, schoolClass.id)];
      if (professorId !== null && professorId !== undefined) {
        body.push({ subjectId: subject.id, classId: schoolClass.id, professorId });
      }
    }
  }
  return body;
}
