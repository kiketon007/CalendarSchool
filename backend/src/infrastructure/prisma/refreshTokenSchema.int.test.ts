import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const MISSING_USER_ID = '0192f5a0-0000-7000-8000-0000000000ff';
const TOKEN_A = '0192f5a0-0000-7000-8000-0000000000b1';
const TOKEN_B = '0192f5a0-0000-7000-8000-0000000000b2';

/** SHA-256 en hexadecimal ficticio: 64 caracteres, como el que guarda la aplicación. */
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function newRefreshToken(id: string, tokenHash: string, userId = USER_ID) {
  return {
    id,
    userId,
    tokenHash,
    expiresAt: new Date('2026-10-10T08:00:00Z'),
    userAgent: 'Mozilla/5.0',
    ipAddress: '203.0.113.7',
  };
}

describe('refresh_tokens schema', () => {
  beforeEach(async () => {
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
      },
    });
  });

  it('stores a refresh token not revoked, with its creation date by default', async () => {
    const token = await testPrisma.refreshToken.create({ data: newRefreshToken(TOKEN_A, HASH_A) });

    expect(token.revokedAt).toBeNull();
    expect(token.createdAt).toBeInstanceOf(Date);
    expect(token.tokenHash).toBe(HASH_A);
  });

  it('rejects two refresh tokens with the same hash', async () => {
    await testPrisma.refreshToken.create({ data: newRefreshToken(TOKEN_A, HASH_A) });

    await expect(
      testPrisma.refreshToken.create({ data: newRefreshToken(TOKEN_B, HASH_A) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a refresh token whose user does not exist', async () => {
    await expect(
      testPrisma.refreshToken.create({
        data: newRefreshToken(TOKEN_A, HASH_A, MISSING_USER_ID),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('deletes the refresh tokens of a deleted user', async () => {
    await testPrisma.refreshToken.create({ data: newRefreshToken(TOKEN_A, HASH_A) });
    await testPrisma.refreshToken.create({ data: newRefreshToken(TOKEN_B, HASH_B) });

    await testPrisma.user.delete({ where: { id: USER_ID } });

    expect(await testPrisma.refreshToken.count()).toBe(0);
  });
});
