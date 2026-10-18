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
