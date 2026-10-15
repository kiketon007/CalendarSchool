import { hash, verify } from '@node-rs/bcrypt';
import type { PasswordHasher } from '../application/credentials/passwordHasher.js';

/** Cost factor de Bcrypt de la historia US01_b. */
export const BCRYPT_COST = 12;

/**
 * Hash Bcrypt de una contraseña aleatoria que se descartó al generarlo: nadie conoce una contraseña
 * que lo cumpla. Es la referencia con la que se compara cuando el email no existe, para que ese
 * caso cueste lo mismo que uno con usuario. Debe tener el coste de `BCRYPT_COST`: si este cambia,
 * se regenera (lo comprueba un test).
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$/O8osY24oG3UymGZdpSBnOVc0sr3rDd8uyAPdNFzMfWif7NbNI1ne';

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

  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    if (passwordHash === null) {
      // Se hace la comparación aunque el resultado esté decidido: es lo que iguala el coste.
      await verify(password, DUMMY_PASSWORD_HASH);
      return false;
    }
    return verify(password, passwordHash);
  }
}
