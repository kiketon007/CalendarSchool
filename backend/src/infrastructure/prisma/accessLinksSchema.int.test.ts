import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma, testSchema } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const ADMIN_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const MEMBER_ID = '0192f5a0-0000-7000-8000-0000000000a2';
const MISSING_ID = '0192f5a0-0000-7000-8000-0000000000ff';

/** SHA-256 en hexadecimal ficticio: 64 caracteres, como el que guarda la aplicación. */
const hash = (letter: string) => letter.repeat(64);

let sequence = 0;
function id() {
  sequence += 1;
  return `0192f5a0-0000-7000-8000-${String(1000 + sequence).padStart(12, '0')}`;
}

const EXPIRES_AT = new Date('2026-10-20T10:00:00Z');

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: id(),
    schoolId: SCHOOL_ID,
    purpose: 'INVITATION' as const,
    tokenHash: hash('a'),
    role: 'MEMBER' as const,
    createdById: ADMIN_ID,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function passwordReset(overrides: Record<string, unknown> = {}) {
  return {
    id: id(),
    schoolId: SCHOOL_ID,
    purpose: 'PASSWORD_RESET' as const,
    tokenHash: hash('b'),
    userId: MEMBER_ID,
    createdById: ADMIN_ID,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('access_links schema', () => {
  beforeEach(async () => {
    sequence = 0;
    await testPrisma.school.create({
      data: {
        id: SCHOOL_ID,
        name: 'CEIP Lluís Vives',
        normalizedName: 'ceiplluisvives',
        municipalityCode: '46250',
      },
    });
    for (const [userId, email, role] of [
      [ADMIN_ID, 'admin@example.com', 'ADMIN'],
      [MEMBER_ID, 'miembro@example.com', 'MEMBER'],
    ] as const) {
      await testPrisma.user.create({
        data: {
          id: userId,
          schoolId: SCHOOL_ID,
          email,
          passwordHash: '$2b$12$'.padEnd(60, 'x'),
          firstName: 'Nombre',
          lastName: 'Apellido',
          role,
        },
      });
    }
  });

  it('stores a valid invitation, not used and not revoked, with its creation date by default', async () => {
    const link = await testPrisma.accessLink.create({ data: invitation() });

    expect(link).toMatchObject({
      purpose: 'INVITATION',
      role: 'MEMBER',
      userId: null,
      usedAt: null,
      revokedAt: null,
    });
    expect(link.createdAt).toBeInstanceOf(Date);
    expect(link.expiresAt).toEqual(EXPIRES_AT);
  });

  it('stores a valid password reset for a user', async () => {
    const link = await testPrisma.accessLink.create({ data: passwordReset() });

    expect(link).toMatchObject({ purpose: 'PASSWORD_RESET', userId: MEMBER_ID, role: null });
  });

  describe('the CHECK of the fields of each purpose', () => {
    it.each([
      ['an invitation without a role', () => invitation({ role: null })],
      ['an invitation with a user', () => invitation({ userId: MEMBER_ID })],
      ['a password reset without a user', () => passwordReset({ userId: null })],
      ['a password reset with a role', () => passwordReset({ role: 'MEMBER' })],
    ])('rejects %s', async (_name, build) => {
      await expect(testPrisma.accessLink.create({ data: build() as never })).rejects.toThrow(
        /access_links_purpose_fields_check/,
      );
    });
  });

  describe('the partial unique index of pending password resets', () => {
    it('rejects a second pending reset for the same user', async () => {
      await testPrisma.accessLink.create({ data: passwordReset() });

      await expect(
        testPrisma.accessLink.create({ data: passwordReset({ tokenHash: hash('c') }) }),
      ).rejects.toThrow();
    });

    it.each([
      ['used', { usedAt: new Date('2026-10-18T10:00:00Z') }],
      ['revoked', { revokedAt: new Date('2026-10-18T10:00:00Z') }],
    ])('admits a new pending reset when the previous one is %s', async (_name, closed) => {
      await testPrisma.accessLink.create({ data: passwordReset(closed) });

      await expect(
        testPrisma.accessLink.create({ data: passwordReset({ tokenHash: hash('c') }) }),
      ).resolves.toMatchObject({ userId: MEMBER_ID });
    });

    it('admits pending resets of different users', async () => {
      await testPrisma.accessLink.create({ data: passwordReset() });

      await expect(
        testPrisma.accessLink.create({
          data: passwordReset({ tokenHash: hash('c'), userId: ADMIN_ID }),
        }),
      ).resolves.toMatchObject({ userId: ADMIN_ID });
    });

    it('does not limit the pending invitations of a school', async () => {
      await testPrisma.accessLink.create({ data: invitation({ tokenHash: hash('a') }) });

      await expect(
        testPrisma.accessLink.create({ data: invitation({ tokenHash: hash('c') }) }),
      ).resolves.toMatchObject({ purpose: 'INVITATION' });
    });
  });

  it('rejects two links with the same token hash', async () => {
    await testPrisma.accessLink.create({ data: invitation() });

    await expect(testPrisma.accessLink.create({ data: invitation() })).rejects.toThrow();
  });

  describe('the foreign keys', () => {
    it.each([
      ['a school that does not exist', () => invitation({ schoolId: MISSING_ID })],
      ['a creator that does not exist', () => invitation({ createdById: MISSING_ID })],
      ['a user that does not exist', () => passwordReset({ userId: MISSING_ID })],
    ])('reject %s', async (_name, build) => {
      await expect(testPrisma.accessLink.create({ data: build() as never })).rejects.toThrow();
    });

    it('does not delete the links when their creator is deleted: there is no cascade', async () => {
      await testPrisma.accessLink.create({ data: invitation() });

      await expect(testPrisma.user.delete({ where: { id: ADMIN_ID } })).rejects.toThrow();
    });
  });

  it('has the columns of the model, in snake_case, and no column for the token itself', async () => {
    const columns = await testPrisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'access_links' ORDER BY column_name`,
      testSchema,
    );

    expect(columns.map((column) => column.column_name)).toEqual([
      'created_at',
      'created_by_id',
      'expires_at',
      'id',
      'purpose',
      'revoked_at',
      'role',
      'school_id',
      'token_hash',
      'used_at',
      'user_id',
    ]);
  });
});
