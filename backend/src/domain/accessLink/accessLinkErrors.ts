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
