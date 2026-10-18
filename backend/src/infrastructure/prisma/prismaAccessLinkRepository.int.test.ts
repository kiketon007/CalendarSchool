import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaAccessLinkRepository } from './prismaAccessLinkRepository.js';

const repository = new PrismaAccessLinkRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const ADMIN_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const SUSPENDED_ADMIN_ID = '0192f5a0-0000-7000-8000-0000000000a2';
const MEMBER_ID = '0192f5a0-0000-7000-8000-0000000000a3';
const OTHER_ADMIN_ID = '0192f5a0-0000-7000-8000-0000000000a4';
const MISSING_ID = '0192f5a0-0000-7000-8000-0000000000ff';

const NOW = new Date('2026-10-17T10:00:00Z');
const IN_ONE_DAY = new Date('2026-10-18T10:00:00Z');

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(1000 + ++sequence).padStart(12, '0')}`;
const nextHash = () => String(sequence + 1000).padStart(64, '0');

/** Inserta un enlace tal cual, con los valores por defecto de una invitación pendiente. */
async function insertLink(overrides: Record<string, unknown> = {}) {
  const id = nextId();
  await testPrisma.accessLink.create({
    data: {
      id,
      schoolId: SCHOOL_ID,
      purpose: 'INVITATION',
      tokenHash: nextHash(),
      role: 'MEMBER',
      createdById: ADMIN_ID,
      expiresAt: IN_ONE_DAY,
      ...overrides,
    } as never,
  });
  return id;
}

async function stored(id: string) {
  return testPrisma.accessLink.findUniqueOrThrow({ where: { id } });
}

async function createUser(
  id: string,
  schoolId: string,
  overrides: {
    firstName?: string;
    lastName?: string;
    role?: 'ADMIN' | 'MEMBER';
    status?: 'ACTIVE' | 'SUSPENDED';
  } = {},
) {
  await testPrisma.user.create({
    data: {
      id,
      schoolId,
      email: `${id}@example.com`,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: overrides.firstName ?? 'Nombre',
      lastName: overrides.lastName ?? 'Apellido',
      role: overrides.role ?? 'ADMIN',
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

describe('PrismaAccessLinkRepository', () => {
  beforeEach(async () => {
    sequence = 0;
    for (const [id, name] of [
      [SCHOOL_ID, 'ceipuno'],
      [OTHER_SCHOOL_ID, 'ceipdos'],
    ] as const) {
      await testPrisma.school.create({
        data: { id, name, normalizedName: name, municipalityCode: '46250' },
      });
    }
    await createUser(ADMIN_ID, SCHOOL_ID, { firstName: 'José María', lastName: 'García-López' });
    await createUser(SUSPENDED_ADMIN_ID, SCHOOL_ID, {
      firstName: 'Ana',
      lastName: 'Pérez',
      status: 'SUSPENDED',
    });
    await createUser(MEMBER_ID, SCHOOL_ID, { role: 'MEMBER' });
    await createUser(OTHER_ADMIN_ID, OTHER_SCHOOL_ID);
  });

  describe('createInvitation', () => {
    it('stores the invitation as given and returns it as the list shows it', async () => {
      const id = nextId();

      const invitation = await repository.createInvitation({
        id,
        schoolId: SCHOOL_ID,
        tokenHash: 'f'.repeat(64),
        role: 'ADMIN',
        createdById: ADMIN_ID,
        expiresAt: IN_ONE_DAY,
      });

      expect(invitation).toEqual({
        id,
        role: 'ADMIN',
        createdBy: { id: ADMIN_ID, firstName: 'José María', lastName: 'García-López' },
        createdAt: expect.any(Date) as Date,
        expiresAt: IN_ONE_DAY,
      });
      expect(await stored(id)).toMatchObject({
        schoolId: SCHOOL_ID,
        purpose: 'INVITATION',
        tokenHash: 'f'.repeat(64),
        role: 'ADMIN',
        userId: null,
        createdById: ADMIN_ID,
        usedAt: null,
        revokedAt: null,
      });
    });
  });

  describe('listPendingInvitations', () => {
    it('returns only the pending invitations of the school, from the newest to the oldest', async () => {
      const oldest = await insertLink({ createdAt: new Date('2026-10-15T10:00:00Z') });
      const newest = await insertLink({ createdAt: new Date('2026-10-17T09:00:00Z') });
      const middle = await insertLink({ createdAt: new Date('2026-10-16T10:00:00Z') });
      await insertLink({ revokedAt: new Date('2026-10-16T10:00:00Z') });
      await insertLink({ usedAt: new Date('2026-10-16T10:00:00Z') });
      await insertLink({ expiresAt: new Date('2026-10-17T09:59:59Z') });
      await insertLink({ schoolId: OTHER_SCHOOL_ID, createdById: OTHER_ADMIN_ID });
      await insertLink({
        purpose: 'PASSWORD_RESET',
        role: null,
        userId: MEMBER_ID,
      });

      const invitations = await repository.listPendingInvitations(SCHOOL_ID, NOW);

      expect(invitations.map((invitation) => invitation.id)).toEqual([newest, middle, oldest]);
    });

    it('leaves out an invitation that expires exactly at the given instant', async () => {
      await insertLink({ expiresAt: NOW });
      const later = await insertLink({ expiresAt: new Date(NOW.getTime() + 1) });

      const invitations = await repository.listPendingInvitations(SCHOOL_ID, NOW);

      expect(invitations.map((invitation) => invitation.id)).toEqual([later]);
    });

    it('returns exactly the fields of the list, never the token hash', async () => {
      const id = await insertLink({
        role: 'ADMIN',
        createdAt: new Date('2026-10-17T09:00:00Z'),
        tokenHash: 'a'.repeat(64),
      });

      const [invitation] = await repository.listPendingInvitations(SCHOOL_ID, NOW);

      expect(invitation).toEqual({
        id,
        role: 'ADMIN',
        createdBy: { id: ADMIN_ID, firstName: 'José María', lastName: 'García-López' },
        createdAt: new Date('2026-10-17T09:00:00Z'),
        expiresAt: IN_ONE_DAY,
      });
      expect(JSON.stringify(invitation)).not.toContain('a'.repeat(64));
    });

    it('keeps the invitations of an administrator that has been suspended, with the name', async () => {
      const id = await insertLink({ createdById: SUSPENDED_ADMIN_ID });

      const invitations = await repository.listPendingInvitations(SCHOOL_ID, NOW);

      expect(invitations).toEqual([
        expect.objectContaining({
          id,
          createdBy: { id: SUSPENDED_ADMIN_ID, firstName: 'Ana', lastName: 'Pérez' },
        }),
      ]);
    });

    it('returns an empty list for a school without invitations', async () => {
      await expect(repository.listPendingInvitations(SCHOOL_ID, NOW)).resolves.toEqual([]);
    });
  });

  describe('revokeInvitation', () => {
    it('revokes a pending invitation with the given instant', async () => {
      const id = await insertLink();

      await expect(repository.revokeInvitation(SCHOOL_ID, id, NOW)).resolves.toBe('revoked');

      expect((await stored(id)).revokedAt).toEqual(NOW);
      await expect(repository.listPendingInvitations(SCHOOL_ID, NOW)).resolves.toEqual([]);
    });

    it('answers notPending, and keeps the first instant, for an invitation already revoked', async () => {
      const firstRevocation = new Date('2026-10-17T08:00:00Z');
      const id = await insertLink({ revokedAt: firstRevocation });

      await expect(repository.revokeInvitation(SCHOOL_ID, id, NOW)).resolves.toBe('notPending');

      expect((await stored(id)).revokedAt).toEqual(firstRevocation);
    });

    it.each([
      ['used', { usedAt: new Date('2026-10-17T08:00:00Z') }],
      ['expired', { expiresAt: new Date('2026-10-17T09:00:00Z') }],
      ['expired exactly now', { expiresAt: NOW }],
    ])(
      'answers notPending and changes nothing for an invitation that is %s',
      async (_name, state) => {
        const id = await insertLink(state);

        await expect(repository.revokeInvitation(SCHOOL_ID, id, NOW)).resolves.toBe('notPending');

        expect((await stored(id)).revokedAt).toBeNull();
      },
    );

    it('answers null for an invitation of another school and changes nothing', async () => {
      const id = await insertLink({ schoolId: OTHER_SCHOOL_ID, createdById: OTHER_ADMIN_ID });

      await expect(repository.revokeInvitation(SCHOOL_ID, id, NOW)).resolves.toBeNull();

      expect((await stored(id)).revokedAt).toBeNull();
    });

    it('answers null for an id that does not exist', async () => {
      await expect(repository.revokeInvitation(SCHOOL_ID, MISSING_ID, NOW)).resolves.toBeNull();
    });

    it('answers null for a password reset and changes nothing', async () => {
      const id = await insertLink({ purpose: 'PASSWORD_RESET', role: null, userId: MEMBER_ID });

      await expect(repository.revokeInvitation(SCHOOL_ID, id, NOW)).resolves.toBeNull();

      expect((await stored(id)).revokedAt).toBeNull();
    });

    it('lets one of two simultaneous revocations win and keeps a single revocation instant', async () => {
      const id = await insertLink();
      const first = new Date('2026-10-17T10:00:01Z');
      const second = new Date('2026-10-17T10:00:02Z');

      const results = await Promise.all([
        repository.revokeInvitation(SCHOOL_ID, id, first),
        repository.revokeInvitation(SCHOOL_ID, id, second),
      ]);

      expect([...results].sort()).toEqual(['notPending', 'revoked']);
      const winner = results[0] === 'revoked' ? first : second;
      expect((await stored(id)).revokedAt).toEqual(winner);
    });
  });
});

describe('PrismaAccessLinkRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    return createPrismaClient({ connectionString: wrongCredentials.toString() });
  }

  it.each([
    [
      'createInvitation',
      (repo: PrismaAccessLinkRepository) =>
        repo.createInvitation({
          id: MISSING_ID,
          schoolId: SCHOOL_ID,
          tokenHash: 'e'.repeat(64),
          role: 'MEMBER',
          createdById: ADMIN_ID,
          expiresAt: IN_ONE_DAY,
        }),
    ],
    [
      'listPendingInvitations',
      (repo: PrismaAccessLinkRepository) => repo.listPendingInvitations(SCHOOL_ID, NOW),
    ],
    [
      'revokeInvitation',
      (repo: PrismaAccessLinkRepository) => repo.revokeInvitation(SCHOOL_ID, MISSING_ID, NOW),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, call) => {
    const prisma = unreachable();

    await expect(call(new PrismaAccessLinkRepository(prisma))).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    await prisma.$disconnect();
  });
});
