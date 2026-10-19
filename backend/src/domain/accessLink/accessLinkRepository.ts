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

/** Lo necesario para guardar un restablecimiento de contraseña nuevo. */
export interface NewPasswordReset {
  /** UUIDv7. */
  readonly id: string;
  readonly schoolId: string;
  /** Usuario cuya contraseña se restablece. */
  readonly userId: string;
  /** Administrador que lo genera. */
  readonly createdById: string;
  /** SHA-256 del token en hexadecimal; el token nunca llega al repositorio. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** Instante de creación y de revocación de los restablecimientos anteriores abiertos. */
  readonly now: Date;
}

/**
 * Resultado de generar un restablecimiento: `created` lleva el instante de creación y cuántos
 * restablecimientos abiertos del usuario se revocaron (también los caducados sin revocar, que el
 * índice único parcial sigue contando); `notFound` es un usuario de otro colegio, inexistente o
 * `DELETED`, y `notActive` uno `SUSPENDED`. En los dos últimos no se escribe nada.
 */
export type CreatePasswordResetResult =
  | { readonly outcome: 'created'; readonly createdAt: Date; readonly replaced: number }
  | { readonly outcome: 'notFound' }
  | { readonly outcome: 'notActive' };

/**
 * Resultado de revocar el restablecimiento pendiente de un usuario: `revoked` si había uno, `none` si
 * el usuario del colegio no tenía ninguno y `notFound` si no es un usuario de este colegio.
 */
export type RevokePasswordResetResult = 'revoked' | 'none' | 'notFound';

/** Lo que ve quien abre el enlace de restablecimiento: el colegio y el email, nunca el id ni el hash. */
export interface PasswordResetPreview {
  readonly schoolName: string;
  /** Email de la cuenta sin enmascarar; la capa de aplicación lo enmascara antes de devolverlo. */
  readonly email: string;
}

/** Cuenta cuya contraseña se ha cambiado y número de sesiones que se cerraron (solo para el log). */
export interface CompletedPasswordReset {
  readonly userId: string;
  readonly schoolId: string;
  readonly revokedSessions: number;
}

/**
 * Puerto de los enlaces de acceso (invitaciones y restablecimientos de contraseña). El colegio es
 * siempre un parámetro obligatorio, tomado de la identidad de la petición: ningún método lee ni
 * escribe enlaces de un colegio sin indicarlo, salvo los que parten del token de un enlace público
 * (`findPendingInvitation`, `acceptInvitation`, `findPendingPasswordReset`, `resetPassword`). Un
 * enlace es pendiente si no está usado, no está revocado y no ha caducado (`accessLinkStatus`).
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

  /**
   * Genera un restablecimiento para un usuario `ACTIVE` del colegio, en una única transacción: revoca
   * los restablecimientos abiertos del usuario (caducados o no) y guarda el nuevo.
   *
   * @throws PasswordResetAlreadyPending si otra generación del mismo usuario se cuela entre medias
   * (viola el índice único parcial `access_links_pending_reset_user_key`); el caso de uso reintenta
   * una vez
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  createPasswordReset(reset: NewPasswordReset): Promise<CreatePasswordResetResult>;

  /**
   * Revoca el restablecimiento pendiente de un usuario del colegio informando `revokedAt` en `now`.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  revokePasswordReset(
    schoolId: string,
    userId: string,
    now: Date,
  ): Promise<RevokePasswordResetResult>;

  /**
   * Busca un restablecimiento pendiente por el SHA-256 de su token, sin escribir nada. Es pendiente si
   * `purpose` es `PASSWORD_RESET`, no está usado, ni revocado, ni caducado en `now`, y su usuario
   * sigue `ACTIVE`.
   *
   * @returns el colegio y el email, o `null` si no hay un restablecimiento pendiente con ese hash
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  findPendingPasswordReset(tokenHash: string, now: Date): Promise<PasswordResetPreview | null>;

  /**
   * Confirma un restablecimiento: lo marca como usado, cambia la contraseña de su usuario y revoca
   * todas las sesiones abiertas de ese usuario, en una única transacción. La marca solo se aplica si
   * el restablecimiento sigue pendiente en `now` y el usuario sigue `ACTIVE`, así que de dos
   * confirmaciones simultáneas gana una y, si falla algo, no cambia nada.
   *
   * @returns la cuenta y las sesiones cerradas, o `null` si el enlace ya no estaba pendiente
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  resetPassword(input: {
    tokenHash: string;
    now: Date;
    passwordHash: string;
  }): Promise<CompletedPasswordReset | null>;
}
