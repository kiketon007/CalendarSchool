import { describe, expect, it, vi } from 'vitest';
import type { SchoolUser } from '../../domain/user/schoolUser.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListSchoolUsers } from './listSchoolUsers.js';

const SCHOOL_ID = 'school-1';
const NOW = new Date('2026-10-17T10:00:00Z');
const now = () => NOW;
const USERS: SchoolUser[] = [
  {
    id: 'user-1',
    firstName: 'José María',
    lastName: 'García-López',
    email: 'jose.garcia@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    passwordResetPending: true,
    createdAt: new Date('2026-10-07T09:30:00Z'),
  },
  {
    id: 'user-2',
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana.perez@example.com',
    role: 'MEMBER',
    status: 'SUSPENDED',
    passwordResetPending: false,
    createdAt: new Date('2026-10-08T09:30:00Z'),
  },
];

describe('ListSchoolUsers', () => {
  it('returns the users of the school it is given', async () => {
    const listBySchool = vi.fn<(schoolId: string, now: Date) => Promise<SchoolUser[]>>();
    listBySchool.mockResolvedValue(USERS);

    const users = await new ListSchoolUsers({
      schoolUserRepository: { listBySchool },
      now,
    }).execute({ schoolId: SCHOOL_ID });

    expect(users).toEqual(USERS);
    expect(listBySchool).toHaveBeenCalledExactlyOnceWith(SCHOOL_ID, NOW);
  });

  it('returns an empty list when the school has no users', async () => {
    const listBySchool = vi.fn<(schoolId: string, now: Date) => Promise<SchoolUser[]>>();
    listBySchool.mockResolvedValue([]);

    await expect(
      new ListSchoolUsers({ schoolUserRepository: { listBySchool }, now }).execute({
        schoolId: SCHOOL_ID,
      }),
    ).resolves.toEqual([]);
  });

  it('propagates DatabaseUnavailable', async () => {
    const listBySchool = vi.fn<(schoolId: string, now: Date) => Promise<SchoolUser[]>>();
    listBySchool.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(
      new ListSchoolUsers({ schoolUserRepository: { listBySchool }, now }).execute({
        schoolId: SCHOOL_ID,
      }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
