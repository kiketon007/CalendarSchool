import type { UserStatus } from './user.js';

/** Lo mínimo de un usuario que necesita el inicio de sesión: quién es, su hash y su estado. */
export interface UserCredentials {
  readonly id: string;
  /** Hash Bcrypt (cost 12); nunca la contraseña. */
  readonly passwordHash: string;
  readonly status: UserStatus;
}

/** Puerto de lectura de las credenciales de un usuario, para iniciar sesión. */
export interface UserCredentialsRepository {
  /**
   * Busca un usuario por su email, que debe llegar ya normalizado (sin espacios y en minúsculas).
   * No filtra por estado: la regla de quién puede entrar la aplica el caso de uso.
   *
   * @returns las credenciales, o `null` si no hay ningún usuario con ese email
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  findByEmail(email: string): Promise<UserCredentials | null>;
}
