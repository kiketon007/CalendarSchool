import { describe, expect, it } from 'vitest';
import {
  PRESERVED_TABLES as E2E_PRESERVED_TABLES,
  cleanE2eData,
  createUser,
  setUserStatus,
} from '../../../scripts/e2eData.mjs';
import { BcryptPasswordHasher } from '../../src/infrastructure/bcryptPasswordHasher.js';
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
  await testPrisma.rateLimitAttempt.create({
    data: {
      id: '0192f5a0-0000-7000-8000-0000000000c1',
      key: 'register:203.0.113.7',
      attemptedAt: new Date('2026-10-10T09:00:00Z'),
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
    expect(await testPrisma.rateLimitAttempt.count()).toBe(0);
    expect(await testPrisma.municipality.count()).toBe(municipalities);
    expect(municipalities).toBe(542);
    const after = await testPrisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${testSchema}"._prisma_migrations`,
    );
    expect(after[0]?.count).toBe(migrations[0]?.count);
    expect(truncated).toEqual(
      expect.arrayContaining(['schools', 'users', 'refresh_tokens', 'rate_limit_attempts']),
    );
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

describe('setUserStatus', () => {
  it('changes the status of the user with that email and reports one updated row', async () => {
    await insertSchoolWithAdminSession();

    const updated = await setUserStatus(
      testDatabaseUrl,
      'jose@example.com',
      'SUSPENDED',
      testSchema,
    );

    expect(updated).toBe(1);
    expect((await testPrisma.user.findFirstOrThrow()).status).toBe('SUSPENDED');
  });

  it('can bring the user back to ACTIVE', async () => {
    await insertSchoolWithAdminSession();
    await setUserStatus(testDatabaseUrl, 'jose@example.com', 'DELETED', testSchema);

    await setUserStatus(testDatabaseUrl, 'jose@example.com', 'ACTIVE', testSchema);

    expect((await testPrisma.user.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('leaves the other users untouched', async () => {
    await insertSchoolWithAdminSession();
    await testPrisma.user.create({
      data: {
        id: '0192f5a0-0000-7000-8000-0000000000a2',
        schoolId: '0192f5a0-0000-7000-8000-000000000001',
        email: 'otra@example.com',
        passwordHash: '$2b$12$'.padEnd(60, 'x'),
        firstName: 'Otra',
        lastName: 'Persona',
        role: 'MEMBER',
      },
    });

    await setUserStatus(testDatabaseUrl, 'jose@example.com', 'SUSPENDED', testSchema);

    const other = await testPrisma.user.findUniqueOrThrow({ where: { email: 'otra@example.com' } });
    expect(other.status).toBe('ACTIVE');
  });

  it('reports zero updated rows when no user has that email', async () => {
    await insertSchoolWithAdminSession();

    const updated = await setUserStatus(
      testDatabaseUrl,
      'nadie@example.com',
      'SUSPENDED',
      testSchema,
    );

    expect(updated).toBe(0);
    expect((await testPrisma.user.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('refuses a status that the model does not have, without touching the data', async () => {
    await insertSchoolWithAdminSession();

    await expect(
      // @ts-expect-error -- un estado que el modelo no tiene: se rechaza también en tiempo de ejecución
      setUserStatus(testDatabaseUrl, 'jose@example.com', 'BANNED', testSchema),
    ).rejects.toThrow(/estado/i);

    expect((await testPrisma.user.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('refuses a database whose name does not end in _test, and never prints the credentials', async () => {
    const error = await setUserStatus(
      'postgresql://usuario:secreto@localhost:5432/calendarschool',
      'jose@example.com',
      'SUSPENDED',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('_test');
    expect((error as Error).message).not.toContain('secreto');
  });

  it('refuses a schema name that is not a plain identifier', async () => {
    await expect(
      setUserStatus(
        testDatabaseUrl,
        'jose@example.com',
        'SUSPENDED',
        'public"; DROP TABLE users; --',
      ),
    ).rejects.toThrow(/esquema/i);
  });
});

describe('createUser', () => {
  const member = {
    schoolEmail: 'jose@example.com',
    email: 'miembro@example.com',
    password: 'Secreta123!',
    role: 'MEMBER' as const,
  };

  it('creates an ACTIVE user with that role in the school of the given user, and returns its id', async () => {
    await insertSchoolWithAdminSession();

    const id = await createUser(testDatabaseUrl, member, testSchema);

    const created = await testPrisma.user.findUniqueOrThrow({ where: { email: member.email } });
    expect(created).toMatchObject({
      id,
      schoolId: '0192f5a0-0000-7000-8000-000000000001',
      role: 'MEMBER',
      status: 'ACTIVE',
      privacyPolicyAcceptedAt: null,
      privacyPolicyVersion: null,
    });
    expect(await testPrisma.user.count()).toBe(2);
  });

  it('stores a Bcrypt hash that verifies with the password and never the password itself', async () => {
    await insertSchoolWithAdminSession();

    await createUser(testDatabaseUrl, member, testSchema);

    const { passwordHash } = await testPrisma.user.findUniqueOrThrow({
      where: { email: member.email },
    });
    expect(passwordHash).not.toContain(member.password);
    expect(passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const hasher = new BcryptPasswordHasher();
    await expect(hasher.verify(member.password, passwordHash)).resolves.toBe(true);
    await expect(hasher.verify('otra-contraseña', passwordHash)).resolves.toBe(false);
  });

  it('can create an administrator and uses the names it is given', async () => {
    await insertSchoolWithAdminSession();

    await createUser(
      testDatabaseUrl,
      { ...member, role: 'ADMIN', firstName: 'Ana', lastName: 'Pérez' },
      testSchema,
    );

    await expect(
      testPrisma.user.findUniqueOrThrow({ where: { email: member.email } }),
    ).resolves.toMatchObject({ role: 'ADMIN', firstName: 'Ana', lastName: 'Pérez' });
  });

  it('fails, and creates nothing, when no user has the email that gives the school', async () => {
    await insertSchoolWithAdminSession();

    await expect(
      createUser(testDatabaseUrl, { ...member, schoolEmail: 'nadie@example.com' }, testSchema),
    ).rejects.toThrow(/colegio/i);

    expect(await testPrisma.user.count()).toBe(1);
  });

  it('refuses a database whose name does not end in _test, and never prints the credentials', async () => {
    const error = await createUser(
      'postgresql://usuario:secreto@localhost:5432/calendarschool',
      member,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('_test');
    expect((error as Error).message).not.toContain('secreto');
  });
});
