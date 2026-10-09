import { describe, expect, it } from 'vitest';
import {
  PRESERVED_TABLES as E2E_PRESERVED_TABLES,
  cleanE2eData,
} from '../../../scripts/e2eData.mjs';
import { PRESERVED_TABLES as RESET_PRESERVED_TABLES } from './resetDatabase.js';
import { testDatabaseUrl, testPrisma, testSchema } from './testPrisma.js';

const probe = `e2e_probe_${testSchema}`;

async function insertSchoolWithAdminSession() {
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
}

describe('cleanE2eData', () => {
  it('empties the data tables and keeps the municipalities and the migration history', async () => {
    await insertSchoolWithAdminSession();
    const municipalities = await testPrisma.municipality.count();
    const migrations = await testPrisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${testSchema}"._prisma_migrations`,
    );

    const truncated = await cleanE2eData(testDatabaseUrl, testSchema);

    expect(await testPrisma.school.count()).toBe(0);
    expect(await testPrisma.user.count()).toBe(0);
    expect(await testPrisma.refreshToken.count()).toBe(0);
    expect(await testPrisma.municipality.count()).toBe(municipalities);
    expect(municipalities).toBe(542);
    const after = await testPrisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${testSchema}"._prisma_migrations`,
    );
    expect(after[0]?.count).toBe(migrations[0]?.count);
    expect(truncated).toEqual(expect.arrayContaining(['schools', 'users', 'refresh_tokens']));
    expect(truncated).not.toContain('municipalities');
    expect(truncated).not.toContain('_prisma_migrations');
  });

  it('succeeds when the tables are already empty', async () => {
    await expect(cleanE2eData(testDatabaseUrl, testSchema)).resolves.toEqual(
      expect.arrayContaining(['schools', 'users']),
    );
  });

  it('does not touch tables of other schemas', async () => {
    await testPrisma.$executeRawUnsafe(`CREATE TABLE public."${probe}" (id int)`);
    await testPrisma.$executeRawUnsafe(`INSERT INTO public."${probe}" VALUES (1)`);

    try {
      await cleanE2eData(testDatabaseUrl, testSchema);

      const rows = await testPrisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*) AS count FROM public."${probe}"`,
      );
      expect(Number(rows[0]?.count)).toBe(1);
    } finally {
      await testPrisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public."${probe}"`);
    }
  });

  it('preserves the same tables as resetDatabase, so both ways of cleaning agree', () => {
    expect([...E2E_PRESERVED_TABLES].sort()).toEqual([...RESET_PRESERVED_TABLES].sort());
  });
});
