import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { PasswordResetAlreadyPending } from '../../domain/accessLink/accessLinkErrors.js';
import { EmailAlreadyRegistered } from '../../domain/registration/registrationErrors.js';
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
    status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
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
  describe('findPendingInvitation', () => {
    const HASH = 'a1'.repeat(32);

    it('returns the school name and the role of a pending invitation, without writing anything', async () => {
      const id = await insertLink({ tokenHash: HASH, role: 'ADMIN' });

      const preview = await repository.findPendingInvitation(HASH, NOW);

      expect(preview).toEqual({ schoolName: 'ceipuno', role: 'ADMIN' });
      expect(await stored(id)).toMatchObject({ usedAt: null, revokedAt: null });
    });

    it('returns null for an invitation that is expired at the exact instant, used or revoked', async () => {
      await insertLink({ tokenHash: 'b1'.repeat(32), expiresAt: NOW });
      await insertLink({ tokenHash: 'b2'.repeat(32), usedAt: NOW });
      await insertLink({ tokenHash: 'b3'.repeat(32), revokedAt: NOW });

      expect(await repository.findPendingInvitation('b1'.repeat(32), NOW)).toBeNull();
      expect(await repository.findPendingInvitation('b2'.repeat(32), NOW)).toBeNull();
      expect(await repository.findPendingInvitation('b3'.repeat(32), NOW)).toBeNull();
    });

    it('returns null for an unknown hash and for a password reset', async () => {
      await insertLink({
        tokenHash: 'c1'.repeat(32),
        purpose: 'PASSWORD_RESET',
        role: null,
        userId: MEMBER_ID,
      });

      expect(await repository.findPendingInvitation('d1'.repeat(32), NOW)).toBeNull();
      expect(await repository.findPendingInvitation('c1'.repeat(32), NOW)).toBeNull();
    });
  });

  describe('acceptInvitation', () => {
    const HASH = 'e1'.repeat(32);

    function newUser(email = 'ana@example.com') {
      return {
        id: nextId(),
        firstName: 'Ana',
        lastName: 'Pérez-Gil',
        email,
        passwordHash: '$2b$12$'.padEnd(60, 'y'),
        privacyPolicyAcceptedAt: NOW,
        privacyPolicyVersion: '2026-10-14',
      };
    }

    const usersWithEmail = (email: string) => testPrisma.user.count({ where: { email } });

    it('marks the invitation as used and creates the active user in its school with its role', async () => {
      const id = await insertLink({ tokenHash: HASH, role: 'MEMBER' });
      const user = newUser();

      const accepted = await repository.acceptInvitation({
        tokenHash: HASH,
        now: NOW,
        newUser: user,
      });

      expect(accepted).toEqual({
        invitationId: id,
        user: {
          id: user.id,
          firstName: 'Ana',
          lastName: 'Pérez-Gil',
          email: 'ana@example.com',
          role: 'MEMBER',
        },
        school: { id: SCHOOL_ID, name: 'ceipuno' },
      });
      expect((await stored(id)).usedAt).toEqual(NOW);
      expect(await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        schoolId: SCHOOL_ID,
        role: 'MEMBER',
        status: 'ACTIVE',
        passwordHash: user.passwordHash,
        privacyPolicyAcceptedAt: NOW,
        privacyPolicyVersion: '2026-10-14',
      });
    });

    it('creates an administrator when the invitation is for an administrator', async () => {
      await insertLink({ tokenHash: HASH, role: 'ADMIN' });

      const accepted = await repository.acceptInvitation({
        tokenHash: HASH,
        now: NOW,
        newUser: newUser(),
      });

      expect(accepted?.user.role).toBe('ADMIN');
    });

    it('accepts the invitation of an administrator that has been suspended', async () => {
      await insertLink({ tokenHash: HASH, createdById: SUSPENDED_ADMIN_ID });

      const accepted = await repository.acceptInvitation({
        tokenHash: HASH,
        now: NOW,
        newUser: newUser(),
      });

      expect(accepted).not.toBeNull();
    });

    it.each([
      ['expired at the exact instant', { expiresAt: NOW }],
      ['used', { usedAt: NOW }],
      ['revoked', { revokedAt: NOW }],
      ['a password reset', { purpose: 'PASSWORD_RESET', role: null, userId: MEMBER_ID }],
    ])('returns null and creates nobody when the link is %s', async (_name, overrides) => {
      await insertLink({ tokenHash: HASH, ...overrides });

      const accepted = await repository.acceptInvitation({
        tokenHash: HASH,
        now: NOW,
        newUser: newUser(),
      });

      expect(accepted).toBeNull();
      expect(await usersWithEmail('ana@example.com')).toBe(0);
    });

    it('returns null for an unknown hash', async () => {
      const accepted = await repository.acceptInvitation({
        tokenHash: 'f2'.repeat(32),
        now: NOW,
        newUser: newUser(),
      });

      expect(accepted).toBeNull();
    });

    it('throws EmailAlreadyRegistered and leaves the invitation pending when the email exists', async () => {
      const id = await insertLink({ tokenHash: HASH });

      await expect(
        repository.acceptInvitation({
          tokenHash: HASH,
          now: NOW,
          newUser: newUser(`${OTHER_ADMIN_ID}@example.com`),
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegistered);

      expect(await stored(id)).toMatchObject({ usedAt: null, revokedAt: null });
    });

    it('creates a single user when two acceptances arrive at the same time', async () => {
      const id = await insertLink({ tokenHash: HASH });

      const results = await Promise.allSettled([
        repository.acceptInvitation({
          tokenHash: HASH,
          now: NOW,
          newUser: newUser('uno@example.com'),
        }),
        repository.acceptInvitation({
          tokenHash: HASH,
          now: NOW,
          newUser: newUser('dos@example.com'),
        }),
      ]);

      const accepted = results.filter((r) => r.status === 'fulfilled' && r.value !== null);
      const rejectedLink = results.filter((r) => r.status === 'fulfilled' && r.value === null);
      expect(accepted).toHaveLength(1);
      expect(rejectedLink).toHaveLength(1);
      expect(
        (await usersWithEmail('uno@example.com')) + (await usersWithEmail('dos@example.com')),
      ).toBe(1);
      expect((await stored(id)).usedAt).toEqual(NOW);
    });
  });

  describe('password resets', () => {
    const IN_THREE_DAYS = new Date('2026-10-20T10:00:00Z');
    const HASH = 'a7'.repeat(32);

    /** Inserta un restablecimiento tal cual, pendiente por defecto, para el usuario indicado. */
    const insertReset = (userId: string, overrides: Record<string, unknown> = {}) =>
      insertLink({ purpose: 'PASSWORD_RESET', role: null, userId, ...overrides });

    const resetsOf = (userId: string) =>
      testPrisma.accessLink.findMany({ where: { userId, purpose: 'PASSWORD_RESET' } });

    const openResetsOf = async (userId: string) =>
      (await resetsOf(userId)).filter((link) => link.usedAt === null && link.revokedAt === null);

    function newReset(userId = MEMBER_ID, overrides: Record<string, unknown> = {}) {
      return {
        id: nextId(),
        schoolId: SCHOOL_ID,
        userId,
        createdById: ADMIN_ID,
        tokenHash: nextHash(),
        expiresAt: IN_THREE_DAYS,
        now: NOW,
        ...overrides,
      };
    }

    describe('createPasswordReset', () => {
      it('stores the reset for the user, created by the administrator, and answers created', async () => {
        const reset = newReset(MEMBER_ID, { tokenHash: HASH });

        const result = await repository.createPasswordReset(reset);

        expect(result).toEqual({
          outcome: 'created',
          createdAt: expect.any(Date) as Date,
          replaced: 0,
        });
        expect(await stored(reset.id)).toMatchObject({
          schoolId: SCHOOL_ID,
          purpose: 'PASSWORD_RESET',
          tokenHash: HASH,
          role: null,
          userId: MEMBER_ID,
          createdById: ADMIN_ID,
          expiresAt: IN_THREE_DAYS,
          usedAt: null,
          revokedAt: null,
        });
      });

      it('lets an administrator reset their own password', async () => {
        const result = await repository.createPasswordReset(newReset(ADMIN_ID));

        expect(result).toMatchObject({ outcome: 'created' });
      });

      it('answers notFound and creates nothing for a user of another school, a missing one or a deleted one', async () => {
        const deletedId = '0192f5a0-0000-7000-8000-0000000000a5';
        await createUser(deletedId, SCHOOL_ID, { status: 'DELETED' });

        for (const userId of [OTHER_ADMIN_ID, MISSING_ID, deletedId]) {
          await expect(repository.createPasswordReset(newReset(userId))).resolves.toEqual({
            outcome: 'notFound',
          });
        }

        expect(await testPrisma.accessLink.count()).toBe(0);
      });

      it('answers notActive and creates nothing for a suspended user', async () => {
        await expect(repository.createPasswordReset(newReset(SUSPENDED_ADMIN_ID))).resolves.toEqual(
          { outcome: 'notActive' },
        );

        expect(await testPrisma.accessLink.count()).toBe(0);
      });

      it('revokes the previous pending reset of the user and says it replaced one', async () => {
        const previous = await insertReset(MEMBER_ID);

        const result = await repository.createPasswordReset(newReset(MEMBER_ID));

        expect(result).toMatchObject({ outcome: 'created', replaced: 1 });
        expect((await stored(previous)).revokedAt).toEqual(NOW);
        expect(await openResetsOf(MEMBER_ID)).toHaveLength(1);
      });

      it('also revokes an expired reset that was never revoked, which still occupies the unique index', async () => {
        const expired = await insertReset(MEMBER_ID, {
          expiresAt: new Date('2026-10-17T09:00:00Z'),
        });

        const result = await repository.createPasswordReset(newReset(MEMBER_ID));

        expect(result).toMatchObject({ outcome: 'created', replaced: 1 });
        expect((await stored(expired)).revokedAt).toEqual(NOW);
      });

      it('leaves used and revoked resets, the resets of other users and invitations untouched', async () => {
        const used = await insertReset(MEMBER_ID, { usedAt: new Date('2026-10-16T10:00:00Z') });
        const revoked = await insertReset(MEMBER_ID, {
          revokedAt: new Date('2026-10-16T11:00:00Z'),
        });
        const ofAnother = await insertReset(ADMIN_ID);
        const invitation = await insertLink();

        const result = await repository.createPasswordReset(newReset(MEMBER_ID));

        expect(result).toMatchObject({ outcome: 'created', replaced: 0 });
        expect((await stored(used)).revokedAt).toBeNull();
        expect((await stored(revoked)).revokedAt).toEqual(new Date('2026-10-16T11:00:00Z'));
        expect((await stored(ofAnother)).revokedAt).toBeNull();
        expect((await stored(invitation)).revokedAt).toBeNull();
      });

      it('throws PasswordResetAlreadyPending when another generation takes the index in between', async () => {
        let attempt!: Promise<unknown>;

        await testPrisma.$transaction(async (tx) => {
          await tx.accessLink.create({
            data: {
              id: nextId(),
              schoolId: SCHOOL_ID,
              purpose: 'PASSWORD_RESET',
              tokenHash: nextHash(),
              userId: MEMBER_ID,
              createdById: ADMIN_ID,
              expiresAt: IN_THREE_DAYS,
            },
          });
          // La segunda generación no ve el restablecimiento sin confirmar: no lo revoca y su
          // inserción espera el índice único hasta que esta transacción termina.
          attempt = repository
            .createPasswordReset(newReset(MEMBER_ID))
            .catch((error: unknown) => error);
          await new Promise((resolve) => setTimeout(resolve, 300));
        });

        expect(await attempt).toBeInstanceOf(PasswordResetAlreadyPending);
        expect(await openResetsOf(MEMBER_ID)).toHaveLength(1);
      });
    });

    describe('revokePasswordReset', () => {
      it('revokes the pending reset of the user with the given instant', async () => {
        const id = await insertReset(MEMBER_ID);

        await expect(repository.revokePasswordReset(SCHOOL_ID, MEMBER_ID, NOW)).resolves.toBe(
          'revoked',
        );

        expect((await stored(id)).revokedAt).toEqual(NOW);
      });

      it('answers none and changes nothing when the user has no pending reset', async () => {
        const revoked = await insertReset(MEMBER_ID, {
          revokedAt: new Date('2026-10-16T10:00:00Z'),
        });
        const used = await insertReset(MEMBER_ID, { usedAt: new Date('2026-10-16T10:00:00Z') });
        const expired = await insertReset(ADMIN_ID, { expiresAt: NOW });

        await expect(repository.revokePasswordReset(SCHOOL_ID, MEMBER_ID, NOW)).resolves.toBe(
          'none',
        );
        await expect(repository.revokePasswordReset(SCHOOL_ID, ADMIN_ID, NOW)).resolves.toBe(
          'none',
        );

        expect((await stored(revoked)).revokedAt).toEqual(new Date('2026-10-16T10:00:00Z'));
        expect((await stored(used)).revokedAt).toBeNull();
        expect((await stored(expired)).revokedAt).toBeNull();
      });

      it('answers notFound for a user of another school or a missing one, and changes nothing', async () => {
        const id = await insertReset(OTHER_ADMIN_ID, { schoolId: OTHER_SCHOOL_ID });

        await expect(repository.revokePasswordReset(SCHOOL_ID, OTHER_ADMIN_ID, NOW)).resolves.toBe(
          'notFound',
        );
        await expect(repository.revokePasswordReset(SCHOOL_ID, MISSING_ID, NOW)).resolves.toBe(
          'notFound',
        );

        expect((await stored(id)).revokedAt).toBeNull();
      });

      it('does not touch the invitations of the school', async () => {
        const invitation = await insertLink();

        await expect(repository.revokePasswordReset(SCHOOL_ID, MEMBER_ID, NOW)).resolves.toBe(
          'none',
        );

        expect((await stored(invitation)).revokedAt).toBeNull();
      });
    });

    describe('findPendingPasswordReset', () => {
      it('returns the school name and the email of a pending reset of an active user, without writing', async () => {
        const id = await insertReset(MEMBER_ID, { tokenHash: HASH });

        const preview = await repository.findPendingPasswordReset(HASH, NOW);

        expect(preview).toEqual({ schoolName: 'ceipuno', email: `${MEMBER_ID}@example.com` });
        expect(await stored(id)).toMatchObject({ usedAt: null, revokedAt: null });
      });

      it('returns null for a reset that is expired at the exact instant, used or revoked', async () => {
        await insertReset(MEMBER_ID, { tokenHash: 'b1'.repeat(32), expiresAt: NOW });
        await insertReset(MEMBER_ID, { tokenHash: 'b2'.repeat(32), usedAt: NOW });
        await insertReset(MEMBER_ID, { tokenHash: 'b3'.repeat(32), revokedAt: NOW });

        for (const hash of ['b1', 'b2', 'b3']) {
          expect(await repository.findPendingPasswordReset(hash.repeat(32), NOW)).toBeNull();
        }
      });

      it('returns null for an unknown hash and for an invitation', async () => {
        await insertLink({ tokenHash: 'c1'.repeat(32) });

        expect(await repository.findPendingPasswordReset('d1'.repeat(32), NOW)).toBeNull();
        expect(await repository.findPendingPasswordReset('c1'.repeat(32), NOW)).toBeNull();
      });

      it('returns null when the user of the reset is suspended', async () => {
        await insertReset(SUSPENDED_ADMIN_ID, { tokenHash: HASH });

        expect(await repository.findPendingPasswordReset(HASH, NOW)).toBeNull();
      });
    });

    describe('resetPassword', () => {
      const NEW_HASH = '$2b$12$'.padEnd(60, 'n');
      let tokenCount = 0;

      /** Abre una sesión (refresh token) del usuario y devuelve su id. */
      async function openSession(userId: string, overrides: Record<string, unknown> = {}) {
        const id = nextId();
        await testPrisma.refreshToken.create({
          data: {
            id,
            userId,
            tokenHash: String(++tokenCount).padStart(64, '9'),
            expiresAt: IN_THREE_DAYS,
            ...overrides,
          },
        });
        return id;
      }

      const passwordOf = async (userId: string) =>
        (await testPrisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash;

      const revokedAtOf = async (id: string) =>
        (await testPrisma.refreshToken.findUniqueOrThrow({ where: { id } })).revokedAt;

      it('marks the reset as used, changes the password and revokes every open session of the user', async () => {
        const id = await insertReset(MEMBER_ID, { tokenHash: HASH });
        const first = await openSession(MEMBER_ID);
        const second = await openSession(MEMBER_ID);
        const alreadyRevoked = await openSession(MEMBER_ID, {
          revokedAt: new Date('2026-10-16T10:00:00Z'),
        });
        const ofAnother = await openSession(ADMIN_ID);

        const result = await repository.resetPassword({
          tokenHash: HASH,
          now: NOW,
          passwordHash: NEW_HASH,
        });

        expect(result).toEqual({ userId: MEMBER_ID, schoolId: SCHOOL_ID, revokedSessions: 2 });
        expect((await stored(id)).usedAt).toEqual(NOW);
        expect(await passwordOf(MEMBER_ID)).toBe(NEW_HASH);
        expect(await revokedAtOf(first)).toEqual(NOW);
        expect(await revokedAtOf(second)).toEqual(NOW);
        expect(await revokedAtOf(alreadyRevoked)).toEqual(new Date('2026-10-16T10:00:00Z'));
        expect(await revokedAtOf(ofAnother)).toBeNull();
      });

      it('answers revokedSessions 0 when the user has no open session', async () => {
        await insertReset(MEMBER_ID, { tokenHash: HASH });

        const result = await repository.resetPassword({
          tokenHash: HASH,
          now: NOW,
          passwordHash: NEW_HASH,
        });

        expect(result).toMatchObject({ revokedSessions: 0 });
      });

      it.each([
        ['expired at the exact instant', { expiresAt: NOW }],
        ['used', { usedAt: NOW }],
        ['revoked', { revokedAt: NOW }],
        ['an invitation', { purpose: 'INVITATION', role: 'MEMBER', userId: null }],
      ])('returns null and changes nothing when the link is %s', async (_name, overrides) => {
        await insertReset(MEMBER_ID, { tokenHash: HASH, ...overrides });
        const session = await openSession(MEMBER_ID);
        const before = await passwordOf(MEMBER_ID);

        const result = await repository.resetPassword({
          tokenHash: HASH,
          now: NOW,
          passwordHash: NEW_HASH,
        });

        expect(result).toBeNull();
        expect(await passwordOf(MEMBER_ID)).toBe(before);
        expect(await revokedAtOf(session)).toBeNull();
      });

      it('returns null for an unknown hash', async () => {
        await expect(
          repository.resetPassword({
            tokenHash: 'f2'.repeat(32),
            now: NOW,
            passwordHash: NEW_HASH,
          }),
        ).resolves.toBeNull();
      });

      it('returns null, leaves the link unused and changes nothing when the user is no longer active', async () => {
        const id = await insertReset(SUSPENDED_ADMIN_ID, { tokenHash: HASH });
        const before = await passwordOf(SUSPENDED_ADMIN_ID);

        const result = await repository.resetPassword({
          tokenHash: HASH,
          now: NOW,
          passwordHash: NEW_HASH,
        });

        expect(result).toBeNull();
        expect((await stored(id)).usedAt).toBeNull();
        expect(await passwordOf(SUSPENDED_ADMIN_ID)).toBe(before);
      });

      it('lets one of two simultaneous confirmations win', async () => {
        await insertReset(MEMBER_ID, { tokenHash: HASH });
        await openSession(MEMBER_ID);

        const results = await Promise.all([
          repository.resetPassword({
            tokenHash: HASH,
            now: NOW,
            passwordHash: 'uno'.padEnd(60, 'u'),
          }),
          repository.resetPassword({
            tokenHash: HASH,
            now: NOW,
            passwordHash: 'dos'.padEnd(60, 'd'),
          }),
        ]);

        const winners = results.filter((result) => result !== null);
        expect(winners).toHaveLength(1);
        expect(winners[0]).toMatchObject({ revokedSessions: 1 });
        expect(['uno'.padEnd(60, 'u'), 'dos'.padEnd(60, 'd')]).toContain(
          await passwordOf(MEMBER_ID),
        );
      });
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
    [
      'findPendingInvitation',
      (repo: PrismaAccessLinkRepository) => repo.findPendingInvitation('a'.repeat(64), NOW),
    ],
    [
      'acceptInvitation',
      (repo: PrismaAccessLinkRepository) =>
        repo.acceptInvitation({
          tokenHash: 'a'.repeat(64),
          now: NOW,
          newUser: {
            id: MISSING_ID,
            firstName: 'Ana',
            lastName: 'Pérez',
            email: 'ana@example.com',
            passwordHash: '$2b$12$'.padEnd(60, 'y'),
            privacyPolicyAcceptedAt: NOW,
            privacyPolicyVersion: '2026-10-14',
          },
        }),
    ],
    [
      'createPasswordReset',
      (repo: PrismaAccessLinkRepository) =>
        repo.createPasswordReset({
          id: MISSING_ID,
          schoolId: SCHOOL_ID,
          userId: MEMBER_ID,
          createdById: ADMIN_ID,
          tokenHash: 'e'.repeat(64),
          expiresAt: IN_ONE_DAY,
          now: NOW,
        }),
    ],
    [
      'revokePasswordReset',
      (repo: PrismaAccessLinkRepository) => repo.revokePasswordReset(SCHOOL_ID, MEMBER_ID, NOW),
    ],
    [
      'findPendingPasswordReset',
      (repo: PrismaAccessLinkRepository) => repo.findPendingPasswordReset('a'.repeat(64), NOW),
    ],
    [
      'resetPassword',
      (repo: PrismaAccessLinkRepository) =>
        repo.resetPassword({
          tokenHash: 'a'.repeat(64),
          now: NOW,
          passwordHash: '$2b$12$'.padEnd(60, 'y'),
        }),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, call) => {
    const prisma = unreachable();

    await expect(call(new PrismaAccessLinkRepository(prisma))).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    await prisma.$disconnect();
  });
});
