/**
 * El colegio ya tiene un calendario con ese nombre, sin distinguir mayúsculas ni espacios sobrantes
 * (`409 CALENDAR_ALREADY_EXISTS`). Lo lanza el repositorio al violarse el índice único del colegio y del
 * nombre normalizado.
 */
export class CalendarAlreadyExists extends Error {
  constructor() {
    super('Ya existe un calendario con ese nombre en el colegio');
    this.name = 'CalendarAlreadyExists';
  }
}

/**
 * Algunos de los cursos que debían seguir el calendario no existen en el colegio: son de otro colegio o
 * se borraron. No se distingue el caso. `positions` son las posiciones (desde 0) de `courseIds` que fallan,
 * para marcar cada una (`400` con `NOT_FOUND` en `courseIds[<i>]`). No se crea nada.
 */
export class CalendarCoursesNotFound extends Error {
  constructor(readonly positions: readonly number[]) {
    super('Algún curso del calendario no existe en el colegio');
    this.name = 'CalendarCoursesNotFound';
  }
}

/**
 * El calendario no existe en el colegio de quien llama: es de otro colegio, no existe o su identificador no
 * es un UUID. No se distingue el caso para no revelar que existe en otro colegio (`404 NOT_FOUND`).
 */
export class CalendarNotFound extends Error {
  constructor() {
    super('El calendario no existe');
    this.name = 'CalendarNotFound';
  }
}
