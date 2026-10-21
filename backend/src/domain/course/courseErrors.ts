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

/**
 * El curso no existe en el colegio de la identidad: es de otro colegio, no existe o su identificador no
 * es un UUID (`404 NOT_FOUND`). No se distingue el caso para no revelar que existe en otro colegio.
 */
export class CourseNotFound extends Error {
  constructor() {
    super('El curso no existe en el colegio');
    this.name = 'CourseNotFound';
  }
}

/**
 * La edición incluye una clase que ya no pertenece al curso (otra persona la quitó mientras se editaba, o
 * es de otro curso) y no se guarda nada (`409 COURSE_CHANGED`).
 */
export class CourseChanged extends Error {
  constructor() {
    super('El curso ha cambiado desde que se cargó');
    this.name = 'CourseChanged';
  }
}

/**
 * Un profesor elegido como tutor ya tutoriza una clase que la edición no libera: es de otro curso, o
 * otra petición se la asignó a la vez (`409 PROFESSOR_ALREADY_TUTOR`). No se guarda nada.
 */
export class ProfessorAlreadyTutor extends Error {
  constructor() {
    super('El profesor ya es tutor de otra clase');
    this.name = 'ProfessorAlreadyTutor';
  }
}

/**
 * El profesor elegido como tutor de una clase no existe en el colegio (o es de otro: no se distingue). Lleva
 * la posición de la clase en el cuerpo para marcar `classes[<i>].tutorId`; la aplicación lo convierte en un
 * error de validación (`400`, `NOT_FOUND`).
 */
export class TutorNotFound extends Error {
  constructor(readonly classIndex: number) {
    super('El profesor elegido como tutor no existe en el colegio');
    this.name = 'TutorNotFound';
  }
}
