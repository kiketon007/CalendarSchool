/** Puerto de hash de contraseñas (Bcrypt, cost 12). El cálculo no debe bloquear el event loop. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;

  /**
   * Comprueba una contraseña contra un hash guardado. Con `null` (el usuario no existe) hace la misma
   * comparación contra un hash ficticio y devuelve siempre `false`, para que la respuesta cueste lo
   * mismo exista o no el email.
   */
  verify(password: string, passwordHash: string | null): Promise<boolean>;
}
