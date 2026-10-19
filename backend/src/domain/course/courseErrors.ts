/**
 * El colegio ya tiene un curso con ese nombre, sin distinguir mayúsculas ni espacios sobrantes
 * (`409 COURSE_ALREADY_EXISTS`). Lo lanza el repositorio al violarse el índice único del colegio y del
 * nombre normalizado.
 */
export class CourseAlreadyExists extends Error {
  constructor() {
    super('Ya existe un curso con ese nombre en el colegio');
    this.name = 'CourseAlreadyExists';
  }
}
