import { PasswordResetAlreadyPending } from '../../domain/accessLink/accessLinkErrors.js';
import type {
  AcceptedInvitation,
  AccessLinkRepository,
  CompletedPasswordReset,
  CreatePasswordResetResult,
  InvitationPreview,
  NewInvitation,
  NewInvitedUser,
  NewPasswordReset,
  PasswordResetPreview,
  PendingInvitation,
  RevokeInvitationResult,
  RevokePasswordResetResult,
} from '../../domain/accessLink/accessLinkRepository.js';
import { EmailAlreadyRegistered } from '../../domain/registration/registrationErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import {
  EMAIL_UNIQUE_INDEX,
  PENDING_RESET_UNIQUE_INDEX,
  violatedUniqueIndex,
} from './uniqueViolation.js';

/** Solo lo que muestra la lista: nunca se lee el hash del token. */
const INVITATION_FIELDS = {
  id: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

interface InvitationRow {
  id: string;
  role: UserRole | null;
  createdAt: Date;
  expiresAt: Date;
  createdBy: { id: string; firstName: string; lastName: string };
}

/** Una invitación siempre tiene rol (lo exige un `CHECK`); el tipo de la columna admite `null` por los restablecimientos. */
function toPendingInvitation(row: InvitationRow): PendingInvitation {
  return { ...row, role: row.role as UserRole };
}

/** Regla de pendiente: ni usado, ni revocado, ni caducado. Es la misma que `accessLinkStatus`. */
function pendingAt(now: Date) {
  return { usedAt: null, revokedAt: null, expiresAt: { gt: now } } as const;
}

/** Guarda y consulta los enlaces de acceso de las invitaciones con Prisma. */
export class PrismaAccessLinkRepository implements AccessLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createInvitation(invitation: NewInvitation): Promise<PendingInvitation> {
    const row = await translateDatabaseErrors(() =>
      this.prisma.accessLink.create({
        data: { ...invitation, purpose: 'INVITATION' },
        select: INVITATION_FIELDS,
      }),
    );
    return toPendingInvitation(row);
  }

  async listPendingInvitations(schoolId: string, now: Date): Promise<PendingInvitation[]> {
    const rows = await translateDatabaseErrors(() =>
      this.prisma.accessLink.findMany({
        where: { schoolId, purpose: 'INVITATION', ...pendingAt(now) },
        select: INVITATION_FIELDS,
        // El id desempata las creadas en el mismo instante, para que el orden sea estable.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    return rows.map(toPendingInvitation);
  }

  async revokeInvitation(
    schoolId: string,
    id: string,
    now: Date,
  ): Promise<RevokeInvitationResult | null> {
    return translateDatabaseErrors(async () => {
      const found = await this.prisma.accessLink.findFirst({
        where: { id, schoolId, purpose: 'INVITATION' },
        select: { id: true },
      });
      if (found === null) {
        return null;
      }
      // El `updateMany` repite la regla de pendiente: es atómico, así que de dos revocaciones
      // simultáneas solo una escribe y la otra conserva el primer instante.
      const { count } = await this.prisma.accessLink.updateMany({
        where: { id, schoolId, purpose: 'INVITATION', ...pendingAt(now) },
        data: { revokedAt: now },
      });
      return count === 1 ? 'revoked' : 'notPending';
    });
  }

  async findPendingInvitation(tokenHash: string, now: Date): Promise<InvitationPreview | null> {
    const row = await translateDatabaseErrors(() =>
      this.prisma.accessLink.findFirst({
        where: { tokenHash, purpose: 'INVITATION', ...pendingAt(now) },
        // Solo lo que ve la persona invitada: ni el id ni el hash.
        select: { role: true, school: { select: { name: true } } },
      }),
    );
    return row === null ? null : { schoolName: row.school.name, role: row.role as UserRole };
  }

  async acceptInvitation(input: {
    tokenHash: string;
    now: Date;
    newUser: NewInvitedUser;
  }): Promise<AcceptedInvitation | null> {
    const { tokenHash, now, newUser } = input;
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(async (tx) => {
          // Primero se marca el enlace: el `updateMany` repite la regla de pendiente y, con dos
          // aceptaciones simultáneas, la segunda espera el bloqueo de la fila y, al volver a evaluar
          // el `where` tras el commit de la primera, no actualiza nada.
          const { count } = await tx.accessLink.updateMany({
            where: { tokenHash, purpose: 'INVITATION', ...pendingAt(now) },
            data: { usedAt: now },
          });
          if (count === 0) {
            return null;
          }
          const link = await tx.accessLink.findUniqueOrThrow({
            where: { tokenHash },
            select: { id: true, role: true, school: { select: { id: true, name: true } } },
          });
          const role = link.role as UserRole;
          // Si el email ya existe, el `create` falla y se deshace también la marca del enlace.
          const user = await tx.user.create({
            data: { ...newUser, schoolId: link.school.id, role, status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          });
          return { invitationId: link.id, user, school: link.school };
        }),
      );
    } catch (error) {
      if (violatedUniqueIndex(error) === EMAIL_UNIQUE_INDEX) {
        throw new EmailAlreadyRegistered();
      }
      throw error;
    }
  }

  async createPasswordReset(reset: NewPasswordReset): Promise<CreatePasswordResetResult> {
    const { id, schoolId, userId, createdById, tokenHash, expiresAt, now } = reset;
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(async (tx): Promise<CreatePasswordResetResult> => {
          const user = await tx.user.findFirst({
            where: { id: userId, schoolId, status: { not: 'DELETED' } },
            select: { status: true },
          });
          if (user === null) {
            return { outcome: 'notFound' };
          }
          if (user.status !== 'ACTIVE') {
            return { outcome: 'notActive' };
          }
          // Se revoca todo lo abierto, caducado o no: el índice único parcial no mira `expires_at`.
          const { count } = await tx.accessLink.updateMany({
            where: { userId, purpose: 'PASSWORD_RESET', usedAt: null, revokedAt: null },
            data: { revokedAt: now },
          });
          const created = await tx.accessLink.create({
            data: {
              id,
              schoolId,
              userId,
              createdById,
              tokenHash,
              expiresAt,
              purpose: 'PASSWORD_RESET',
            },
            select: { createdAt: true },
          });
          return { outcome: 'created', createdAt: created.createdAt, replaced: count };
        }),
      );
    } catch (error) {
      if (violatedUniqueIndex(error) === PENDING_RESET_UNIQUE_INDEX) {
        throw new PasswordResetAlreadyPending();
      }
      throw error;
    }
  }

  async revokePasswordReset(
    schoolId: string,
    userId: string,
    now: Date,
  ): Promise<RevokePasswordResetResult> {
    return translateDatabaseErrors(async () => {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, schoolId, status: { not: 'DELETED' } },
        select: { id: true },
      });
      if (user === null) {
        return 'notFound';
      }
      // El `updateMany` repite la regla de pendiente: es atómico, así que de dos revocaciones
      // simultáneas solo una escribe.
      const { count } = await this.prisma.accessLink.updateMany({
        where: { userId, purpose: 'PASSWORD_RESET', ...pendingAt(now) },
        data: { revokedAt: now },
      });
      return count > 0 ? 'revoked' : 'none';
    });
  }

  async findPendingPasswordReset(
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetPreview | null> {
    const row = await translateDatabaseErrors(() =>
      this.prisma.accessLink.findFirst({
        where: {
          tokenHash,
          purpose: 'PASSWORD_RESET',
          ...pendingAt(now),
          user: { status: 'ACTIVE' },
        },
        // Solo lo que ve quien abre el enlace: ni los ids ni el hash.
        select: { school: { select: { name: true } }, user: { select: { email: true } } },
      }),
    );
    return row === null || row.user === null
      ? null
      : { schoolName: row.school.name, email: row.user.email };
  }

  async resetPassword(input: {
    tokenHash: string;
    now: Date;
    passwordHash: string;
  }): Promise<CompletedPasswordReset | null> {
    const { tokenHash, now, passwordHash } = input;
    return translateDatabaseErrors(async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Primero se marca el enlace: con dos confirmaciones simultáneas, la segunda espera el
          // bloqueo de la fila y, al volver a evaluar el `where`, no actualiza nada.
          const { count } = await tx.accessLink.updateMany({
            where: { tokenHash, purpose: 'PASSWORD_RESET', ...pendingAt(now) },
            data: { usedAt: now },
          });
          if (count === 0) {
            return null;
          }
          const link = await tx.accessLink.findUniqueOrThrow({
            where: { tokenHash },
            select: { schoolId: true, userId: true },
          });
          const userId = link.userId as string;
          const changed = await tx.user.updateMany({
            where: { id: userId, status: 'ACTIVE' },
            data: { passwordHash },
          });
          if (changed.count === 0) {
            // El usuario se dio de baja entre la consulta y el cambio: se deshace también la marca.
            throw new PasswordResetUserNotActive();
          }
          const sessions = await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { userId, schoolId: link.schoolId, revokedSessions: sessions.count };
        });
      } catch (error) {
        if (error instanceof PasswordResetUserNotActive) {
          return null;
        }
        throw error;
      }
    });
  }
}

/** Deshace la transacción de `resetPassword` cuando el usuario del enlace ya no está activo. */
class PasswordResetUserNotActive extends Error {}
