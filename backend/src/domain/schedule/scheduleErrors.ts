/**
 * El horario no existe en el colegio de la identidad: es de otro colegio, no existe (por ejemplo, porque se generó un
 * borrador nuevo que sustituyó al que se veía) o su identificador no es un UUID (`404 NOT_FOUND`). No se distingue el
 * caso para no revelar que existe en otro colegio.
 */
export class ScheduleNotFound extends Error {
  constructor() {
    super('El horario no existe');
    this.name = 'ScheduleNotFound';
  }
}

/** El horario ya no es un borrador: se confirmó o se descartó, o es un oficial (`409 SCHEDULE_NOT_DRAFT`). */
export class ScheduleNotDraft extends Error {
  constructor() {
    super('Este horario ya no es un borrador');
    this.name = 'ScheduleNotDraft';
  }
}
