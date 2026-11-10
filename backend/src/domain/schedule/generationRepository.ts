import type {
  Generation,
  GenerationErrorCode,
  GenerationErrorDetails,
  GenerationPhase,
} from './generation.js';
import type { ScheduleScore } from './scheduleScore.js';
import type { ScheduleEngine } from './scheduleSolver.js';

/** Cómo termina una generación que no guarda horario. */
export type FinishedGeneration =
  | {
      readonly status: 'FAILED';
      readonly placed: number;
      readonly total: number;
      readonly errorCode: GenerationErrorCode;
      readonly errorMessage: string;
      readonly errorDetails: GenerationErrorDetails | null;
    }
  | { readonly status: 'CANCELLED'; readonly placed: number; readonly total: number };

/** Lo que pasa al pedir la cancelación: no existe, ya terminó o queda solicitada (con la generación resultante). */
export type CancelOutcome =
  | { readonly kind: 'notFound' }
  | { readonly kind: 'notCancellable' }
  | { readonly kind: 'requested'; readonly generation: Generation };

/**
 * Puerto de las generaciones de horarios (US-ALGO-RUN). La fila es la cola y el estado: el índice único parcial de la
 * base garantiza una generación en curso por colegio. Todas las lecturas se filtran por el colegio, que sale siempre
 * de la identidad de la petición (o de la fila, en el worker).
 */
export interface GenerationRepository {
  /**
   * Inserta una generación `QUEUED`. Lanza `GenerationInProgress` si el colegio ya tiene una `QUEUED` o `RUNNING`
   * (la violación de unicidad del índice parcial).
   */
  insert(generation: {
    id: string;
    schoolId: string;
    createdById: string;
    /** Si se mejora el horario con las preferencias tras encontrar uno válido. */
    improve: boolean;
    /** El motor configurado en este despliegue (`SCHEDULE_ENGINE`). */
    engine: ScheduleEngine;
    now: Date;
  }): Promise<Generation>;

  /**
   * Reclama la generación: `QUEUED → RUNNING` con una actualización condicional que fija el inicio y el primer
   * latido. Devuelve `null` si no estaba `QUEUED` (un reintento de la Lambda, o cancelada antes de empezar).
   */
  claim(id: string, now: Date): Promise<Generation | null>;

  /**
   * Guarda el progreso y el latido de una generación `RUNNING` y devuelve si se pidió cancelarla. El progreso no
   * baja: se conserva el mayor de `placed`. También guarda la fase y la puntuación del mejor horario hasta ahora.
   */
  saveProgress(
    id: string,
    progress: {
      placed: number;
      total: number;
      phase: GenerationPhase;
      engine: ScheduleEngine;
      score: ScheduleScore | null;
    },
    now: Date,
  ): Promise<{ cancelRequested: boolean }>;

  /**
   * Termina una generación `QUEUED` (el lanzamiento falló) o `RUNNING` sin horario (`FAILED` o `CANCELLED`) y fija
   * `finished_at`. Una generación ya terminada no se toca.
   */
  finish(id: string, result: FinishedGeneration, now: Date): Promise<void>;

  /**
   * Marca `FAILED/INTERNAL` («la generación se interrumpió») las generaciones del colegio que llevan sin latido
   * desde `olderThan` (`RUNNING`) o sin ser reclamadas desde entonces (`QUEUED`), con una transición condicional.
   * Devuelve cuántas marcó.
   */
  failStuck(schoolId: string, olderThan: Date, now: Date): Promise<number>;

  /** La generación en curso del colegio o, si no hay, la última por fecha de creación. */
  findCurrent(schoolId: string): Promise<Generation | null>;

  /** La generación indicada, solo si es del colegio. */
  findById(schoolId: string, id: string): Promise<Generation | null>;

  /**
   * Pide cancelar una generación `QUEUED` o `RUNNING` del colegio: marca `cancel_requested` y, si seguía `QUEUED`, la
   * pasa directamente a `CANCELLED`, porque el worker no la reclamará.
   */
  requestCancel(schoolId: string, id: string, now: Date): Promise<CancelOutcome>;
}
