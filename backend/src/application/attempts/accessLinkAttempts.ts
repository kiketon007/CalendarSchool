import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { RequestContext } from '../requestContext.js';
import type { AttemptLimiter } from './attemptLimiter.js';

/** Ventana deslizante del límite de intentos de los enlaces de acceso públicos: 15 minutos. */
export const ACCESS_LINK_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

type AccessLinkAttemptLimiter = Pick<AttemptLimiter, 'consume' | 'release'>;

/**
 * Qué enlace público limita: da la clave del contador (`<clave>:<ip>`) y los nombres de los eventos
 * del log. Las invitaciones y los restablecimientos de contraseña tienen contadores independientes.
 */
export interface AccessLinkAttemptScope {
  readonly key: string;
  readonly rateLimitedEvent: string;
  readonly releaseFailedEvent: string;
  /** Nombre del enlace en los mensajes del log, p. ej. «invitación». */
  readonly label: string;
}

/**
 * Reserva un intento contra el límite de la IP, antes de comprobar el enlace. La consulta y la
 * confirmación de un mismo propósito comparten la clave. Solo se libera si el enlace resulta
 * válido: los demás finales dejan el intento contado. Las peticiones sin IP identificable comparten
 * un único contador, lo que falla del lado seguro.
 */
export async function reserveAccessLinkAttempt(
  scope: AccessLinkAttemptScope,
  attemptLimiter: AccessLinkAttemptLimiter,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<string> {
  try {
    return await attemptLimiter.consume(`${scope.key}:${context.ip ?? 'unknown'}`);
  } catch (error) {
    if (error instanceof TooManyAttempts) {
      logger.warn(
        { event: scope.rateLimitedEvent, ip: context.ip, retry_after: error.retryAfterSeconds },
        `${capitalize(scope.label)} rechazada: se ha superado el número máximo de intentos con enlaces no válidos`,
      );
    }
    throw error;
  }
}

/**
 * Libera el intento reservado (el enlace era válido). Si falla, la petición no se interrumpe: lo
 * único que ocurre es que el intento sigue contando para el límite. Se registra para poder detectarlo.
 */
export async function releaseAccessLinkAttempt(
  scope: AccessLinkAttemptScope,
  attemptLimiter: AccessLinkAttemptLimiter,
  attemptId: string,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<void> {
  try {
    await attemptLimiter.release(attemptId);
  } catch (error) {
    logger.warn(
      {
        event: scope.releaseFailedEvent,
        ip: context.ip,
        error: error instanceof Error ? error.message : String(error),
      },
      `No se ha podido liberar el intento de ${scope.label}: seguirá contando para el límite`,
    );
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
