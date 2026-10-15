import type { AttemptRepository } from '../../domain/attempts/attemptRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';

/** Política de una operación limitada: cuántos intentos admite y en qué ventana deslizante. */
export interface AttemptPolicy {
  readonly maxAttempts: number;
  readonly windowMs: number;
}

export interface AttemptLimiterDependencies {
  attemptRepository: AttemptRepository;
  policy: AttemptPolicy;
  now: () => Date;
}

/**
 * Limitador de intentos genérico: aplica una política a una clave (`<operación>:<ip>`) y lanza
 * `TooManyAttempts` con los segundos de espera si se supera. No sabe de registros ni de logins: cada
 * operación construye uno con su política (el registro, el login de US02 y las invitaciones). Las
 * que solo cuentan los intentos fallidos (el login) reservan el intento con `consume` y lo liberan
 * con `release` cuando sale bien; las que cuentan todos (el registro) no lo liberan.
 */
export class AttemptLimiter {
  constructor(private readonly dependencies: AttemptLimiterDependencies) {}

  /**
   * Cuenta un intento de la clave.
   *
   * @returns el identificador del intento aceptado, para poder liberarlo con `release`
   * @throws TooManyAttempts si se ha superado el máximo en la ventana
   * @throws DatabaseUnavailable si la base de datos no responde: el intento no se acepta
   */
  async consume(key: string): Promise<string> {
    const { attemptRepository, policy, now } = this.dependencies;
    const instant = now();

    const result = await attemptRepository.register(
      key,
      instant,
      policy.windowMs,
      policy.maxAttempts,
    );
    if (!result.accepted) {
      const waitMs = result.retryAt.getTime() - instant.getTime();
      // Segundos enteros hacia arriba y nunca menos de 1: `Retry-After: 0` invitaría a reintentar ya.
      throw new TooManyAttempts(Math.max(1, Math.ceil(waitMs / 1000)));
    }
    return result.attemptId;
  }

  /**
   * Libera un intento aceptado por `consume`: deja de contar para el límite. Es idempotente.
   *
   * @throws DatabaseUnavailable si la base de datos no responde: quien llama decide si continúa
   */
  async release(attemptId: string): Promise<void> {
    await this.dependencies.attemptRepository.release(attemptId);
  }
}
