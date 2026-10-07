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

  it('does not touch tables of the public schema', async () => {
    await testPrisma.$executeRawUnsafe(`CREATE TABLE public."${publicProbe}" (id int)`);
    await testPrisma.$executeRawUnsafe(`INSERT INTO public."${publicProbe}" VALUES (1)`);

    await resetDatabase(testPrisma, testDatabaseUrl, testSchema);

    expect(await countRows(`public."${publicProbe}"`)).toBe(1);
  });

  it('succeeds when the worker schema has no tables to empty', async () => {
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
