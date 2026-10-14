import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTEMPT_RETENTION_HOURS } from '../../application/attempts/attemptRetention.js';
import { testPrisma } from '../../../test/support/testPrisma.js';

const PURGE_SQL = readFileSync(
  resolve(import.meta.dirname, '../../../../infrastructure/supabase/purge-rate-limit-attempts.sql'),
  'utf8',
);

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function uuid(n: number): string {
  return `0192f5a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

async function insertAttempt(n: number, key: string, ageMs: number): Promise<void> {
  await testPrisma.rateLimitAttempt.create({
    data: { id: uuid(n), key, attemptedAt: new Date(Date.now() - ageMs) },
  });
}

describe('purge-rate-limit-attempts.sql', () => {
  it('uses the retention period declared by the application', () => {
    expect(PURGE_SQL).toContain(`interval '${ATTEMPT_RETENTION_HOURS} hours'`);
  });

  it('deletes only the attempts older than the retention period', async () => {
    await insertAttempt(1, 'register:203.0.113.7', 25 * HOUR_MS);
    await insertAttempt(2, 'register:203.0.113.8', 23 * HOUR_MS);
    await insertAttempt(3, 'register:203.0.113.9', MINUTE_MS);

    await testPrisma.$executeRawUnsafe(PURGE_SQL);

    const remaining = await testPrisma.rateLimitAttempt.findMany({ orderBy: { id: 'asc' } });
    expect(remaining.map((attempt) => attempt.id)).toEqual([uuid(2), uuid(3)]);
  });

  it('deletes the old attempt of a key that is never used again', async () => {
    await insertAttempt(1, 'register:203.0.113.7', 25 * HOUR_MS);

    await testPrisma.$executeRawUnsafe(PURGE_SQL);

    await expect(testPrisma.rateLimitAttempt.count()).resolves.toBe(0);
  });
});
