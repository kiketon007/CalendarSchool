import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import {
  LimitRegistrationAttempts,
  REGISTRATION_ATTEMPTS_WINDOW_MS,
} from './limitRegistrationAttempts.js';

const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };

describe('REGISTRATION_ATTEMPTS_WINDOW_MS', () => {
  it('is the 15 minute sliding window of the registration attempt limit', () => {
    expect(REGISTRATION_ATTEMPTS_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('LimitRegistrationAttempts', () => {
  let consume: Mock<AttemptLimiter['consume']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let limitRegistrationAttempts: LimitRegistrationAttempts;

  beforeEach(() => {
    consume = vi.fn<AttemptLimiter['consume']>().mockResolvedValue(undefined);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    limitRegistrationAttempts = new LimitRegistrationAttempts({
      attemptLimiter: { consume },
      logger: { info, warn },
    });
  });

  it('counts the attempt under the registration key of the client ip', async () => {
    await limitRegistrationAttempts.execute(CONTEXT);

    expect(consume).toHaveBeenCalledWith('register:203.0.113.7');
  });

  it('shares one counter among the requests that cannot be attributed to an ip', async () => {
    await limitRegistrationAttempts.execute({ ip: undefined, userAgent: undefined });

    expect(consume).toHaveBeenCalledWith('register:unknown');
  });

  it('logs nothing when the attempt is accepted', async () => {
    await limitRegistrationAttempts.execute(CONTEXT);

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('rethrows TooManyAttempts and logs USER_REGISTER_RATE_LIMITED as a warning without the email', async () => {
    consume.mockRejectedValueOnce(new TooManyAttempts(300));

    const error: unknown = await limitRegistrationAttempts
      .execute(CONTEXT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TooManyAttempts);
    expect(warn).toHaveBeenCalledWith(
      {
        event: 'USER_REGISTER_RATE_LIMITED',
        ip: '203.0.113.7',
        user_agent: 'Mozilla/5.0 (test)',
        retry_after: 300,
      },
      expect.any(String),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/email|password/i);
  });

  it('propagates DatabaseUnavailable without logging a rate limit event', async () => {
    consume.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

    await expect(limitRegistrationAttempts.execute(CONTEXT)).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('propagates any other failure untouched', async () => {
    const failure = new Error('inesperado');
    consume.mockRejectedValueOnce(failure);

    await expect(limitRegistrationAttempts.execute(CONTEXT)).rejects.toBe(failure);

    expect(warn).not.toHaveBeenCalled();
  });
});
