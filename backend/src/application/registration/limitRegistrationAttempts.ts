import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { RequestContext } from '../requestContext.js';

/**
 * Ventana deslizante del límite de intentos de registro: 15 minutos (CA9 de US01_d). Es fija y se
 * define aquí, una sola vez, para que `server.ts` y los tests de integración usen el mismo valor.
 */
export const REGISTRATION_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

export interface LimitRegistrationAttemptsDependencies {
  attemptLimiter: Pick<AttemptLimiter, 'consume'>;
  logger: ApplicationLogger;
}

/**
 * Paso 1 del orden de procesamiento del registro (US01_d): cuenta el intento contra el límite de la
 * IP del cliente, antes del captcha, la validación y cualquier consulta de usuarios o colegios. Se
 * ejecuta antes de leer el payload, de modo que el evento nunca lleva el email.
 */
export class LimitRegistrationAttempts {
  constructor(private readonly dependencies: LimitRegistrationAttemptsDependencies) {}

  /**
   * @throws TooManyAttempts si la IP ha superado el máximo de intentos en la ventana
   * @throws DatabaseUnavailable si la base de datos no responde: el intento no se acepta
   */
  async execute(context: RequestContext): Promise<void> {
    try {
      // Las peticiones sin IP identificable comparten un único contador, lo que falla del lado seguro.
      await this.dependencies.attemptLimiter.consume(`register:${context.ip ?? 'unknown'}`);
    } catch (error) {
      if (error instanceof TooManyAttempts) {
        this.dependencies.logger.warn(
          {
            event: 'USER_REGISTER_RATE_LIMITED',
            ip: context.ip,
            user_agent: context.userAgent,
            retry_after: error.retryAfterSeconds,
          },
          'Registro rechazado: se ha superado el número máximo de intentos',
        );
      }
      throw error;
    }
  }
}
