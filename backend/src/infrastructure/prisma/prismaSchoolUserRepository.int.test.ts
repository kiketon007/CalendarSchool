import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { UserRole, UserStatus } from '../../domain/user/user.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaSchoolUserRepository } from './prismaSchoolUserRepository.js';

const repository = new PrismaSchoolUserRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let counter = 0;

async function insertUser(
  schoolId: string,
  overrides: {
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: UserRole;
    status?: UserStatus;
    createdAt?: Date;
  } = {},
) {
  counter += 1;
  const id = `0192f5a0-0000-7000-8000-${String(counter).padStart(12, '0')}`;
  await testPrisma.user.create({
    data: {
      id,
      schoolId,
      email: overrides.email ?? `user${counter}@example.com`,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: overrides.firstName ?? 'Nombre',
      lastName: overrides.lastName ?? 'Apellido',
      role: overrides.role ?? 'MEMBER',
      status: overrides.status ?? 'ACTIVE',
      ...(overrides.createdAt && { createdAt: overrides.createdAt }),
    },
  });
  return id;
}

describe('PrismaSchoolUserRepository.listBySchool', () => {
  beforeEach(async () => {
    counter = 0;
    await testPrisma.school.create({
      data: {
        id: SCHOOL_ID,
        name: 'CEIP Uno',
        normalizedName: 'ceipuno',
        municipalityCode: '46250',
      },
    });
    await testPrisma.school.create({
      data: {
        id: OTHER_SCHOOL_ID,
        name: 'CEIP Dos',
        normalizedName: 'ceipdos',
        municipalityCode: '46250',
      },
    });
  });

  it('returns exactly the seven fields of the list, without the password hash or the consent', async () => {
    const createdAt = new Date('2026-10-07T09:30:00Z');
    const id = await insertUser(SCHOOL_ID, {
      firstName: 'José María',
      lastName: 'García-López',
      email: 'jose.garcia@example.com',
      role: 'ADMIN',
      createdAt,
    });

    const users = await repository.listBySchool(SCHOOL_ID);

    expect(users).toEqual([
      {
        id,
        firstName: 'José María',
        lastName: 'García-López',
        email: 'jose.garcia@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt,
      },
    ]);
    expect(JSON.stringify(users)).not.toContain('$2b$12$');
  });

  it('returns only the users of the school it is given', async () => {
    await insertUser(SCHOOL_ID, { email: 'a@example.com', lastName: 'Uno' });
    await insertUser(SCHOOL_ID, { email: 'b@example.com', lastName: 'Dos' });
    await insertUser(OTHER_SCHOOL_ID, { email: 'c@example.com', lastName: 'Ajeno' });

    const users = await repository.listBySchool(SCHOOL_ID);

    expect(users.map((user) => user.email).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect((await repository.listBySchool(OTHER_SCHOOL_ID)).map((user) => user.email)).toEqual([
      'c@example.com',
    ]);
  });

  it('returns ACTIVE and SUSPENDED users and leaves out the DELETED ones', async () => {
    await insertUser(SCHOOL_ID, { email: 'active@example.com', status: 'ACTIVE' });
    await insertUser(SCHOOL_ID, { email: 'suspended@example.com', status: 'SUSPENDED' });
    await insertUser(SCHOOL_ID, { email: 'deleted@example.com', status: 'DELETED' });

    const users = await repository.listBySchool(SCHOOL_ID);

    expect(users.map((user) => [user.email, user.status]).sort()).toEqual([
      ['active@example.com', 'ACTIVE'],
      ['suspended@example.com', 'SUSPENDED'],
    ]);
  });

  it('sorts by last name, first name and email with the Spanish collation', async () => {
    await insertUser(SCHOOL_ID, { lastName: 'Zapata', firstName: 'Ana', email: 'z@example.com' });
    // Un apellido con tilde inicial va con la A, no al final como con una intercalación binaria.
    await insertUser(SCHOOL_ID, { lastName: 'Álvarez', firstName: 'Luis', email: 'a@example.com' });
    await insertUser(SCHOOL_ID, { lastName: 'García', firstName: 'Luis', email: 'g2@example.com' });
    await insertUser(SCHOOL_ID, { lastName: 'García', firstName: 'Ana', email: 'g1@example.com' });
    await insertUser(SCHOOL_ID, { lastName: 'García', firstName: 'Ana', email: 'g0@example.com' });

    const users = await repository.listBySchool(SCHOOL_ID);

    expect(users.map((user) => user.email)).toEqual([
      'a@example.com',
      'g0@example.com',
      'g1@example.com',
      'g2@example.com',
      'z@example.com',
    ]);
  });

  it('returns an empty list for a school without users', async () => {
    await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
  });
});

describe('PrismaSchoolUserRepository with an unreachable database', () => {
  it('listBySchool throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaSchoolUserRepository(prisma).listBySchool(SCHOOL_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
