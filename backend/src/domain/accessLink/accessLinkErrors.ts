/**
 * La invitación no existe en el colegio: es de otro, no existe, no es un UUID o es un enlace que no
 * es una invitación (`404 NOT_FOUND`). No se distingue el caso.
 */
export class InvitationNotFound extends Error {
  constructor() {
    super('La invitación no existe');
    this.name = 'InvitationNotFound';
  }
}

/**
 * Otra generación del mismo usuario creó su restablecimiento entre la revocación de los anteriores y
 * la inserción del nuevo (viola el índice único parcial de restablecimientos pendientes). El caso de
 * uso reintenta una vez; si se repite, es un error interno.
 */
export class PasswordResetAlreadyPending extends Error {
  constructor() {
    super('El usuario ya tiene un restablecimiento de contraseña pendiente');
    this.name = 'PasswordResetAlreadyPending';
  }
}

/** Motivo por el que un enlace no sirve. Solo va al log: la respuesta nunca distingue los casos. */
export type AccessLinkInvalidReason = 'TOKEN_MISSING' | 'NOT_PENDING';

/**
 * El enlace de acceso no es válido: está caducado, usado o revocado, no existe, corresponde a otro
 * propósito o no se envió el token (`410 ACCESS_LINK_INVALID`). La causa (`reason`) solo sirve para el
 * log: al cliente siempre le llega el mismo mensaje.
 */
export class AccessLinkInvalid extends Error {
  constructor(public readonly reason: AccessLinkInvalidReason) {
    super('El enlace no es válido o ha caducado');
    this.name = 'AccessLinkInvalid';
  }
}
