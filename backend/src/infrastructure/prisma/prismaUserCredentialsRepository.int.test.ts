import { describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaUserCredentialsRepository } from './prismaUserCredentialsRepository.js';

const repository = new PrismaUserCredentialsRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const PASSWORD_HASH = '$2b$12$'.padEnd(60, 'x');

async function insertUser(status: 'ACTIVE' | 'SUSPENDED' | 'DELETED' = 'ACTIVE') {
  await testPrisma.school.create({
    data: {
      id: SCHOOL_ID,
      name: 'CEIP Lluís Vives',
      normalizedName: 'ceiplluisvives',
      municipalityCode: '46250',
    },
  });
  await testPrisma.user.create({
    data: {
      id: USER_ID,
      schoolId: SCHOOL_ID,
      email: 'jose@example.com',
      passwordHash: PASSWORD_HASH,
      firstName: 'José',
      lastName: 'García',
      role: 'ADMIN',
      status,
    },
  });
}

describe('PrismaUserCredentialsRepository', () => {
  describe('findByEmail', () => {
    it('returns the id, the password hash and the status, and nothing else', async () => {
      await insertUser();

      const found = await repository.findByEmail('jose@example.com');

      expect(found).toEqual({ id: USER_ID, passwordHash: PASSWORD_HASH, status: 'ACTIVE' });
    });

    it.each(['SUSPENDED', 'DELETED'] as const)(
      'returns a %s user as it is, leaving the rule to the use case',
      async (status) => {
        await insertUser(status);

        await expect(repository.findByEmail('jose@example.com')).resolves.toMatchObject({
          id: USER_ID,
          status,
        });
      },
    );

    it('returns null when no user has that email', async () => {
      await insertUser();

      await expect(repository.findByEmail('otra@example.com')).resolves.toBeNull();
    });

    it('expects the email already normalized: it does not match a different case', async () => {
      await insertUser();

      await expect(repository.findByEmail('JOSE@example.com')).resolves.toBeNull();
    });
  });
});

describe('PrismaUserCredentialsRepository with an unreachable database', () => {
  it('findByEmail throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaUserCredentialsRepository(prisma).findByEmail('jose@example.com'),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
