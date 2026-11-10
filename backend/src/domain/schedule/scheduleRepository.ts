import type { StoredScheduleSummary } from './scheduleRead.js';
import type { ScheduleScore } from './scheduleScore.js';
import type { ScheduleEngine, ScheduleEntry } from './scheduleSolver.js';

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
  /** El motor que encontró el horario. */
  readonly engine: ScheduleEngine;
  /** La puntuación del horario; se guarda con él y en la generación, en la misma transacción. */
  readonly score: ScheduleScore;
  readonly entries: readonly DraftEntry[];
}

/**
 * Resultado de confirmar un borrador: confirmado (con su cabecera y el oficial al que sustituyó, si lo había), que no
 * existe en el colegio o que ya no es un borrador.
 */
export type ConfirmOutcome =
  | {
      readonly kind: 'confirmed';
      readonly schedule: StoredScheduleSummary;
      readonly replacedId: string | null;
    }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'notDraft' };

/** Resultado de descartar un borrador: descartado, que no existe en el colegio o que no es un borrador. */
export type DiscardOutcome =
  { readonly kind: 'discarded' } | { readonly kind: 'notFound' } | { readonly kind: 'notDraft' };

/** Puerto de escritura de los horarios generados (US-ALGO-RUN y US-ALGO-CONFIRM). */
export interface ScheduleRepository {
  /**
   * Guarda el borrador en **una transacción**: borra el `DRAFT` anterior del colegio (sus entradas caen en cascada),
   * inserta el horario y sus entradas, enlaza la generación con él y la marca `COMPLETED`. Si algo falla no queda
   * nada a medias y el borrador anterior sigue ahí. No toca los horarios `OFFICIAL`.
   */
  replaceDraft(draft: ScheduleDraft, now: Date): Promise<void>;

  /**
   * Confirma el borrador `id` del colegio como oficial (US-ALGO-CONFIRM), en **una transacción**: marca como
   * sustituido el oficial vigente, si lo hay, y pasa el borrador a `OFFICIAL` con la fecha y el usuario. Solo si es del
   * colegio y sigue siendo `DRAFT`; si no, no cambia nada.
   */
  confirm(schoolId: string, id: string, actorId: string, now: Date): Promise<ConfirmOutcome>;

  /**
   * Descarta el borrador `id` del colegio: lo borra con sus entradas (la generación que lo produjo se conserva, sin
   * horario). Un horario oficial no se borra.
   */
  discard(schoolId: string, id: string): Promise<DiscardOutcome>;
}
