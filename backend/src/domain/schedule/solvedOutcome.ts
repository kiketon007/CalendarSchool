import { improveSchedule } from './scheduleImprover.js';
import { scoreSchedule } from './scheduleScore.js';
import {
  DEFAULT_LIMIT_MS,
  IMPROVE_LIMIT_MS,
  type GenerationInput,
  type Placement,
  type ScheduleEngine,
  type ScheduleEntry,
  type SolveOptions,
  type SolveOutcome,
} from './scheduleSolver.js';
import { entriesOfPlacements } from './searchUnits.js';
import { validateSchedule } from './validateSchedule.js';

/** Lanza un error si el horario rompe alguna restricción dura: es un fallo del motor, nunca algo que entregar. */
export function assertValid(input: GenerationInput, entries: readonly ScheduleEntry[]): void {
  const violations = validateSchedule(input, entries);
  if (violations.length > 0) {
    throw new Error(
      `El motor produjo un horario inválido: ${violations.map(({ rule }) => rule).join(', ')}`,
    );
  }
}

/**
 * El resultado `solved` a partir de la colocación de partida (el horario válido de la fase 1 de cualquier motor):
 * la valida, la mejora con las preferencias si se pidió y queda tiempo, valida el resultado y lo puntúa. La comparten
 * `BacktrackingSolver` y `OrToolsSolver`, de modo que los dos aplican la «Fase de mejora» exactamente igual y solo
 * se distinguen en `engine`. `startedAt` es el instante en que empezó la resolución, para saber lo que queda de `limitMs`.
 */
export async function solvedOutcomeOf(
  input: GenerationInput,
  initial: readonly Placement[],
  engine: ScheduleEngine,
  options: SolveOptions,
  startedAt: number,
): Promise<Extract<SolveOutcome, { status: 'solved' }>> {
  const {
    limitMs = DEFAULT_LIMIT_MS,
    now = Date.now,
    improve = true,
    improveMs = IMPROVE_LIMIT_MS,
    isCancelled,
    onPhase,
    onScore,
  } = options;
  const entries = entriesOfPlacements(input, initial);
  assertValid(input, entries);

  // La mejora, con lo que quede de `limitMs` y el tope `improveMs`.
  const budgetMs = Math.min(improveMs, limitMs - (now() - startedAt));
  if (!improve || budgetMs <= 0) {
    return {
      status: 'solved',
      engine,
      entries,
      score: scoreSchedule(input, entries),
      improvement: { stoppedBy: 'SKIPPED', moves: 0, elapsedMs: 0 },
    };
  }
  onPhase?.('IMPROVING');
  const improved = await improveSchedule(input, initial, {
    budgetMs,
    now,
    isCancelled,
    onScore,
  });
  const improvedEntries = entriesOfPlacements(input, improved.placements);
  assertValid(input, improvedEntries);
  return {
    status: 'solved',
    engine,
    entries: improvedEntries,
    score: { ...scoreSchedule(input, improvedEntries), initialTotal: improved.initialPenalty },
    improvement: {
      stoppedBy: improved.stoppedBy,
      moves: improved.moves,
      elapsedMs: improved.elapsedMs,
    },
  };
}
