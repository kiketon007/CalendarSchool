import type { SubjectColor, SubjectStatus } from '../subject/subject.js';

/**
 * Una asignación de un profesor (US-PROF-ASSIGN) tal como la ve el profesor: imparte una asignatura en una clase
 * de un curso. Las sesiones son las que la asignatura tiene en el curso (`subject_courses`), no un dato propio.
 * Debe coincidir con `ProfessorSubject` de `docs/api-spec.yml`.
 */
export interface ProfessorSubject {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly courseId: string;
  readonly courseName: string;
  readonly classId: string;
  readonly className: string;
  readonly sessionsPerWeek: number;
}

/** Una celda de la matriz de un curso: el profesor que imparte una asignatura en una clase. */
export interface AssignmentCell {
  readonly subjectId: string;
  readonly classId: string;
  readonly professorId: string;
}

/** La matriz de profesores de un curso: lo que se imparte, sus clases y lo asignado. */
export interface CourseAssignmentsSnapshot {
  readonly course: { readonly id: string; readonly name: string };
  /** Las asignaturas que se imparten en el curso (con fila en `subject_courses`), también las inactivas. */
  readonly subjects: readonly {
    readonly id: string;
    readonly name: string;
    /** Código corto tal como se escribió, o `null` si no tiene. */
    readonly code: string | null;
    readonly color: SubjectColor;
    readonly status: SubjectStatus;
    readonly sessionsPerWeek: number;
  }[];
  /** Las clases del curso con su tutor, o `null` si no tiene. */
  readonly classes: readonly {
    readonly id: string;
    readonly name: string;
    readonly tutor: {
      readonly id: string;
      readonly firstName: string;
      readonly lastName: string;
    } | null;
  }[];
  readonly assignments: readonly AssignmentCell[];
}

/** Lo que hay que hacer para pasar de las asignaciones actuales a las pedidas. */
export interface AssignmentPlan {
  /** Parejas que ya no vienen: se borran. */
  readonly toDelete: readonly AssignmentCell[];
  /** Parejas que siguen con otro profesor: se actualizan (conservan su fecha de creación). */
  readonly toChange: readonly AssignmentCell[];
  /** Parejas nuevas. */
  readonly toCreate: readonly AssignmentCell[];
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

const pairOf = ({ subjectId, classId }: AssignmentCell) => `${subjectId}:${classId}`;

/**
 * Compara las asignaciones actuales con las pedidas (el estado final de la matriz) y dice qué borrar, qué cambiar
 * de profesor y qué crear. La pareja es (asignatura, clase). Pura, sin dependencias y sin modificar la entrada;
 * el orden de las listas es el de la entrada que las origina.
 */
export function planAssignmentChanges(
  current: readonly AssignmentCell[],
  wanted: readonly AssignmentCell[],
): AssignmentPlan {
  const currentByPair = new Map(current.map((entry) => [pairOf(entry), entry]));
  const wantedPairs = new Set(wanted.map(pairOf));

  const toDelete = current.filter((entry) => !wantedPairs.has(pairOf(entry)));
  const toChange = wanted.filter((entry) => {
    const existing = currentByPair.get(pairOf(entry));
    return existing !== undefined && existing.professorId !== entry.professorId;
  });
  const toCreate = wanted.filter((entry) => !currentByPair.has(pairOf(entry)));

  return {
    toDelete,
    toChange,
    toCreate,
    added: toCreate.length,
    removed: toDelete.length,
    changed: toChange.length,
  };
}
