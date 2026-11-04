import type { ScheduleEntry } from './scheduleSolver.js';

/** Una entrada del horario con su identificador (UUIDv7 generado por la aplicación). */
export interface DraftEntry extends ScheduleEntry {
  readonly id: string;
}

/** El borrador que resuelve una generación. */
export interface ScheduleDraft {
  /** UUIDv7 del horario. */
  readonly id: string;
  readonly schoolId: string;
  /** La generación que lo produce: se marca `COMPLETED` en la misma transacción. */
  readonly generationId: string;
  /** Administrador que inició la generación. */
  readonly createdById: string;
  /** Sesiones colocadas: una entrada por sesión. */
  readonly placedSessions: number;
  readonly total: number;
  readonly entries: readonly DraftEntry[];
}

/** Puerto de escritura de los horarios generados (US-ALGO-RUN). */
export interface ScheduleRepository {
  /**
   * Guarda el borrador en **una transacción**: borra el `DRAFT` anterior del colegio (sus entradas caen en cascada),
   * inserta el horario y sus entradas, enlaza la generación con él y la marca `COMPLETED`. Si algo falla no queda
   * nada a medias y el borrador anterior sigue ahí. No toca los horarios `OFFICIAL`.
   */
  replaceDraft(draft: ScheduleDraft, now: Date): Promise<void>;
}
