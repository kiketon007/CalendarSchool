import type { Subject } from './subject.js';

/** Campos de una asignatura que una edición puede cambiar, en el orden del formulario. */
export type SubjectChangedField =
  'name' | 'code' | 'type' | 'status' | 'description' | 'color' | 'courses';

/** Qué cambió una edición: los campos y los recuentos de cursos (el orden de los cursos no cuenta). */
export interface SubjectDiff {
  readonly changedFields: readonly SubjectChangedField[];
  /** Cursos que la asignatura no tenía. */
  readonly coursesAdded: number;
  /** Cursos que tenía y ya no. */
  readonly coursesRemoved: number;
  /** Cursos que siguen, con otras sesiones semanales. */
  readonly coursesChanged: number;
}

const SIMPLE_FIELDS = ['name', 'code', 'type', 'status', 'description', 'color'] as const;

/**
 * Compara una asignatura antes y después de editarla. El nombre y el código se comparan tal cual: pasar de
 * «Inglés» a «INGLÉS» es un cambio. Los cursos se comparan como conjunto de `(curso, sesiones)`. Se usa para
 * `SUBJECT_UPDATED`, que lleva los nombres de los campos y los recuentos, nunca los valores.
 */
export function subjectChanges(before: Subject, after: Subject): SubjectDiff {
  const sessionsBefore = new Map(
    before.courses.map(({ id, sessionsPerWeek }) => [id, sessionsPerWeek]),
  );
  const sessionsAfter = new Map(
    after.courses.map(({ id, sessionsPerWeek }) => [id, sessionsPerWeek]),
  );

  const coursesAdded = [...sessionsAfter.keys()].filter((id) => !sessionsBefore.has(id)).length;
  const coursesRemoved = [...sessionsBefore.keys()].filter((id) => !sessionsAfter.has(id)).length;
  const coursesChanged = [...sessionsAfter].filter(
    ([id, sessions]) => sessionsBefore.has(id) && sessionsBefore.get(id) !== sessions,
  ).length;

  const changedFields: SubjectChangedField[] = SIMPLE_FIELDS.filter(
    (field) => before[field] !== after[field],
  );
  if (coursesAdded > 0 || coursesRemoved > 0 || coursesChanged > 0) {
    changedFields.push('courses');
  }
  return { changedFields, coursesAdded, coursesRemoved, coursesChanged };
}
