import type {
  AccessLinkRepository,
  NewInvitation,
  PendingInvitation,
  RevokeInvitationResult,
} from '../../domain/accessLink/accessLinkRepository.js';
import type { UserRole } from '../../domain/user/user.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

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
}
