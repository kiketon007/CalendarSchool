import type { Generation } from '../services/scheduleGenerationService';
import type { ScheduleOverview } from '../services/scheduleService';

/** Qué es hoy el horario de una generación completada. */
export type CompletedKind = 'draft' | 'official' | 'gone';

/** El tono de la insignia: los del tema y el peligro suave de Bootstrap. */
export type BadgeTone = 'lavender' | 'mint' | 'yellow' | 'danger';

export type GenerationBadgeKey =
  'running' | 'improving' | 'draft' | 'official' | 'gone' | 'failed' | 'cancelled';

export interface GenerationBadge {
  tone: BadgeTone;
  key: GenerationBadgeKey;
}

/**
 * Qué es hoy el horario de una generación completada (`scheduleId`): el borrador vigente, el oficial o ninguno (se
 * descartó o lo sustituyó otra generación). Sin saber qué horarios hay (`overview` nulo) cuenta como borrador. Lo
 * comparten el texto del panel y la insignia, para que no puedan contradecirse.
 */
export function completedKind(
  generation: Generation,
  overview: ScheduleOverview | null,
): CompletedKind {
  if (overview !== null && overview.official?.id === generation.scheduleId) {
    return 'official';
  }
  if (overview === null || overview.draft?.id === generation.scheduleId) {
    return 'draft';
  }
  return 'gone';
}

/** La insignia de estado de la tarjeta de la generación; `null` si el colegio nunca ha generado. */
export function generationBadge(
  generation: Generation | null,
  overview: ScheduleOverview | null,
): GenerationBadge | null {
  if (generation === null) {
    return null;
  }
  switch (generation.status) {
    case 'QUEUED':
    case 'RUNNING':
      return generation.phase === 'IMPROVING'
        ? { tone: 'lavender', key: 'improving' }
        : { tone: 'lavender', key: 'running' };
    case 'COMPLETED': {
      const kind = completedKind(generation, overview);
      return kind === 'gone' ? { tone: 'yellow', key: 'gone' } : { tone: 'mint', key: kind };
    }
    case 'FAILED':
      return { tone: 'danger', key: 'failed' };
    case 'CANCELLED':
      return { tone: 'yellow', key: 'cancelled' };
  }
}

/** El sobretítulo de la tarjeta: una generación en curso, el resultado de la última o ninguno. */
export function generationEyebrow(generation: Generation | null): 'running' | 'last' | null {
  if (generation === null) {
    return null;
  }
  return generation.status === 'QUEUED' || generation.status === 'RUNNING' ? 'running' : 'last';
}
