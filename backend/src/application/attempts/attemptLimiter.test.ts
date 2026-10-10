import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AttemptRepository, AttemptResult } from '../../domain/attempts/attemptRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { AttemptLimiter } from './attemptLimiter.js';

const NOW = new Date('2026-10-10T09:00:00.000Z');
const WINDOW_MS = 15 * 60 * 1000;

describe('AttemptLimiter', () => {
  let register: Mock<AttemptRepository['register']>;
  let limiter: AttemptLimiter;

  beforeEach(() => {
    register = vi
      .fn<AttemptRepository['register']>()
      .mockResolvedValue({ accepted: true } satisfies AttemptResult);
    limiter = new AttemptLimiter({
      attemptRepository: { register },
      policy: { maxAttempts: 5, windowMs: WINDOW_MS },
      now: () => NOW,
    });
  });

  it('resolves when the attempt is accepted', async () => {
    await expect(limiter.consume('register:203.0.113.7')).resolves.toBeUndefined();
  });

  it('passes the key, the instant and the policy to the repository', async () => {
    await limiter.consume('register:203.0.113.7');

    expect(register).toHaveBeenCalledWith('register:203.0.113.7', NOW, WINDOW_MS, 5);
  });

  it('throws TooManyAttempts with the seconds until the oldest attempt leaves the window', async () => {
    register.mockResolvedValueOnce({
      accepted: false,
      retryAt: new Date(NOW.getTime() + 120_000),
    });

    const error: unknown = await limiter.consume('register:203.0.113.7').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TooManyAttempts);
    expect((error as TooManyAttempts).retryAfterSeconds).toBe(120);
  });

  it.each([
    ['299.2 seconds', 299_200, 300],
    ['exactly 60 seconds', 60_000, 60],
    ['59.001 seconds', 59_001, 60],
  ])('rounds the wait up to whole seconds (%s)', async (_case, milliseconds, expected) => {
    register.mockResolvedValueOnce({
      accepted: false,
      retryAt: new Date(NOW.getTime() + milliseconds),
    });

    await expect(limiter.consume('k')).rejects.toMatchObject({ retryAfterSeconds: expected });
  });

  it.each([
    ['0.1 seconds', 100],
    ['an instant that has already passed', -5_000],
    ['the current instant', 0],
  ])('never reports less than 1 second (%s)', async (_case, milliseconds) => {
    register.mockResolvedValueOnce({
      accepted: false,
      retryAt: new Date(NOW.getTime() + milliseconds),
    });

    await expect(limiter.consume('k')).rejects.toMatchObject({ retryAfterSeconds: 1 });
  });

  it('uses the policy it was built with, so each operation can have its own', async () => {
    const loginLimiter = new AttemptLimiter({
      attemptRepository: { register },
      policy: { maxAttempts: 3, windowMs: 60_000 },
      now: () => NOW,
    });

    await loginLimiter.consume('login:203.0.113.7');

    expect(register).toHaveBeenCalledWith('login:203.0.113.7', NOW, 60_000, 3);
  });

  it('propagates DatabaseUnavailable, so an unavailable store never lets an attempt through', async () => {
    register.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

    await expect(limiter.consume('k')).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
