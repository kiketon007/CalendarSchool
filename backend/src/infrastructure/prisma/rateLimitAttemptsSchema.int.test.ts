import { describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const ATTEMPT_A = '0192f5a0-0000-7000-8000-0000000000c1';
const ATTEMPT_B = '0192f5a0-0000-7000-8000-0000000000c2';

describe('rate_limit_attempts schema', () => {
  it('stores the key and the instant of an attempt', async () => {
    const attemptedAt = new Date('2026-10-10T09:00:00Z');

    const attempt = await testPrisma.rateLimitAttempt.create({
      data: { id: ATTEMPT_A, key: 'register:203.0.113.7', attemptedAt },
    });

    expect(attempt).toEqual({ id: ATTEMPT_A, key: 'register:203.0.113.7', attemptedAt });
  });

  it('allows several attempts with the same key', async () => {
    const attemptedAt = new Date('2026-10-10T09:00:00Z');
    await testPrisma.rateLimitAttempt.create({
      data: { id: ATTEMPT_A, key: 'register:203.0.113.7', attemptedAt },
    });

    await expect(
      testPrisma.rateLimitAttempt.create({
        data: { id: ATTEMPT_B, key: 'register:203.0.113.7', attemptedAt },
      }),
    ).resolves.toMatchObject({ id: ATTEMPT_B });
    expect(await testPrisma.rateLimitAttempt.count()).toBe(2);
  });

  it('rejects two attempts with the same identifier', async () => {
    const attemptedAt = new Date('2026-10-10T09:00:00Z');
    await testPrisma.rateLimitAttempt.create({
      data: { id: ATTEMPT_A, key: 'register:203.0.113.7', attemptedAt },
    });

    await expect(
      testPrisma.rateLimitAttempt.create({
        data: { id: ATTEMPT_A, key: 'register:198.51.100.9', attemptedAt },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('accepts a key as long as an IPv6 address with its prefix', async () => {
    const key = `register:${'0123:'.repeat(7)}0123`;

    await expect(
      testPrisma.rateLimitAttempt.create({
        data: { id: ATTEMPT_A, key, attemptedAt: new Date('2026-10-10T09:00:00Z') },
      }),
    ).resolves.toMatchObject({ key });
  });
});
