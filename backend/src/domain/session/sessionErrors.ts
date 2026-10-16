/**
 * Causa por la que una sesión no es válida. Solo se registra en el log: al cliente se le responde
 * siempre lo mismo, para no revelar si un token existe, se revocó o caducó.
 *
 * Las cuatro primeras son las de la renovación con el refresh token de la cookie; las demás, las
 * de la autenticación de un access token en los endpoints protegidos.
 */
export type InvalidSessionReason =
  | 'MISSING'
  | 'UNKNOWN'
  | 'REVOKED'
  | 'EXPIRED'
  | 'USER_INACTIVE'
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_USER_MISMATCH'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED';

/** No hay una sesión válida: falta el token, no existe, no es utilizable o su usuario no está activo. */
export class InvalidSession extends Error {
  constructor(public readonly reason: InvalidSessionReason) {
    super('La sesión no es válida');
    this.name = 'InvalidSession';
  }
}
