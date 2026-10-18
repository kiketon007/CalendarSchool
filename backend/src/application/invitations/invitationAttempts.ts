import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { RequestContext } from '../requestContext.js';

/** Ventana deslizante del límite de intentos de las invitaciones públicas: 15 minutos. */
export const INVITATION_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

type InvitationAttemptLimiter = Pick<AttemptLimiter, 'consume' | 'release'>;

/**
 * Reserva un intento contra el límite de la IP, antes de comprobar el enlace. La consulta y la
 * aceptación comparten la clave `invitation:<ip>`. Solo se libera si el enlace resulta válido: los
 * demás finales dejan el intento contado. Las peticiones sin IP identificable comparten un único
 * contador, lo que falla del lado seguro.
 */
export async function reserveInvitationAttempt(
  attemptLimiter: InvitationAttemptLimiter,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<string> {
  try {
    return await attemptLimiter.consume(`invitation:${context.ip ?? 'unknown'}`);
  } catch (error) {
    if (error instanceof TooManyAttempts) {
      logger.warn(
        { event: 'INVITATION_RATE_LIMITED', ip: context.ip, retry_after: error.retryAfterSeconds },
        'Invitación rechazada: se ha superado el número máximo de intentos con enlaces no válidos',
      );
    }
    throw error;
  }
}

/**
 * Libera el intento reservado (el enlace era válido). Si falla, la petición no se interrumpe: lo
 * único que ocurre es que el intento sigue contando para el límite. Se registra para poder detectarlo.
 */
export async function releaseInvitationAttempt(
  attemptLimiter: InvitationAttemptLimiter,
  attemptId: string,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<void> {
  try {
    await attemptLimiter.release(attemptId);
  } catch (error) {
    logger.warn(
      {
        event: 'INVITATION_ATTEMPT_RELEASE_FAILED',
        ip: context.ip,
        error: error instanceof Error ? error.message : String(error),
      },
      'No se ha podido liberar el intento de invitación: seguirá contando para el límite',
    );
  }
}
