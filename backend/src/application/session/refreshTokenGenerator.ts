/** Refresh token recién generado: el valor en claro va a la cookie y el hash, a la base de datos. */
export interface GeneratedRefreshToken {
  readonly token: string;
  readonly hash: string;
}

/** Puerto de generación de refresh tokens opacos y de cálculo de su hash. */
export interface RefreshTokenGenerator {
  /** Genera un token aleatorio criptográficamente seguro y su hash. */
  generate(): GeneratedRefreshToken;

  /** Calcula el hash con el que se busca un token recibido del cliente. */
  hash(token: string): string;
}
