import type { StudentSummary } from '../services/studentsService';

/** Valor de `curso` en la URL (y del filtro) para los alumnos cuyo curso se borró. */
export const NO_COURSE = 'sin-curso';
/** Valor de `clase` en la URL (y del filtro) para los alumnos de un curso que no tienen clase. */
export const NO_CLASS = 'sin-clase';

export type Toggle = 'all' | 'yes' | 'no';

/**
 * Filtros estructurados del listado de alumnos (US15). `course` y `classId` son `''` (todos), `NO_COURSE` /
 * `NO_CLASS` o el `id` de un curso o de una clase; `classId` solo cuenta con un curso concreto. La beca
 * solo cuenta con el comedor en «yes». El texto de búsqueda no forma parte de estos filtros: no va en la URL.
 */
export interface StudentFilters {
  course: string;
  classId: string;
  cafeteria: Toggle;
  scholarship: Toggle;
}

export interface NamedOption {
  id: string;
  name: string;
}

const collator = new Intl.Collator('es', { numeric: true });

/** Opciones de un desplegable sin repetidos y en el orden natural en castellano («2º» antes que «10º»). */
function sortedUnique(items: readonly NamedOption[]): NamedOption[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** El curso concreto elegido (su `id`), o `undefined` si el filtro es «todos» o «sin curso». */
function concreteCourse(course: string): string | undefined {
  return course === '' || course === NO_COURSE ? undefined : course;
}

/** Cursos que tienen algún alumno (para el desplegable) y si hay alumnos sin curso. */
export function courseOptions(students: readonly StudentSummary[]): {
  options: NamedOption[];
  withoutCourse: boolean;
} {
  const courses = students.flatMap(({ course }) => (course ? [course] : []));
  return {
    options: sortedUnique(courses),
    withoutCourse: students.some(({ course }) => course === null),
  };
}

/** Clases de ese curso que tienen algún alumno y si hay alumnos del curso sin clase. */
export function classOptions(
  students: readonly StudentSummary[],
  course: string,
): { options: NamedOption[]; withoutClass: boolean } {
  const courseId = concreteCourse(course);
  if (courseId === undefined) {
    return { options: [], withoutClass: false };
  }
  const ofCourse = students.filter((student) => student.course?.id === courseId);
  return {
    options: sortedUnique(
      ofCourse.flatMap(({ class: schoolClass }) => (schoolClass ? [schoolClass] : [])),
    ),
    withoutClass: ofCourse.some(({ class: schoolClass }) => schoolClass === null),
  };
}

function toggleFrom(value: string | null): Toggle {
  return value === 'si' ? 'yes' : value === 'no' ? 'no' : 'all';
}

/**
 * Los filtros que dicen los parámetros de la URL, **validados** contra los alumnos cargados: un curso o una
 * clase que ningún alumno tiene (borrado, de otro colegio o inventado), una clase sin curso concreto, una
 * beca sin comedor «si» o un valor desconocido se tratan como si no estuvieran, sin error.
 */
export function filtersFromParams(
  params: URLSearchParams,
  students: readonly StudentSummary[],
): StudentFilters {
  const { options: courses, withoutCourse } = courseOptions(students);
  const wantedCourse = params.get('curso') ?? '';
  const course =
    wantedCourse === NO_COURSE
      ? withoutCourse
        ? NO_COURSE
        : ''
      : courses.some(({ id }) => id === wantedCourse)
        ? wantedCourse
        : '';

  const { options: classes, withoutClass } = classOptions(students, course);
  const wantedClass = params.get('clase') ?? '';
  const classId =
    wantedClass === NO_CLASS
      ? withoutClass
        ? NO_CLASS
        : ''
      : classes.some(({ id }) => id === wantedClass)
        ? wantedClass
        : '';

  const cafeteria = toggleFrom(params.get('comedor'));
  const scholarship = cafeteria === 'yes' ? toggleFrom(params.get('beca')) : 'all';
  return { course, classId, cafeteria, scholarship };
}

/** La página que dice la URL: un entero mayor que 1; cualquier otra cosa es la primera. */
export function pageFromParams(params: URLSearchParams): number {
  const value = params.get('pagina') ?? '';
  return /^\d+$/.test(value) && Number(value) > 1 ? Number(value) : 1;
}

/**
 * Los parámetros de la URL de unos filtros y una página, sin los valores por defecto (la primera página, «todos»)
 * ni lo que no cuenta (una clase sin curso concreto, una beca sin comedor «yes»).
 */
export function paramsFromFilters(filters: StudentFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.course !== '') {
    params.set('curso', filters.course);
    if (concreteCourse(filters.course) !== undefined && filters.classId !== '') {
      params.set('clase', filters.classId);
    }
  }
  if (filters.cafeteria !== 'all') {
    params.set('comedor', filters.cafeteria === 'yes' ? 'si' : 'no');
    if (filters.cafeteria === 'yes' && filters.scholarship !== 'all') {
      params.set('beca', filters.scholarship === 'yes' ? 'si' : 'no');
    }
  }
  if (page > 1) {
    params.set('pagina', String(page));
  }
  return params;
}

/** Si hay algún filtro estructurado (sin contar el texto de búsqueda). */
export function hasActiveFilters(filters: StudentFilters): boolean {
  return (
    filters.course !== '' ||
    filters.classId !== '' ||
    filters.cafeteria !== 'all' ||
    filters.scholarship !== 'all'
  );
}

/** Si un alumno cumple **todos** los filtros estructurados. */
export function matchesStudentFilters(student: StudentSummary, filters: StudentFilters): boolean {
  if (filters.course === NO_COURSE) {
    if (student.course !== null) {
      return false;
    }
  } else if (filters.course !== '') {
    if (student.course?.id !== filters.course) {
      return false;
    }
    if (filters.classId === NO_CLASS && student.class !== null) {
      return false;
    }
    if (
      filters.classId !== '' &&
      filters.classId !== NO_CLASS &&
      student.class?.id !== filters.classId
    ) {
      return false;
    }
  }
  if (filters.cafeteria === 'yes' && !student.cafeteria) {
    return false;
  }
  if (filters.cafeteria === 'no' && student.cafeteria) {
    return false;
  }
  if (
    filters.cafeteria === 'yes' &&
    filters.scholarship === 'yes' &&
    student.scholarship !== true
  ) {
    return false;
  }
  if (
    filters.cafeteria === 'yes' &&
    filters.scholarship === 'no' &&
    student.scholarship !== false
  ) {
    return false;
  }
  return true;
}

/**
 * Búsqueda del listado de alumnos (`?curso=…&pagina=2`) que la edición recibe en el estado de la
 * navegación para volver con los mismos filtros y la misma página. Solo se acepta un texto vacío o que
 * empiece por `?` sin fragmento ni saltos de línea; cualquier otra cosa (sin estado, un recargo de la
 * página, un estado manipulado) es «sin búsqueda». La vuelta se construye siempre con la ruta fija
 * `/alumnos` y esta búsqueda, así que no puede llevar a otro sitio.
 */
export function returnSearchFrom(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('listSearch' in state)) {
    return '';
  }
  const { listSearch } = state;
  if (typeof listSearch !== 'string') {
    return '';
  }
  return listSearch === '' || /^\?[^#\r\n]*$/u.test(listSearch) ? listSearch : '';
}
