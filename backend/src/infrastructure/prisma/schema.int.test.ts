import { describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const VALENCIA_CODE = '46250';
const ALICANTE_CODE = '03014';

// Los municipios son datos fijos cargados por la migración: resetDatabase() los conserva.

function newSchool(id: string, overrides: Partial<{ normalizedName: string; code: string }> = {}) {
  return {
    id,
    name: 'CEIP Lluís Vives',
    normalizedName: overrides.normalizedName ?? 'ceiplluisvives',
    municipalityCode: overrides.code ?? VALENCIA_CODE,
  };
}

function newUser(id: string, schoolId: string, email = 'jose@example.com') {
  return {
    id,
    schoolId,
    email,
    passwordHash: '$2b$12$'.padEnd(60, 'x'),
    firstName: 'José',
    lastName: 'García',
    role: 'ADMIN' as const,
  };
}

const SCHOOL_A = '0192f5a0-0000-7000-8000-000000000001';
const SCHOOL_B = '0192f5a0-0000-7000-8000-000000000002';
const USER_A = '0192f5a0-0000-7000-8000-0000000000a1';
const USER_B = '0192f5a0-0000-7000-8000-0000000000a2';

describe('database schema', () => {
  it('stores a school with its administrator and defaults the status to ACTIVE', async () => {
    await testPrisma.school.create({ data: newSchool(SCHOOL_A) });
    const user = await testPrisma.user.create({ data: newUser(USER_A, SCHOOL_A) });

    expect(user.status).toBe('ACTIVE');
    expect(user.role).toBe('ADMIN');
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a second user with the same email', async () => {
    await testPrisma.school.create({ data: newSchool(SCHOOL_A) });
    await testPrisma.school.create({
      data: newSchool(SCHOOL_B, { normalizedName: 'otrocolegio' }),
    });
    await testPrisma.user.create({ data: newUser(USER_A, SCHOOL_A) });

    await expect(testPrisma.user.create({ data: newUser(USER_B, SCHOOL_B) })).rejects.toMatchObject(
      { code: 'P2002' },
    );
  });

  it('rejects two schools with the same normalized name in the same municipality', async () => {
    await testPrisma.school.create({ data: newSchool(SCHOOL_A) });

    await expect(testPrisma.school.create({ data: newSchool(SCHOOL_B) })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('accepts the same normalized name in different municipalities', async () => {
    await testPrisma.school.create({ data: newSchool(SCHOOL_A) });

    await expect(
      testPrisma.school.create({ data: newSchool(SCHOOL_B, { code: ALICANTE_CODE }) }),
    ).resolves.toMatchObject({ id: SCHOOL_B });
  });

  it('rejects a user whose school does not exist', async () => {
    await expect(testPrisma.user.create({ data: newUser(USER_A, SCHOOL_A) })).rejects.toMatchObject(
      { code: 'P2003' },
    );
  });

  it('rejects a school whose municipality does not exist', async () => {
    await expect(
      testPrisma.school.create({ data: newSchool(SCHOOL_A, { code: '99999' }) }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
