import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  orToolsAvailable,
  orToolsPython,
  ORTOOLS_SCRIPT,
} from '../../test/support/orToolsPython.js';
import type { OrToolsRequest } from '../domain/schedule/orToolsTransport.js';
import {
  ChildProcessOrToolsTransport,
  OrToolsProcessError,
} from './childProcessOrToolsTransport.js';

/** Una lección de una sesión en un curso de una sesión al día: un problema mínimo con solución. */
const smallRequest: OrToolsRequest = {
  version: 1,
  limitSeconds: 30,
  courses: [{ id: 'c1', cells: [{ sessionNumber: 1, startMinute: 540, endMinute: 585 }] }],
  lessons: [
    { index: 0, courseId: 'c1', classId: 'a', professorId: 'p1', maxPerDay: 1, blockSize: null },
  ],
  units: [
    {
      index: 0,
      lessonIndex: 0,
      size: 1,
      placements: [
        { dayOfWeek: 1, firstSession: 1 },
        { dayOfWeek: 2, firstSession: 1 },
      ],
    },
  ],
};

const folder = mkdtempSync(join(tmpdir(), 'ortools-transport-'));
const sleepingScript = join(folder, 'sleeping.py');
writeFileSync(sleepingScript, 'import time\ntime.sleep(60)\n');
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const realProcess = orToolsAvailable();

describe('ChildProcessOrToolsTransport', () => {
  describe.skipIf(!realProcess)('with the real solver', () => {
    const transport = new ChildProcessOrToolsTransport({
      python: orToolsPython(),
      script: ORTOOLS_SCRIPT,
    });

    it('sends the request and answers what the solver says', async () => {
      const response = await transport.solve(smallRequest, new AbortController().signal);

      expect(response).toMatchObject({ version: 1, status: 'solved' });
      expect((response as { placements: unknown[] }).placements).toHaveLength(1);
    });

    it('rejects, without the text of the error in the message, when the solver exits with an error', async () => {
      const failure = transport.solve(
        { ...smallRequest, version: 2 } as unknown as OrToolsRequest,
        new AbortController().signal,
      );

      await expect(failure).rejects.toBeInstanceOf(OrToolsProcessError);
      await expect(failure).rejects.toThrow(/código 2/);
      await expect(failure).rejects.not.toThrow(/version/);
    });
  });

  it('rejects when the python executable does not exist', async () => {
    const transport = new ChildProcessOrToolsTransport({
      python: join(folder, 'no-python-here'),
      script: ORTOOLS_SCRIPT,
    });

    await expect(
      transport.solve(smallRequest, new AbortController().signal),
    ).rejects.toBeInstanceOf(OrToolsProcessError);
  });

  it('does not start the process when the signal is already aborted', async () => {
    const spawned: number[] = [];
    const transport = new ChildProcessOrToolsTransport({
      python: orToolsPython(),
      script: sleepingScript,
      onSpawn: (pid) => spawned.push(pid),
    });
    const controller = new AbortController();
    controller.abort();

    await expect(transport.solve(smallRequest, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(spawned).toEqual([]);
  });

  it('kills the process and rejects as soon as the signal is aborted', async () => {
    const spawned: number[] = [];
    const transport = new ChildProcessOrToolsTransport({
      python: orToolsPython(),
      script: sleepingScript,
      onSpawn: (pid) => spawned.push(pid),
    });
    const controller = new AbortController();

    const pending = transport.solve(smallRequest, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const abortedAt = Date.now();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - abortedAt).toBeLessThan(2_000);
    expect(spawned).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(isAlive(spawned[0] as number)).toBe(false);
  });

  it('kills a process that does not respect its time limit, after the grace period', async () => {
    const spawned: number[] = [];
    const transport = new ChildProcessOrToolsTransport({
      python: orToolsPython(),
      script: sleepingScript,
      graceMs: 300,
      onSpawn: (pid) => spawned.push(pid),
    });

    const failure = transport.solve(
      { ...smallRequest, limitSeconds: 0.2 },
      new AbortController().signal,
    );

    await expect(failure).rejects.toBeInstanceOf(OrToolsProcessError);
    await expect(failure).rejects.toThrow(/tiempo/);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(isAlive(spawned[0] as number)).toBe(false);
  });
});
