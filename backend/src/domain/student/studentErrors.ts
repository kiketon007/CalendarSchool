/**
 * El curso indicado no existe en el colegio: es de otro colegio o no existe. No se distingue el caso para
 * no revelar que existe en otro colegio. Se responde como un error del campo `courseId` (`400`).
 */
export class CourseNotFound extends Error {
  constructor() {
    super('El curso no existe en el colegio');
    this.name = 'CourseNotFound';
  }
}

/**
 * La clase indicada no existe en el curso del alumno: es de otro curso, de otro colegio o no existe. No se
 * distingue el caso. Se responde como un error del campo `classId` (`400`).
 */
export class ClassNotFound extends Error {
  constructor() {
    super('La clase no existe en el curso');
    this.name = 'ClassNotFound';
  }
}

/**
 * El alumno no existe en el colegio de quien llama: es de otro colegio, no existe o su identificador no es
 * un UUID. No se distingue el caso para no revelar que existe en otro colegio (`404`).
 */
export class StudentNotFound extends Error {
  constructor() {
    super('El alumno no existe');
    this.name = 'StudentNotFound';
  }
}
