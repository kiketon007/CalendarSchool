import { BacktrackingSolver } from '../domain/schedule/backtrackingSolver.js';
import { OrToolsSolver, type OrToolsLogger } from '../domain/schedule/orToolsSolver.js';
import type { ScheduleSolver } from '../domain/schedule/scheduleSolver.js';
import type { AppConfig } from './config.js';
import { ChildProcessOrToolsTransport } from './childProcessOrToolsTransport.js';

export interface CreateScheduleSolverOptions extends Pick<
  AppConfig,
  'scheduleEngine' | 'scheduleOrToolsPython' | 'scheduleOrToolsScript'
> {
  logger: OrToolsLogger;
}

/**
 * Elige el motor de generación de horarios según `SCHEDULE_ENGINE` (US-ALGO-ORTOOLS): el de backtracking en
 * TypeScript por defecto, o el de OR-Tools con el de backtracking como alternativa y para explicar un `infeasible`.
 * Construirlo no lanza Python: el proceso se lanza al resolver.
 */
export function createScheduleSolver({
  scheduleEngine,
  scheduleOrToolsPython,
  scheduleOrToolsScript,
  logger,
}: CreateScheduleSolverOptions): ScheduleSolver {
  const backtracking = new BacktrackingSolver();
  if (scheduleEngine === 'BACKTRACKING') {
    return backtracking;
  }
  return new OrToolsSolver({
    transport: new ChildProcessOrToolsTransport({
      python: scheduleOrToolsPython,
      script: scheduleOrToolsScript,
    }),
    fallback: backtracking,
    logger,
  });
}
