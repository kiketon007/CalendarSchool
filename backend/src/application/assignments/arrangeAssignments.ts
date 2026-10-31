import type {
  AssignmentCell,
  CourseAssignmentsSnapshot,
} from '../../domain/assignment/courseAssignments.js';
import { byName } from '../courses/courseOrdering.js';

/**
 * La matriz de profesores de un curso tal como se devuelve: las asignaturas y las clases por nombre con la
 * comparación del castellano (con los números en orden natural) y las asignaciones por asignatura y por clase,
 * en ese orden. El repositorio las devuelve sin ordenar. No modifica el original.
 */
export function arrangeAssignments(snapshot: CourseAssignmentsSnapshot): CourseAssignmentsSnapshot {
  const subjects = [...snapshot.subjects].sort(byName);
  const classes = [...snapshot.classes].sort(byName);
  const subjectOrder = new Map(subjects.map(({ id }, index) => [id, index]));
  const classOrder = new Map(classes.map(({ id }, index) => [id, index]));
  const position = (cell: AssignmentCell) =>
    [subjectOrder.get(cell.subjectId) ?? 0, classOrder.get(cell.classId) ?? 0] as const;
  return {
    course: snapshot.course,
    subjects,
    classes,
    assignments: [...snapshot.assignments].sort((a, b) => {
      const [aSubject, aClass] = position(a);
      const [bSubject, bClass] = position(b);
      return aSubject - bSubject || aClass - bClass;
    }),
  };
}
