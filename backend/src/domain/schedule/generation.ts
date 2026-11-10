import type { ScheduleScore } from './scheduleScore.js';
import type { GenerationPhase, InfeasibleReason, ScheduleEngine } from './scheduleSolver.js';

export type { GenerationPhase };

export type GenerationStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Por qué falló una generación. */
export type GenerationErrorCode = 'NOT_READY' | 'INFEASIBLE' | 'TIMEOUT' | 'INTERNAL';

/** Una referencia con su nombre, para enlazar a donde se corrige. */
export interface GenerationRef {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
}

/** La lección que explica un `INFEASIBLE`, con las referencias de su curso, clase, asignatura y profesor. */
export interface GenerationLessonRef {
  readonly course: GenerationRef;
  readonly class: GenerationRef;
  readonly subject: GenerationRef;
  readonly professor: GenerationRef;
}

/** El detalle de un `INFEASIBLE`: el motivo del motor y la lección a la que apunta. */
export interface GenerationErrorDetails {
  readonly reason: InfeasibleReason;
  readonly lesson: GenerationLessonRef | null;
}

/** Una generación de horarios tal como se guarda. */
export interface Generation {
  /** UUIDv7. */
  readonly id: string;
  readonly schoolId: string;
  /** Administrador que la inició. */
  readonly createdById: string;
  readonly status: GenerationStatus;
  /** Sesiones colocadas (el máximo alcanzado) y sesiones que hay que colocar. */
  readonly placed: number;
  readonly total: number;
  /** Si se pidió mejorar el horario con las preferencias (US-ALGO-RUN_b). */
  readonly improve: boolean;
  /** Qué hace el worker: buscar un horario válido o mejorarlo. Empieza en `SEARCHING` y no vuelve atrás. */
  readonly phase: GenerationPhase;
  /** El motor que busca el horario, o que lo encontró (US-ALGO-ORTOOLS). Cambia si OR-Tools falla y se usa el otro. */
  readonly engine: ScheduleEngine;
  /** La puntuación del mejor horario hasta ahora (la del borrador guardado, al terminar); `null` si no hay. */
  readonly score: ScheduleScore | null;
  /** Se pidió cancelarla. Solo lo usa la vista para deducir `improvementCancelled`. */
  readonly cancelRequested: boolean;
  readonly errorCode: GenerationErrorCode | null;
  readonly errorMessage: string | null;
  readonly errorDetails: GenerationErrorDetails | null;
  /** El borrador guardado, solo en `COMPLETED`. */
  readonly scheduleId: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

/** Cuánto sin latido (o en cola sin reclamar) hace atascada a una generación: dos latidos más margen de arranque. */
export const STUCK_AFTER_MS = 90_000;

/** Cada cuánto como mucho escribe el worker el progreso y el latido, y lee la marca de cancelación. */
export const PROGRESS_INTERVAL_MS = 2_000;

/** Texto de una generación interrumpida. */
export const INTERRUPTED_MESSAGE = 'La generación se interrumpió';

/** El porcentaje de la pantalla: `round(100 · placed / total)`, 0 si no hay total y nunca más de 100. */
export function progressOf(placed: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((100 * placed) / total)));
}

/** Una generación está en curso mientras espera o corre: el colegio no puede iniciar otra. */
export function isInProgress(status: GenerationStatus): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}
