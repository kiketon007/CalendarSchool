import { afterEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './resetDatabase.js';
import { testDatabaseUrl, testPrisma, testSchema } from './testPrisma.js';

const publicProbe = `reset_probe_${testSchema}`;

async function countRows(qualifiedTable: string): Promise<number> {
  const [row] = await testPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) AS count FROM ${qualifiedTable}`,
  );
  return Number(row?.count);
}

describe('resetDatabase', () => {
  afterEach(async () => {
    await testPrisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${testSchema}".reset_probe`);
    await testPrisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public."${publicProbe}"`);
  });

  it('empties every table of the worker schema and restarts identities', async () => {
    await testPrisma.$executeRawUnsafe(
      `CREATE TABLE "${testSchema}".reset_probe (id serial PRIMARY KEY, label text)`,
    );
    await testPrisma.$executeRawUnsafe(
      `INSERT INTO "${testSchema}".reset_probe (label) VALUES ('a'), ('b')`,
    );

    await resetDatabase(testPrisma, testDatabaseUrl, testSchema);

    expect(await countRows(`"${testSchema}".reset_probe`)).toBe(0);
    const [inserted] = await testPrisma.$queryRawUnsafe<{ id: number }[]>(
      `INSERT INTO "${testSchema}".reset_probe (label) VALUES ('c') RETURNING id`,
    );
    expect(inserted?.id).toBe(1);
  });

  it('keeps the migration history intact', async () => {
    const before = await countRows(`"${testSchema}"._prisma_migrations`);

    await resetDatabase(testPrisma, testDatabaseUrl, testSchema);

    expect(before).toBeGreaterThan(0);
    expect(await countRows(`"${testSchema}"._prisma_migrations`)).toBe(before);
  });

  it('empties schools, users, refresh tokens and attempts but keeps the fixed municipalities', async () => {
    const municipalitiesBefore = await countRows(`"${testSchema}".municipalities`);
    await testPrisma.school.create({
      data: {
        id: '0192f5a0-0000-7000-8000-000000000001',
        name: 'CEIP Lluís Vives',
        normalizedName: 'ceiplluisvives',
        municipalityCode: '46250',
      },
    });
    await testPrisma.user.create({
      data: {
        id: '0192f5a0-0000-7000-8000-0000000000a1',
        schoolId: '0192f5a0-0000-7000-8000-000000000001',
        email: 'jose@example.com',
        passwordHash: '$2b$12$'.padEnd(60, 'x'),
        firstName: 'José',
        lastName: 'García',
        role: 'ADMIN',
      },
    });
    await testPrisma.refreshToken.create({
      data: {
        id: '0192f5a0-0000-7000-8000-0000000000b1',
        userId: '0192f5a0-0000-7000-8000-0000000000a1',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date('2026-10-10T08:00:00Z'),
      },
    });
    await testPrisma.rateLimitAttempt.create({
      data: {
        id: '0192f5a0-0000-7000-8000-0000000000c1',
        key: 'register:203.0.113.7',
        attemptedAt: new Date('2026-10-10T09:00:00Z'),
      },
    });

    await resetDatabase(testPrisma, testDatabaseUrl, testSchema);

    expect(municipalitiesBefore).toBe(542);
    expect(await countRows(`"${testSchema}".municipalities`)).toBe(municipalitiesBefore);
    expect(await countRows(`"${testSchema}".schools`)).toBe(0);
    expect(await countRows(`"${testSchema}".users`)).toBe(0);
    expect(await countRows(`"${testSchema}".refresh_tokens`)).toBe(0);
    expect(await countRows(`"${testSchema}".rate_limit_attempts`)).toBe(0);
  });

  it('does not touch tables of the public schema', async () => {
    await testPrisma.$executeRawUnsafe(`CREATE TABLE public."${publicProbe}" (id int)`);
    await testPrisma.$executeRawUnsafe(`INSERT INTO public."${publicProbe}" VALUES (1)`);

    await resetDatabase(testPrisma, testDatabaseUrl, testSchema);

    expect(await countRows(`public."${publicProbe}"`)).toBe(1);
  });

  it('succeeds when the tables are already empty', async () => {
    await expect(resetDatabase(testPrisma, testDatabaseUrl, testSchema)).resolves.toBeUndefined();
  });

  it('refuses to run against the public schema without executing anything', async () => {
    await testPrisma.$executeRawUnsafe(`CREATE TABLE public."${publicProbe}" (id int)`);
    await testPrisma.$executeRawUnsafe(`INSERT INTO public."${publicProbe}" VALUES (1)`);

    await expect(resetDatabase(testPrisma, testDatabaseUrl, 'public')).rejects.toThrow(/test_<n>/);
    expect(await countRows(`public."${publicProbe}"`)).toBe(1);
  });

  it('refuses to run against a database that is not a test database', async () => {
    const devUrl = testDatabaseUrl.replace(/_test(\?|$)/, '$1');

    await expect(resetDatabase(testPrisma, devUrl, testSchema)).rejects.toThrow(/_test/);
  });
});
