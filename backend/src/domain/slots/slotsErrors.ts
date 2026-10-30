/**
 * La asignatura no se imparte en el curso, o la asignatura o el curso no existen en el colegio de quien llama
 * (de otro colegio, inexistentes o con un identificador que no es un UUID). No se distingue el caso para no
 * revelar que existen en otro colegio (`404 NOT_FOUND`).
 */
export class SubjectCourseNotFound extends Error {
  constructor() {
    super('La asignatura no se imparte en el curso');
    this.name = 'SubjectCourseNotFound';
  }
}

/**
 * El curso no tiene calendario base, así que no hay jornada sobre la que marcar franjas
 * (`409 COURSE_HAS_NO_CALENDAR`).
 */
export class CourseHasNoCalendar extends Error {
  constructor() {
    super('El curso no tiene calendario');
    this.name = 'CourseHasNoCalendar';
  }
}
