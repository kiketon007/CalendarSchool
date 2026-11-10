import { describe, expect, it, vi } from 'vitest';
import { BacktrackingSolver } from '../domain/schedule/backtrackingSolver.js';
import { OrToolsSolver } from '../domain/schedule/orToolsSolver.js';
import { createScheduleSolver } from './createScheduleSolver.js';

const logger = () => ({ warn: vi.fn(), error: vi.fn() });
const orToolsConfig = {
  scheduleOrToolsPython: 'python3',
  scheduleOrToolsScript: '/repo/solver-ortools/cli.py',
};

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
      logger: logger(),
    });

    expect(solver).toBeInstanceOf(OrToolsSolver);
  });
});
