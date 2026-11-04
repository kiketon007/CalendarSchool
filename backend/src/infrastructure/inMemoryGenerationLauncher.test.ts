import { describe, expect, it, vi } from 'vitest';
import { InMemoryGenerationLauncher } from './inMemoryGenerationLauncher.js';

describe('InMemoryGenerationLauncher', () => {
  it('returns before the generation runs, so the request is not blocked', async () => {
    let finishRun: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );
    const launcher = new InMemoryGenerationLauncher(() => run, { error: vi.fn() });

    await launcher.launch('generation-1');

    expect(run).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith('generation-1'));
    finishRun();
  });

  it('resolves the runner late, so the launcher can be built before the use case', async () => {
    const run = vi.fn(() => Promise.resolve());
    const composed: { runner?: (generationId: string) => Promise<void> } = {};
    const launcher = new InMemoryGenerationLauncher(
      () => {
        if (composed.runner === undefined) {
          throw new Error('aún no compuesto');
        }
        return composed.runner;
      },
      { error: vi.fn() },
    );
    composed.runner = run;

    await launcher.launch('generation-1');

    await vi.waitFor(() => expect(run).toHaveBeenCalledWith('generation-1'));
  });

  it('logs, and does not throw, when the run fails after being launched', async () => {
    const failure = new Error('boom');
    const logger = { error: vi.fn() };
    const launcher = new InMemoryGenerationLauncher(() => () => Promise.reject(failure), logger);

    await expect(launcher.launch('generation-1')).resolves.toBeUndefined();

    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        { generation_id: 'generation-1', err: failure },
        expect.any(String),
      ),
    );
  });
});
