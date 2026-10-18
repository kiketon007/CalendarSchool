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

/** Lo que ve la persona invitada al abrir el enlace: el colegio y el rol, nunca el id ni el hash. */
export interface InvitationPreview {
  readonly schoolName: string;
  readonly role: UserRole;
}

/** Lo necesario para crear el usuario de una invitación: el colegio y el rol salen de la invitación. */
export interface NewInvitedUser {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Email normalizado (sin espacios y en minúsculas). */
  readonly email: string;
  /** Hash Bcrypt de la contraseña. */
  readonly passwordHash: string;
  readonly privacyPolicyAcceptedAt: Date;
  readonly privacyPolicyVersion: string;
}

/** El usuario y el colegio creados al aceptar una invitación, y la invitación usada (solo para el log). */
export interface AcceptedInvitation {
  readonly invitationId: string;
  readonly user: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly role: UserRole;
  };
  readonly school: { readonly id: string; readonly name: string };
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

  /**
   * Busca una invitación pendiente por el SHA-256 de su token, sin escribir nada. Es pendiente si
   * `purpose` es `INVITATION` y no está usada, ni revocada, ni caducada en `now`.
   *
   * @returns el colegio y el rol, o `null` si no hay una invitación pendiente con ese hash
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  findPendingInvitation(tokenHash: string, now: Date): Promise<InvitationPreview | null>;

  /**
   * Acepta una invitación: la marca como usada y crea el usuario `ACTIVE` en su colegio y con su rol,
   * en una única transacción. La marca solo se aplica si la invitación sigue pendiente en `now`, así
   * que de dos aceptaciones simultáneas gana una.
   *
   * @returns el usuario y el colegio creados, o `null` si el enlace ya no estaba pendiente
   * @throws EmailAlreadyRegistered si el email ya existe; la invitación sigue pendiente
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  acceptInvitation(input: {
    tokenHash: string;
    now: Date;
    newUser: NewInvitedUser;
  }): Promise<AcceptedInvitation | null>;
}
