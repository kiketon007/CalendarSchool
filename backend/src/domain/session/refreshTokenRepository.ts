import type { User } from '../user/user.js';
import type { RefreshToken } from './refreshToken.js';

/** Refresh token con los datos de su usuario y su colegio que necesita la sesión. */
export interface RefreshTokenWithOwner {
  readonly token: RefreshToken;
  readonly user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'status'>;
  readonly school: { readonly id: string; readonly name: string };
}

/** Puerto de los refresh tokens persistidos: lectura para renovar la sesión, alta al iniciarla y revocación al cerrarla. */
export interface RefreshTokenRepository {
  /**
   * Busca un refresh token por su hash, sin filtrar por vigencia: la regla la aplica el caso de uso.
   *
   * @returns el token con su usuario y su colegio, o `null` si no existe
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  findByHash(tokenHash: string): Promise<RefreshTokenWithOwner | null>;
  /**
   * Busca una sesión por su id (el claim `sid` del access token), sin filtrar por vigencia: la regla
   * la aplica el caso de uso. Es una única consulta por clave primaria.
   *
   * @returns la sesión con su usuario y su colegio, o `null` si no existe
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  findById(id: string): Promise<RefreshTokenWithOwner | null>;

  /**
   * Guarda un refresh token nuevo (el inicio de sesión). Las sesiones que el usuario ya tenga no se
   * tocan. El registro no usa este método: guarda su token en la transacción del alta.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  save(token: RefreshToken): Promise<void>;
  /**
   * Revoca una sesión (el cierre de sesión) informando `revokedAt`. Es atómico e idempotente: una
   * sesión ya revocada conserva su primer instante, y una que no existe no es un error. Las demás
   * sesiones del usuario no se tocan.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  revoke(id: string, revokedAt: Date): Promise<void>;
}
