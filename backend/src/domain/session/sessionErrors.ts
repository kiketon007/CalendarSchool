/**
 * Causa por la que una sesión no es válida. Solo se registra en el log: al cliente se le responde
 * siempre lo mismo, para no revelar si un token existe, se revocó o caducó.
 */
export type InvalidSessionReason = 'MISSING' | 'UNKNOWN' | 'REVOKED' | 'EXPIRED' | 'USER_INACTIVE';

/** No hay una sesión válida: falta el refresh token, no existe, no es utilizable o su usuario no está activo. */
export class InvalidSession extends Error {
  constructor(public readonly reason: InvalidSessionReason) {
    super('La sesión no es válida');
    this.name = 'InvalidSession';
  }
}
