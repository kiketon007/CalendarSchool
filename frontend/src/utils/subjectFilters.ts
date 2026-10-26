import type { components } from '../api/generated/schema';
import { matchesCourseSearch } from './courseSearch';

type Subject = components['schemas']['Subject'];

/** Los filtros del listado de asignaturas: `''` significa «todos». */
export interface SubjectFilters {
  type: '' | Subject['type'];
  status: '' | Subject['status'];
  /** Texto buscado en el nombre o en el código. */
  query: string;
}

/**
 * Indica si una asignatura pasa los tres filtros del listado, que se combinan: el tipo, el estado y la
 * búsqueda por nombre o código, sin distinguir mayúsculas, acentos ni espacios sobrantes y como parte de
 * una palabra (la misma comparación que la búsqueda de cursos). Una búsqueda vacía encuentra todas.
 */
export function matchesSubjectFilters(
  subject: Pick<Subject, 'name' | 'code' | 'type' | 'status'>,
  { type, status, query }: SubjectFilters,
): boolean {
  if (type !== '' && subject.type !== type) {
    return false;
  }
  if (status !== '' && subject.status !== status) {
    return false;
  }
  return (
    matchesCourseSearch(subject.name, query) ||
    (subject.code !== null && matchesCourseSearch(subject.code, query))
  );
}
