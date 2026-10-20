import type { Course } from '../../domain/course/course.js';

/**
 * Comparación del castellano con los números en orden natural («2º» antes que «10º») y sin distinguir
 * mayúsculas ni acentos. La colación de PostgreSQL depende de cómo se creó la base de datos, así que
 * el orden es de la aplicación, como el de los municipios y el de los usuarios.
 */
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** Ordena cursos o clases por nombre con la comparación de `collator`. */
export const byName = (a: { name: string }, b: { name: string }) =>
  collator.compare(a.name, b.name);

/** El curso con sus clases ordenadas por nombre; no modifica el original. */
export function withSortedClasses(course: Course): Course {
  return { ...course, classes: [...course.classes].sort(byName) };
}
