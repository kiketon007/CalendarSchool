import { isOrToolsResponse, toOrToolsRequest, type OrToolsTransport } from './orToolsTransport.js';
import {
  DEFAULT_LIMIT_MS,
  type GenerationInput,
  type Placement,
  type ScheduleSolver,
  type SolveOptions,
  type SolveOutcome,
} from './scheduleSolver.js';
import { solvedOutcomeOf } from './solvedOutcome.js';
import { entriesOfPlacements } from './searchUnits.js';
import { validateSchedule } from './validateSchedule.js';

/** Tiempo máximo que se deja a CP-SAT: la regla de diseño de la búsqueda de restricciones es de menos de 60 s. */
export const ORTOOLS_LIMIT_MS = 60_000;
/** Cada cuánto, mientras espera, se pregunta por la cancelación (y así `RunGeneration` escribe el latido). */
export const CANCEL_POLL_MS = 500;

/** El log del motor (lo satisface el de pino sin adaptador, como el de la capa de aplicación). */
export interface OrToolsLogger {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export interface OrToolsSolverDependencies {
  readonly transport: OrToolsTransport;
  /** El motor actual: da la causa de un `infeasible` y es la alternativa si OR-Tools falla. */
  readonly fallback: ScheduleSolver;
  readonly logger: OrToolsLogger;
}

/** Por qué se dejó OR-Tools por el motor actual. */
type FallbackReason = 'invoke_error' | 'bad_response' | 'invalid_schedule';

/**
 * El segundo motor (US-ALGO-ORTOOLS): CP-SAT de OR-Tools, en un proceso de Python, busca un horario que cumpla las
 * restricciones duras; después se mejora con la misma búsqueda local que usa {@link BacktrackingSolver}
 * (`solvedOutcomeOf`). Nunca empeora al motor actual: si OR-Tools falla o entrega un horario que `validateSchedule`
 * rechaza, resuelve el motor actual con el tiempo que quede; y si dice que no hay solución, el motor actual busca la
 * causa para que el error siga siendo el mismo. Mientras espera, pregunta por la cancelación cada
 * {@link CANCEL_POLL_MS}, de modo que quien lo lanza sigue escribiendo el latido, y aborta el transporte si se pide.
 */
export class OrToolsSolver implements ScheduleSolver {
  constructor(private readonly dependencies: OrToolsSolverDependencies) {}

  async solve(input: GenerationInput, options: SolveOptions = {}): Promise<SolveOutcome> {
    const { transport, logger } = this.dependencies;
    const { limitMs = DEFAULT_LIMIT_MS, now = Date.now, onProgress, logContext } = options;
    const startedAt = now();
    const totalSessions = input.units.reduce((total, { size }) => total + size, 0);
    const leftMs = () => limitMs - (now() - startedAt);
    const logged = (event: string, extra: Record<string, unknown>) => ({
      event,
      ...logContext,
      ...extra,
      elapsed_ms: now() - startedAt,
    });

    const searchMs = Math.min(ORTOOLS_LIMIT_MS, limitMs);
    if (searchMs <= 0) {
      return { status: 'timeout', placed: 0, total: totalSessions };
    }

    const waited = await this.wait(
      (signal) => transport.solve(toOrToolsRequest(input, searchMs / 1000), signal),
      options,
    );
    if (waited.kind === 'cancelled') {
      return { status: 'cancelled' };
    }

    const fallBack = async (reason: FallbackReason): Promise<SolveOutcome> => {
      logger.warn(logged('ortools_fallback', { reason }), 'OR-Tools falló: se usa el motor actual');
      return this.runFallback(input, { ...options, limitMs: leftMs() }, totalSessions);
    };
    if (waited.kind === 'error') {
      return fallBack('invoke_error');
    }
    const response = waited.value;
    if (!isOrToolsResponse(response, input)) {
      return fallBack('bad_response');
    }

    switch (response.status) {
      case 'cancelled':
        return { status: 'cancelled' };
      case 'timeout':
        return { status: 'timeout', placed: 0, total: totalSessions };
      case 'infeasible':
        return this.diagnose(input, options, leftMs(), (event, extra, message, level) => {
          logger[level](logged(event, extra), message);
        });
      case 'solved': {
        const initial: Placement[] = [];
        for (const { unitIndex, dayOfWeek, firstSession } of response.placements) {
          initial[unitIndex] = { dayOfWeek, firstSession };
        }
        if (validateSchedule(input, entriesOfPlacements(input, initial)).length > 0) {
          return fallBack('invalid_schedule');
        }
        onProgress?.(totalSessions, totalSessions);
        return solvedOutcomeOf(input, initial, 'ORTOOLS', options, startedAt);
      }
    }
  }

  /**
   * Espera a OR-Tools preguntando por la cancelación. Si se pide, aborta el transporte y no espera a que acabe: la
   * respuesta llega al momento. Un fallo del transporte es un resultado, no una excepción.
   */
  private async wait(
    start: (signal: AbortSignal) => Promise<unknown>,
    { isCancelled }: SolveOptions,
  ): Promise<{ kind: 'response'; value: unknown } | { kind: 'error' } | { kind: 'cancelled' }> {
    const controller = new AbortController();
    let askToCancel: () => void = () => undefined;
    const cancellation = new Promise<{ kind: 'cancelled' }>((resolve) => {
      askToCancel = () => resolve({ kind: 'cancelled' });
    });
    const timer = setInterval(() => {
      if (isCancelled?.() === true) {
        controller.abort();
        askToCancel();
      }
    }, CANCEL_POLL_MS);
    try {
      const answer = start(controller.signal).then(
        (value) => ({ kind: 'response' as const, value }),
        () => ({ kind: 'error' as const }),
      );
      const result = await Promise.race([answer, cancellation]);
      return controller.signal.aborted ? { kind: 'cancelled' } : result;
    } finally {
      clearInterval(timer);
    }
  }

  /** Resuelve con el motor actual lo que quede de tiempo; sin tiempo, `timeout`. */
  private async runFallback(
    input: GenerationInput,
    options: SolveOptions,
    totalSessions: number,
  ): Promise<SolveOutcome> {
    if ((options.limitMs ?? 0) <= 0) {
      return { status: 'timeout', placed: 0, total: totalSessions };
    }
    return this.dependencies.fallback.solve(input, options);
  }

  /** OR-Tools dice que no hay horario: el motor actual busca la causa con el tiempo que quede. */
  private async diagnose(
    input: GenerationInput,
    options: SolveOptions,
    leftMs: number,
    log: (
      event: string,
      extra: Record<string, unknown>,
      message: string,
      level: 'warn' | 'error',
    ) => void,
  ): Promise<SolveOutcome> {
    const totalSessions = input.units.reduce((total, { size }) => total + size, 0);
    const outcome = await this.runFallback(input, { ...options, limitMs: leftMs }, totalSessions);
    if (outcome.status === 'timeout') {
      log(
        'ortools_infeasible_undiagnosed',
        {},
        'OR-Tools no encuentra horario y no hubo tiempo de buscar la causa',
        'warn',
      );
    } else if (outcome.status === 'solved') {
      log(
        'ortools_infeasible_contradicted',
        {},
        'OR-Tools dijo que no había horario y el motor actual lo encontró',
        'error',
      );
    }
    return outcome;
  }
}
