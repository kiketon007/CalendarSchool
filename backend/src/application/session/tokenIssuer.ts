import type { UserRole } from '../../domain/user/user.js';

/** Validez del access token: 15 minutos. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Datos que viajan firmados en el access token. */
export interface AccessTokenClaims {
  readonly userId: string;
  readonly schoolId: string;
  readonly role: UserRole;
}

/** El access token no es válido: firma o algoritmo incorrectos, caducado o malformado. */
export class InvalidAccessToken extends Error {
  constructor() {
    super('El access token no es válido');
    this.name = 'InvalidAccessToken';
  }
}

/** Puerto de emisión y verificación de access tokens (JWT de corta duración). */
export interface TokenIssuer {
  /** Firma un access token con una validez de `ACCESS_TOKEN_TTL_SECONDS`. */
  issueAccessToken(claims: AccessTokenClaims): Promise<string>;

  /**
   * Verifica un access token y devuelve sus datos.
   *
   * @throws InvalidAccessToken si no es válido
   */
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}
