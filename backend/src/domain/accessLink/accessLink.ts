import type { UserRole } from '../user/user.js';

/** Para qué sirve un enlace de acceso: invitar a una persona al colegio o restablecer una contraseña. */
export type AccessLinkPurpose = 'INVITATION' | 'PASSWORD_RESET';

/** Un enlace de acceso caduca a las 72 horas de crearse. */
export const ACCESS_LINK_TTL_HOURS = 72;

/**
 * Enlace de acceso persistido. Solo guarda el hash del token, nunca el token: el enlace completo se
 * muestra una sola vez, al generarlo. Una invitación lleva `role` y no `userId`; un restablecimiento,
 * al revés (lo garantiza un `CHECK` de la base de datos).
 */
export interface AccessLink {
  /** UUIDv7. */
  readonly id: string;
  readonly schoolId: string;
  readonly purpose: AccessLinkPurpose;
  /** SHA-256 del token en hexadecimal. */
  readonly tokenHash: string;
  readonly role: UserRole | null;
  readonly userId: string | null;
  /** Administrador que generó el enlace. */
  readonly createdById: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
}

export type AccessLinkStatus = 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED';

/** Instante en que caduca un enlace creado en `createdAt`. */
export function accessLinkExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ACCESS_LINK_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * Estado de un enlace de acceso en el instante `now`. Si coinciden varias causas gana la más firme:
 * usado, después revocado y por último caducado. Un enlace deja de ser válido en el mismo instante
 * de `expiresAt`. Solo `PENDING` se puede usar o revocar; las caducadas no se escriben en ningún
 * sitio, se deducen de la fecha.
 */
export function accessLinkStatus(
  link: Pick<AccessLink, 'expiresAt' | 'usedAt' | 'revokedAt'>,
  now: Date,
): AccessLinkStatus {
  if (link.usedAt !== null) {
    return 'USED';
  }
  if (link.revokedAt !== null) {
    return 'REVOKED';
  }
  return link.expiresAt.getTime() > now.getTime() ? 'PENDING' : 'EXPIRED';
}
