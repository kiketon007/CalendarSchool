/** Token secreto recién generado: el valor en claro sale al cliente y el hash es lo único que se guarda. */
export interface GeneratedSecretToken {
  readonly token: string;
  readonly hash: string;
}

/**
 * Puerto de generación de tokens opacos y de cálculo de su hash. Lo comparten los refresh tokens de
 * las sesiones y los enlaces de acceso (invitaciones y restablecimientos de contraseña): en ambos
 * casos el token es aleatorio y de alta entropía, y en la base de datos solo está su SHA-256.
 */
export interface SecretTokenGenerator {
  /** Genera un token aleatorio criptográficamente seguro y su hash. */
  generate(): GeneratedSecretToken;

  /** Calcula el hash con el que se busca un token recibido del cliente. */
  hash(token: string): string;
}
