import { describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { createPrismaClient } from './createPrismaClient.js';
import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import type { School } from '../../domain/school/school.js';
import type { RefreshToken } from '../../domain/session/refreshToken.js';
import type { User } from '../../domain/user/user.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { PrismaRegistrationRepository } from './prismaRegistrationRepository.js';

const repository = new PrismaRegistrationRepository(testPrisma);

const VALENCIA = '46250';
const ALICANTE = '03014';

function uuid(n: number): string {
  return `0192f5a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

function school(n: number, overrides: Partial<School> = {}): School {
  return {
    id: uuid(n),
    name: `Colegio ${n}`,
    normalizedName: `colegio${n}`,
    municipalityCode: VALENCIA,
    ...overrides,
  };
}

function admin(n: number, schoolId: string, overrides: Partial<User> = {}): User {
  return {
    id: uuid(1000 + n),
    schoolId,
    email: `admin${n}@example.com`,
    passwordHash: '$2b$12$'.padEnd(60, 'x'),
    firstName: 'José',
    lastName: 'García',
    role: 'ADMIN',
    status: 'ACTIVE',
    ...overrides,
  };
}

/** Refresh token de la primera sesión del administrador `n`; su hash es único por `n`. */
function refreshToken(n: number, overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: uuid(2000 + n),
    userId: uuid(1000 + n),
    tokenHash: String(n).padStart(64, '0'),
    expiresAt: new Date('2026-10-10T08:00:00Z'),
    revokedAt: null,
    userAgent: 'Mozilla/5.0',
    ipAddress: '203.0.113.7',
    ...overrides,
  };
}

async function counts(): Promise<{ schools: number; users: number; refreshTokens: number }> {
  return {
    schools: await testPrisma.school.count(),
    users: await testPrisma.user.count(),
    refreshTokens: await testPrisma.refreshToken.count(),
  };
}

describe('PrismaRegistrationRepository', () => {
  describe('createSchoolWithAdmin', () => {
    it('stores the school and its administrator', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      const stored = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'admin1@example.com' },
        include: { school: true },
      });
      expect(stored).toMatchObject({
        id: uuid(1001),
        role: 'ADMIN',
        status: 'ACTIVE',
        schoolId: uuid(1),
        school: { name: 'Colegio 1', normalizedName: 'colegio1', municipalityCode: VALENCIA },
      });
    });

    it('stores the refresh token of the first session with the administrator', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(
        testPrisma.refreshToken.findUniqueOrThrow({ where: { id: uuid(2001) } }),
      ).resolves.toMatchObject({
        userId: uuid(1001),
        tokenHash: String(1).padStart(64, '0'),
        revokedAt: null,
      });
    });

    it('rolls back the school and the user when the refresh token cannot be stored', async () => {
      // El mismo hash dos veces: la segunda alta falla al insertar el refresh token,
      // después de haber insertado su colegio y su usuario.
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(
        repository.createSchoolWithAdmin(
          school(2),
          admin(2, uuid(2)),
          refreshToken(2, { tokenHash: String(1).padStart(64, '0') }),
        ),
      ).rejects.toThrow();

      expect(await counts()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
    });

    it('rolls back the school when the user cannot be stored', async () => {
      // El mismo id de usuario dos veces: la segunda alta falla al insertar el usuario,
      // después de haber insertado su colegio.
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(
        repository.createSchoolWithAdmin(
          school(2),
          admin(2, uuid(2), { id: uuid(1001) }),
          refreshToken(2),
        ),
      ).rejects.toThrow();

      expect(await counts()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
    });

    it('throws EmailAlreadyRegistered for a repeated email and leaves no school behind', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(
        repository.createSchoolWithAdmin(
          school(2),
          admin(2, uuid(2), { email: 'admin1@example.com' }),
          refreshToken(2),
        ),
      ).rejects.toBeInstanceOf(EmailAlreadyRegistered);

      expect(await counts()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
    });

    it('throws SchoolAlreadyRegistered for the same normalized name in the same municipality', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(
        repository.createSchoolWithAdmin(
          school(2, { normalizedName: 'colegio1' }),
          admin(2, uuid(2)),
          refreshToken(2),
        ),
      ).rejects.toBeInstanceOf(SchoolAlreadyRegistered);

      expect(await counts()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
    });

    it('accepts the same normalized name in another municipality', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(
        repository.createSchoolWithAdmin(
          school(2, { normalizedName: 'colegio1', municipalityCode: ALICANTE }),
          admin(2, uuid(2)),
          refreshToken(2),
        ),
      ).resolves.toBeUndefined();
    });

    it('creates only one of two simultaneous registrations with the same email', async () => {
      const results = await Promise.allSettled([
        repository.createSchoolWithAdmin(
          school(1),
          admin(1, uuid(1), { email: 'mismo@example.com' }),
          refreshToken(1),
        ),
        repository.createSchoolWithAdmin(
          school(2),
          admin(2, uuid(2), { email: 'mismo@example.com' }),
          refreshToken(2),
        ),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(EmailAlreadyRegistered);
      expect(await counts()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
    });

    it('creates only one of two simultaneous registrations of the same school', async () => {
      const results = await Promise.allSettled([
        repository.createSchoolWithAdmin(
          school(1, { normalizedName: 'mismo' }),
          admin(1, uuid(1)),
          refreshToken(1),
        ),
        repository.createSchoolWithAdmin(
          school(2, { normalizedName: 'mismo' }),
          admin(2, uuid(2)),
          refreshToken(2),
        ),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(SchoolAlreadyRegistered);
      expect(await counts()).toEqual({ schools: 1, users: 1, refreshTokens: 1 });
    });
  });

  describe('existsUserByEmail', () => {
    it('finds a registered email and not an unknown one', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(repository.existsUserByEmail('admin1@example.com')).resolves.toBe(true);
      await expect(repository.existsUserByEmail('otro@example.com')).resolves.toBe(false);
    });
  });

  describe('existsSchool', () => {
    it('finds a school by normalized name and municipality', async () => {
      await repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1));

      await expect(repository.existsSchool('colegio1', VALENCIA)).resolves.toBe(true);
      await expect(repository.existsSchool('colegio1', ALICANTE)).resolves.toBe(false);
      await expect(repository.existsSchool('colegio2', VALENCIA)).resolves.toBe(false);
    });
  });
});

describe('PrismaRegistrationRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaRegistrationRepository(prisma) };
  }

  it.each([
    [
      'existsUserByEmail',
      (repository: PrismaRegistrationRepository) => repository.existsUserByEmail('a@example.com'),
    ],
    [
      'existsSchool',
      (repository: PrismaRegistrationRepository) => repository.existsSchool('colegio1', '46250'),
    ],
    [
      'createSchoolWithAdmin',
      (repository: PrismaRegistrationRepository) =>
        repository.createSchoolWithAdmin(school(1), admin(1, uuid(1)), refreshToken(1)),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
