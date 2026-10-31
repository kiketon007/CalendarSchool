import type { Professor } from '../../domain/professor/professor.js';
import { compareText } from '../courses/courseOrdering.js';

/**
 * El profesor con sus asignaturas en orden: por asignatura, después por curso (con los números en orden natural,
 * «2º» antes que «10º») y por último por clase, con la comparación del castellano. El repositorio las devuelve sin
 * ordenar porque el orden es de la aplicación y no de la base de datos (su colación depende de cómo se creó). No
 * modifica el original.
 */
export function withSortedSubjects(professor: Professor): Professor {
  return {
    ...professor,
    subjects: [...professor.subjects].sort(
      (a, b) =>
        compareText(a.subjectName, b.subjectName) ||
        compareText(a.courseName, b.courseName) ||
        compareText(a.className, b.className),
    ),
  };
}
