/**
 * La clase indicada no existe en el colegio: es de otro colegio o no existe. No se distingue el caso para
 * no revelar que existe en otro colegio. Se responde como un error del campo `classId` (`400`).
 */
export class ClassNotFound extends Error {
  constructor() {
    super('La clase no existe en el colegio');
    this.name = 'ClassNotFound';
  }
}

/** La clase indicada ya tiene tutor (`409 CLASS_ALREADY_HAS_TUTOR`). */
export class ClassAlreadyHasTutor extends Error {
  constructor() {
    super('La clase ya tiene tutor');
    this.name = 'ClassAlreadyHasTutor';
  }
}
