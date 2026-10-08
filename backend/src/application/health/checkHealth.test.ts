import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationLogger } from '../applicationLogger.js';
import { CheckHealth, DATABASE_PING_TIMEOUT_MS } from './checkHealth.js';
import type { DatabasePing } from './databasePing.js';

function pingReturning(isUp: boolean): DatabasePing {
  return { ping: vi.fn().mockResolvedValue(isUp) };
}

const hangingPing: DatabasePing = { ping: () => new Promise<boolean>(() => {}) };

describe('CheckHealth', () => {
  let warn: ReturnType<typeof vi.fn<ApplicationLogger['warn']>>;
  let logger: ApplicationLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.fn<ApplicationLogger['warn']>();
    logger = { info: vi.fn(), warn };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports ok when the database answers', async () => {
    const checkHealth = new CheckHealth(pingReturning(true), logger);

    await expect(checkHealth.execute()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('reports unavailable when the database is down', async () => {
    const checkHealth = new CheckHealth(pingReturning(false), logger);

    await expect(checkHealth.execute()).resolves.toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  it('reports unavailable when the ping rejects', async () => {
    const databasePing: DatabasePing = { ping: vi.fn().mockRejectedValue(new Error('boom')) };
    const checkHealth = new CheckHealth(databasePing, logger);

    await expect(checkHealth.execute()).resolves.toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  it('reports unavailable after 2 seconds when the ping never finishes', async () => {
    const checkHealth = new CheckHealth(hangingPing, logger);

    const result = checkHealth.execute();
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ status: 'unavailable', database: 'down' });
    expect(DATABASE_PING_TIMEOUT_MS).toBe(2000);
  });

  it('logs a warning when the ping times out', async () => {
    const checkHealth = new CheckHealth(hangingPing, logger);

    const result = checkHealth.execute();
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS);
    await result;

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { timeoutMs: DATABASE_PING_TIMEOUT_MS },
      expect.stringMatching(/timeout|tiempo máximo/i),
    );
  });

  it('does not log a warning when the database answers in time', async () => {
    await new CheckHealth(pingReturning(true), logger).execute();

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not log a warning when the database is down or the ping rejects', async () => {
    const rejectingPing: DatabasePing = { ping: vi.fn().mockRejectedValue(new Error('boom')) };

    await new CheckHealth(pingReturning(false), logger).execute();
    await new CheckHealth(rejectingPing, logger).execute();

    // La causa de esos casos ya la registra el adaptador; aquí solo se avisa del timeout.
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not time out before 2 seconds', async () => {
    let resolvePing: (isUp: boolean) => void = () => {};
    const databasePing: DatabasePing = {
      ping: () => new Promise<boolean>((resolve) => (resolvePing = resolve)),
    };
    const checkHealth = new CheckHealth(databasePing, logger);

    const result = checkHealth.execute();
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS - 1);
    resolvePing(true);

    await expect(result).resolves.toEqual({ status: 'ok', database: 'up' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves no pending timer once the ping answers', async () => {
    const checkHealth = new CheckHealth(pingReturning(true), logger);

    await checkHealth.execute();

    expect(vi.getTimerCount()).toBe(0);
  });
});
