import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckHealth, DATABASE_PING_TIMEOUT_MS } from './checkHealth.js';
import type { DatabasePing } from './databasePing.js';

function pingReturning(isUp: boolean): DatabasePing {
  return { ping: vi.fn().mockResolvedValue(isUp) };
}

describe('CheckHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports ok when the database answers', async () => {
    const checkHealth = new CheckHealth(pingReturning(true));

    await expect(checkHealth.execute()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('reports unavailable when the database is down', async () => {
    const checkHealth = new CheckHealth(pingReturning(false));

    await expect(checkHealth.execute()).resolves.toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  it('reports unavailable when the ping rejects', async () => {
    const databasePing: DatabasePing = { ping: vi.fn().mockRejectedValue(new Error('boom')) };
    const checkHealth = new CheckHealth(databasePing);

    await expect(checkHealth.execute()).resolves.toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  it('reports unavailable after 2 seconds when the ping never finishes', async () => {
    const databasePing: DatabasePing = { ping: () => new Promise<boolean>(() => {}) };
    const checkHealth = new CheckHealth(databasePing);

    const result = checkHealth.execute();
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ status: 'unavailable', database: 'down' });
    expect(DATABASE_PING_TIMEOUT_MS).toBe(2000);
  });

  it('does not time out before 2 seconds', async () => {
    let resolvePing: (isUp: boolean) => void = () => {};
    const databasePing: DatabasePing = {
      ping: () => new Promise<boolean>((resolve) => (resolvePing = resolve)),
    };
    const checkHealth = new CheckHealth(databasePing);

    const result = checkHealth.execute();
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS - 1);
    resolvePing(true);

    await expect(result).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('leaves no pending timer once the ping answers', async () => {
    const checkHealth = new CheckHealth(pingReturning(true));

    await checkHealth.execute();

    expect(vi.getTimerCount()).toBe(0);
  });
});
