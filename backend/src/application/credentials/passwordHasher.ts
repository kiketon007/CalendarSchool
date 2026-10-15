/** Puerto de hash de contraseñas (Bcrypt, cost 12). El cálculo no debe bloquear el event loop. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
}
