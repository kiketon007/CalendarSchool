import type { UserRole } from '../user/user.js';

/** Invitación pendiente tal como se muestra al administrador: nunca incluye el token, su hash ni el enlace. */
export interface PendingInvitation {
  readonly id: string;
  readonly role: UserRole;
  /** Administrador que la generó; puede estar dado de baja. */
  readonly createdBy: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
  };
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Lo necesario para guardar una invitación nueva. */
export interface NewInvitation {
  /** UUIDv7. */
  readonly id: string;
  readonly schoolId: string;
  /** SHA-256 del token en hexadecimal; el token nunca llega al repositorio. */
  readonly tokenHash: string;
  readonly role: UserRole;
  readonly createdById: string;
  readonly expiresAt: Date;
}

/** Resultado de revocar una invitación del colegio. */
export type RevokeInvitationResult = 'revoked' | 'notPending';

/**
 * Puerto de los enlaces de acceso para las invitaciones. El colegio es siempre un parámetro
 * obligatorio, tomado de la identidad de la petición: ningún método lee ni escribe invitaciones de un
 * colegio sin indicarlo. Una invitación es pendiente si no está usada, no está revocada y no ha
 * caducado (`accessLinkStatus`).
 */
export interface AccessLinkRepository {
  /**
   * Guarda una invitación nueva y la devuelve como se muestra en la lista, con el nombre de quien la
   * generó y la fecha de creación.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  createInvitation(invitation: NewInvitation): Promise<PendingInvitation>;

  /**
   * Invitaciones pendientes del colegio en el instante `now`, de la más reciente a la más antigua.
   * Incluye las de administradores dados de baja y excluye las de otros colegios y los enlaces con
   * otro propósito.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  listPendingInvitations(schoolId: string, now: Date): Promise<PendingInvitation[]>;

  /**
   * Revoca una invitación del colegio informando `revokedAt`. Es atómico: dos revocaciones
   * simultáneas conservan el primer instante.
   *
   * @returns `revoked` si estaba pendiente, `notPending` si ya estaba revocada, usada o caducada, y
   * `null` si no es una invitación de este colegio (otro colegio, inexistente o con otro propósito)
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  revokeInvitation(schoolId: string, id: string, now: Date): Promise<RevokeInvitationResult | null>;
}
