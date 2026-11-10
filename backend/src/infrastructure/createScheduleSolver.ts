import { BacktrackingSolver } from '../domain/schedule/backtrackingSolver.js';
import { OrToolsSolver, type OrToolsLogger } from '../domain/schedule/orToolsSolver.js';
import type { ScheduleSolver } from '../domain/schedule/scheduleSolver.js';
import type { AppConfig } from './config.js';
import {
  createOrToolsLambdaClient,
  LambdaOrToolsTransport,
  type LambdaInvoker,
} from './aws/lambdaOrToolsTransport.js';
import { ChildProcessOrToolsTransport } from './childProcessOrToolsTransport.js';

export interface CreateScheduleSolverOptions extends Pick<
  AppConfig,
  | 'scheduleEngine'
  | 'scheduleOrToolsPython'
  | 'scheduleOrToolsScript'
  | 'scheduleOrToolsFunctionName'
> {
  logger: OrToolsLogger;
  /** Solo para los tests: sustituye al cliente de Lambda (por defecto, el de OR-Tools: sin reintentos). */
  lambdaInvoker?: LambdaInvoker;
}

/**
 * Elige el motor de generación de horarios según `SCHEDULE_ENGINE` (US-ALGO-ORTOOLS): el de backtracking en
 * TypeScript por defecto, o el de OR-Tools con el de backtracking como alternativa y para explicar un `infeasible`.
 * Construirlo no lanza Python ni invoca la Lambda: eso ocurre al resolver.
 */
export function createScheduleSolver({
  scheduleEngine,
  scheduleOrToolsPython,
  scheduleOrToolsScript,
  scheduleOrToolsFunctionName,
  lambdaInvoker,
  logger,
}: CreateScheduleSolverOptions): ScheduleSolver {
  const backtracking = new BacktrackingSolver();
  if (scheduleEngine === 'BACKTRACKING') {
    return backtracking;
  }
  return new OrToolsSolver({
    // En AWS (con el nombre de la Lambda) se invoca la función; en local, en CI y en los tests, el proceso de Python.
    transport:
      scheduleOrToolsFunctionName === undefined
        ? new ChildProcessOrToolsTransport({
            python: scheduleOrToolsPython,
            script: scheduleOrToolsScript,
          })
        : new LambdaOrToolsTransport(
            lambdaInvoker ?? createOrToolsLambdaClient(),
            scheduleOrToolsFunctionName,
          ),
    fallback: backtracking,
    logger,
  });
}
