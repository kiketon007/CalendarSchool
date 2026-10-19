import type { ApplicationLogger } from '../applicationLogger.js';
import {
  ACCESS_LINK_ATTEMPTS_WINDOW_MS,
  releaseAccessLinkAttempt,
  reserveAccessLinkAttempt,
  type AccessLinkAttemptScope,
} from '../attempts/accessLinkAttempts.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { RequestContext } from '../requestContext.js';

/** Ventana deslizante del límite de intentos de los restablecimientos públicos: 15 minutos. */
export const PASSWORD_RESET_ATTEMPTS_WINDOW_MS = ACCESS_LINK_ATTEMPTS_WINDOW_MS;

type PasswordResetAttemptLimiter = Pick<AttemptLimiter, 'consume' | 'release'>;

/** La consulta y la confirmación comparten la clave `password-reset:<ip>`, aparte de la de las invitaciones. */
const PASSWORD_RESET_SCOPE: AccessLinkAttemptScope = {
  key: 'password-reset',
  rateLimitedEvent: 'PASSWORD_RESET_RATE_LIMITED',
  releaseFailedEvent: 'PASSWORD_RESET_ATTEMPT_RELEASE_FAILED',
  label: 'restablecimiento de contraseña',
};

/** Reserva un intento de restablecimiento contra el límite de la IP (ver `reserveAccessLinkAttempt`). */
export function reservePasswordResetAttempt(
  attemptLimiter: PasswordResetAttemptLimiter,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<string> {
  return reserveAccessLinkAttempt(PASSWORD_RESET_SCOPE, attemptLimiter, context, logger);
}

/** Libera el intento de restablecimiento reservado (ver `releaseAccessLinkAttempt`). */
export function releasePasswordResetAttempt(
  attemptLimiter: PasswordResetAttemptLimiter,
  attemptId: string,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<void> {
  return releaseAccessLinkAttempt(PASSWORD_RESET_SCOPE, attemptLimiter, attemptId, context, logger);
}
