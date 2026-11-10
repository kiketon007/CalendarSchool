import { describe, expect, it, vi } from 'vitest';
import fixtures from '../../../test-fixtures/schedule-generation.json' with { type: 'json' };
import {
  problemOf,
  professor,
  subject,
  type FixtureCalendars,
} from '../../test/support/scheduleProblemFixtures.js';
import { BacktrackingSolver } from '../domain/schedule/backtrackingSolver.js';
import { generationInputOf } from '../domain/schedule/generationInput.js';
import { OrToolsSolver } from '../domain/schedule/orToolsSolver.js';
import type { LambdaInvoker } from './aws/lambdaOrToolsTransport.js';
import { createScheduleSolver } from './createScheduleSolver.js';

const logger = () => ({ warn: vi.fn(), error: vi.fn() });
const orToolsConfig = {
  scheduleOrToolsPython: 'python3',
  scheduleOrToolsScript: '/repo/solver-ortools/cli.py',
  scheduleOrToolsFunctionName: undefined,
};

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const calendars = (fixtures as unknown as { calendars: FixtureCalendars }).calendars;
/** Una lección de 2 sesiones: lo justo para que el motor llegue a invocar el transporte. */
const input = generationInputOf(
  problemOf(
    calendars,
    [
      {
        name: '1º',
        calendar: 'Corto',
        classes: ['A'],
        subjects: [subject('Lengua', 2, { A: 'Ana Ruiz' })],
      },
    ],
    [professor('Ana Ruiz')],
  ),
  (a, b) => collator.compare(a, b),
);

describe('createScheduleSolver', () => {
  it('builds the BACKTRACKING engine by default', () => {
    const solver = createScheduleSolver({
      ...orToolsConfig,
      scheduleEngine: 'BACKTRACKING',
      logger: logger(),
    });

    expect(solver).toBeInstanceOf(BacktrackingSolver);
  });

  it('builds the ORTOOLS engine, with the current one as the alternative', () => {
    const solver = createScheduleSolver({
      ...orToolsConfig,
      scheduleEngine: 'ORTOOLS',
      logger: logger(),
    });

    expect(solver).toBeInstanceOf(OrToolsSolver);
  });

  it('does not launch Python just by building the engine', () => {
    // Construir el motor no lanza nada: el proceso se lanza al resolver.
    const solver = createScheduleSolver({
      scheduleEngine: 'ORTOOLS',
      scheduleOrToolsPython: '/no/such/python',
      scheduleOrToolsScript: '/no/such/cli.py',
      scheduleOrToolsFunctionName: undefined,
      logger: logger(),
    });

    expect(solver).toBeInstanceOf(OrToolsSolver);
  });

  describe('the transport of the ORTOOLS engine', () => {
    it('invokes the Lambda when the function name is configured (AWS)', async () => {
      const send = vi.fn(() =>
        Promise.resolve({
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({ version: 1, status: 'timeout' })),
        }),
      );
      const solver = createScheduleSolver({
        ...orToolsConfig,
        scheduleEngine: 'ORTOOLS',
        scheduleOrToolsFunctionName: 'ortools-fn',
        lambdaInvoker: { send } as unknown as LambdaInvoker,
        logger: logger(),
      });

      const outcome = await solver.solve(input);

      expect(outcome.status).toBe('timeout');
      expect(send).toHaveBeenCalledTimes(1);
      const command = (send.mock.calls[0] as unknown as [{ input: { FunctionName: string } }])[0];
      expect(command.input.FunctionName).toBe('ortools-fn');
    });

    it('launches the Python process when there is no function name (local and CI)', async () => {
      const send = vi.fn();
      const log = logger();
      const solver = createScheduleSolver({
        scheduleEngine: 'ORTOOLS',
        scheduleOrToolsPython: '/no/such/python',
        scheduleOrToolsScript: '/no/such/cli.py',
        scheduleOrToolsFunctionName: undefined,
        lambdaInvoker: { send },
        logger: log,
      });

      const outcome = await solver.solve(input);

      // El proceso no existe: OR-Tools falla y se usa el motor actual, sin tocar la Lambda.
      expect(outcome).toMatchObject({ status: 'solved', engine: 'BACKTRACKING' });
      expect(send).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ortools_fallback', reason: 'invoke_error' }),
        expect.any(String),
      );
    });
  });
});
