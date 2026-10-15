/**
 * Causa por la que fallan las credenciales. Solo se registra en el log: al cliente se le responde
 * siempre lo mismo, para no revelar si el email existe. Un usuario eliminado se registra como
 * `NOT_FOUND`, porque para el cliente no existe.
 */
export type InvalidCredentialsReason = 'PASSWORD' | 'NOT_FOUND';

/** El email no está registrado, la contraseña no coincide o el usuario está eliminado (`401 INVALID_CREDENTIALS`). */
export class InvalidCredentials extends Error {
  constructor(public readonly reason: InvalidCredentialsReason) {
    super('Email o contraseña incorrectos');
    this.name = 'InvalidCredentials';
  }
}

/**
 * La contraseña es correcta pero la cuenta está suspendida (`403 ACCOUNT_SUSPENDED`). Solo se lanza
 * después de comprobar la contraseña: quien no la conoce recibe `InvalidCredentials`.
 */
export class AccountSuspended extends Error {
  constructor() {
    super('La cuenta está desactivada');
    this.name = 'AccountSuspended';
  }
}
