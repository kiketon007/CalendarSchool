import type { components } from '../api/generated/schema';
import { matchesCourseSearch, normalizeForSearch } from './courseSearch';

type Constraint = components['schemas']['SchedulingConstraint'];

/** Los filtros del listado de reglas: `''` significa «todos». */
export interface ConstraintFilters {
  type: '' | Constraint['type'];
  /** `id` del curso, o `''` para todos. */
  courseId: string;
  /** Texto buscado en el nombre o en el código de la asignatura. */
  query: string;
  /** Deja solo las reglas que tienen algún aviso. */
  onlyWithWarnings: boolean;
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * Indica si una regla pasa los cuatro filtros del listado, que se combinan: el tipo, el curso, la búsqueda por
 * nombre o código de la asignatura (la misma comparación que la búsqueda de cursos: sin mayúsculas, acentos ni
 * espacios sobrantes y como parte de una palabra) y «Solo con avisos». Una búsqueda vacía encuentra todas.
 */
export function matchesConstraintFilters(
  constraint: Pick<Constraint, 'type' | 'warnings'> & {
    course: Pick<Constraint['course'], 'id'>;
    subject: Pick<Constraint['subject'], 'name' | 'code'>;
  },
  { type, courseId, query, onlyWithWarnings }: ConstraintFilters,
): boolean {
  if (type !== '' && constraint.type !== type) {
    return false;
  }
  if (courseId !== '' && constraint.course.id !== courseId) {
    return false;
  }
  if (onlyWithWarnings && constraint.warnings.length === 0) {
    return false;
  }
  return (
    matchesCourseSearch(constraint.subject.name, query) ||
    (constraint.subject.code !== null && matchesCourseSearch(constraint.subject.code, query))
  );
}

/**
 * Los cursos que ofrece el filtro: los que tienen alguna regla en la lista cargada, una vez cada uno y en
 * orden natural («2º» antes que «10º»).
 */
export function courseOptions(
  constraints: readonly { course: Constraint['course'] }[],
): Constraint['course'][] {
  const byId = new Map(constraints.map(({ course }) => [course.id, course]));
  return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** `true` si algún filtro limita el listado (una búsqueda de solo espacios no limita). */
export function hasActiveFilters({
  type,
  courseId,
  query,
  onlyWithWarnings,
}: ConstraintFilters): boolean {
  return type !== '' || courseId !== '' || normalizeForSearch(query) !== '' || onlyWithWarnings;
}
