/**
 * El colegio ya tiene una asignatura con ese nombre, sin distinguir mayúsculas ni espacios sobrantes
 * (`409 SUBJECT_ALREADY_EXISTS`). Lo lanza el repositorio al violarse el índice único del colegio y del
 * nombre normalizado.
 */
export class SubjectAlreadyExists extends Error {
  constructor() {
    super('Ya existe una asignatura con ese nombre en el colegio');
    this.name = 'SubjectAlreadyExists';
  }
}

/**
 * El colegio ya tiene una asignatura con ese código, sin distinguir mayúsculas
 * (`409 SUBJECT_CODE_ALREADY_EXISTS`). Lo lanza el repositorio al violarse el índice único del colegio y
 * del código normalizado.
 */
export class SubjectCodeAlreadyExists extends Error {
  constructor() {
    super('Ya existe una asignatura con ese código en el colegio');
    this.name = 'SubjectCodeAlreadyExists';
  }
}

/**
 * Algunos de los cursos en los que debía impartirse la asignatura no existen en el colegio: son de otro
 * colegio o se borraron. No se distingue el caso. `positions` son las posiciones (desde 0) de `courses` que
 * fallan, para marcar cada una (`400` con `NOT_FOUND` en `courses[<i>].courseId`). No se crea nada.
 */
export class SubjectCoursesNotFound extends Error {
  constructor(readonly positions: readonly number[]) {
    super('Algún curso de la asignatura no existe en el colegio');
    this.name = 'SubjectCoursesNotFound';
  }
}
