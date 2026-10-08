import { describe, expect, it, vi } from 'vitest';
import type { School } from '../../domain/school/school.js';
import type { User } from '../../domain/user/user.js';
import type { PrismaClient } from './createPrismaClient.js';
import { PrismaRegistrationRepository } from './prismaRegistrationRepository.js';

const school: School = {
  id: 's',
  name: 'Colegio',
  normalizedName: 'colegio',
  municipalityCode: '46250',
};
const admin: User = {
  id: 'u',
  schoolId: 's',
  email: 'a@example.com',
  passwordHash: 'hash',
  firstName: 'A',
  lastName: 'B',
  role: 'ADMIN',
  status: 'ACTIVE',
};

/** Cliente cuyo alta falla con el error indicado, para probar cómo se interpretan los fallos. */
function repositoryFailingWith(failure: unknown) {
  const prisma = {
    school: { create: vi.fn() },
    user: { create: vi.fn() },
    $transaction: vi.fn().mockRejectedValue(failure),
  } as unknown as PrismaClient;
  return new PrismaRegistrationRepository(prisma);
}

describe('PrismaRegistrationRepository error interpretation', () => {
  it.each([
    ['a uniqueness violation without the violated index', { code: 'P2002' }],
    [
      'a uniqueness violation of another index',
      {
        code: 'P2002',
        meta: { driverAdapterError: { cause: { constraint: { index: 'users_pkey' } } } },
      },
    ],
    [
      'a uniqueness violation with a malformed index',
      {
        code: 'P2002',
        meta: { driverAdapterError: { cause: { constraint: { index: 42 } } } },
      },
    ],
    ['another Prisma error', { code: 'P2025' }],
    ['a plain error', new Error('fallo')],
    ['a value that is not an object', 'texto'],
  ])('rethrows %s unchanged', async (_name, failure) => {
    const repository = repositoryFailingWith(failure);

    await expect(repository.createSchoolWithAdmin(school, admin)).rejects.toBe(failure);
  });
});
