/** El colegio ya tiene una generación `QUEUED` o `RUNNING` (`409 GENERATION_IN_PROGRESS`). */
export class GenerationInProgress extends Error {
  constructor() {
    super('Ya hay una generación en curso');
    this.name = 'GenerationInProgress';
  }
}

/** El colegio tiene bloqueantes y no se puede generar (`409 SCHEDULE_NOT_READY`). */
export class ScheduleNotReady extends Error {
  constructor() {
    super('El colegio no está listo para generar los horarios');
    this.name = 'ScheduleNotReady';
  }
}

/** La generación ya terminó y no se puede cancelar (`409 GENERATION_NOT_CANCELLABLE`). */
export class GenerationNotCancellable extends Error {
  constructor() {
    super('La generación ya ha terminado');
    this.name = 'GenerationNotCancellable';
  }
}

/**
 * La generación no existe en el colegio de la identidad: es de otro colegio, no existe o su identificador no es un
 * UUID (`404 NOT_FOUND`). No se distingue el caso para no revelar que existe en otro colegio.
 */
export class GenerationNotFound extends Error {
  constructor() {
    super('La generación no existe en el colegio');
    this.name = 'GenerationNotFound';
  }
}
