import { hash } from '@node-rs/bcrypt';
import type { PasswordHasher } from '../application/registration/passwordHasher.js';

/** Cost factor de Bcrypt de la historia US01_b. */
export const BCRYPT_COST = 12;

/**
 * Hash de contraseñas con Bcrypt (cost 12) y sal aleatoria por hash. `@node-rs/bcrypt` calcula el
 * hash en el threadpool de libuv, sin bloquear el event loop, y publica binarios precompilados
 * para Linux (AWS Lambda), de modo que no necesita compilar ni scripts de instalación (D5).
 *
 * Bcrypt solo usa los primeros 72 bytes de la contraseña. `rejectLongPasswords` hace que una
 * más larga falle en lugar de truncarse en silencio; la validación del registro ya la rechaza
 * antes (D5), así que aquí es una segunda barrera.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, { cost: BCRYPT_COST, rejectLongPasswords: true });
  }
}
