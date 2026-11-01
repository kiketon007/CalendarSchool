import type { ProfessorLoad } from '../services/professorsSummaryService';
import { normalizeForSearch } from './courseSearch';
import { matchesPersonSearch } from './personSearch';

/** Los filtros del resumen de carga: `''` significa «todos». */
export interface SummaryFilters {
  status: '' | ProfessorLoad['status'];
  /** `subjectId` de una asignatura que imparte el profesor, o `''` para todas. */
  subjectId: string;
  /** Texto buscado en el nombre y los apellidos del profesor. */
  query: string;
  /** Deja solo los profesores que tienen algún aviso. */
  onlyWithWarnings: boolean;
}

/** Lo que miran los filtros de un profesor del resumen. */
type FilterableProfessor = Pick<ProfessorLoad, 'firstName' | 'lastName' | 'status'> & {
  subjects: readonly Pick<ProfessorLoad['subjects'][number], 'subjectId' | 'subjectName'>[];
  warnings: readonly unknown[];
};

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * Indica si un profesor del resumen pasa los cuatro filtros, que se combinan: el estado, la asignatura que imparte,
 * la búsqueda por nombre y apellidos (la misma comparación que el listado de profesores, pero **sin** mirar las
 * asignaturas: para eso está su filtro) y «Solo con avisos». Una búsqueda vacía encuentra a todos.
 */
export function matchesSummaryFilters(
  professor: FilterableProfessor,
  { status, subjectId, query, onlyWithWarnings }: SummaryFilters,
): boolean {
  if (status !== '' && professor.status !== status) {
    return false;
  }
  if (subjectId !== '' && !professor.subjects.some((entry) => entry.subjectId === subjectId)) {
    return false;
  }
  if (onlyWithWarnings && professor.warnings.length === 0) {
    return false;
  }
  return matchesPersonSearch(
    { firstName: professor.firstName, lastName: professor.lastName },
    query,
  );
}

/**
 * Las asignaturas que ofrece el filtro: las que imparte algún profesor del resumen, una vez cada una y por nombre
 * con la comparación del castellano.
 */
export function summarySubjectOptions(
  professors: readonly Pick<FilterableProfessor, 'subjects'>[],
): { id: string; name: string }[] {
  const byId = new Map(
    professors.flatMap(({ subjects }) =>
      subjects.map(({ subjectId, subjectName }) => [subjectId, subjectName] as const),
    ),
  );
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** `true` si algún filtro limita el resumen (una búsqueda de solo espacios no limita). */
export function hasActiveSummaryFilters({
  status,
  subjectId,
  query,
  onlyWithWarnings,
}: SummaryFilters): boolean {
  return status !== '' || subjectId !== '' || normalizeForSearch(query) !== '' || onlyWithWarnings;
}
