import { describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaRefreshTokenRepository } from './prismaRefreshTokenRepository.js';

const repository = new PrismaRefreshTokenRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const TOKEN_ID = '0192f5a0-0000-7000-8000-0000000000b1';
const TOKEN_HASH = 'a'.repeat(64);

async function insertUserWithToken(
  overrides: { revokedAt?: Date; status?: 'ACTIVE' | 'SUSPENDED' } = {},
) {
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
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: 'José',
      lastName: 'García',
      role: 'ADMIN',
      status: overrides.status ?? 'ACTIVE',
    },
  });
  await testPrisma.refreshToken.create({
    data: {
      id: TOKEN_ID,
      userId: USER_ID,
      tokenHash: TOKEN_HASH,
      expiresAt: new Date('2026-10-10T08:00:00Z'),
      revokedAt: overrides.revokedAt ?? null,
      userAgent: 'Mozilla/5.0',
      ipAddress: '203.0.113.7',
    },
  });
}

describe('PrismaRefreshTokenRepository', () => {
  describe('findByHash', () => {
    it('returns the token with its user and school, without the password hash', async () => {
      await insertUserWithToken();

      const found = await repository.findByHash(TOKEN_HASH);

      expect(found).toEqual({
        token: {
          id: TOKEN_ID,
          userId: USER_ID,
          tokenHash: TOKEN_HASH,
          expiresAt: new Date('2026-10-10T08:00:00Z'),
          revokedAt: null,
          userAgent: 'Mozilla/5.0',
          ipAddress: '203.0.113.7',
        },
        user: {
          id: USER_ID,
          email: 'jose@example.com',
          firstName: 'José',
          lastName: 'García',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        school: { id: SCHOOL_ID, name: 'CEIP Lluís Vives' },
      });
      expect(JSON.stringify(found)).not.toContain('$2b$12$');
    });

    it('returns revoked tokens and inactive users as they are, leaving the rule to the use case', async () => {
      const revokedAt = new Date('2026-10-09T09:00:00Z');
      await insertUserWithToken({ revokedAt, status: 'SUSPENDED' });

      const found = await repository.findByHash(TOKEN_HASH);

      expect(found?.token.revokedAt).toEqual(revokedAt);
      expect(found?.user.status).toBe('SUSPENDED');
    });

    it('returns null when no token has that hash', async () => {
      await insertUserWithToken();

      await expect(repository.findByHash('b'.repeat(64))).resolves.toBeNull();
    });
  });
});

describe('PrismaRefreshTokenRepository with an unreachable database', () => {
  it('findByHash throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaRefreshTokenRepository(prisma).findByHash(TOKEN_HASH),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
