import type { ApplicationLogger } from '../applicationLogger.js';
import {
  ACCESS_LINK_ATTEMPTS_WINDOW_MS,
  releaseAccessLinkAttempt,
  reserveAccessLinkAttempt,
  type AccessLinkAttemptScope,
} from '../attempts/accessLinkAttempts.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { RequestContext } from '../requestContext.js';

/** Ventana deslizante del límite de intentos de las invitaciones públicas: 15 minutos. */
export const INVITATION_ATTEMPTS_WINDOW_MS = ACCESS_LINK_ATTEMPTS_WINDOW_MS;

type InvitationAttemptLimiter = Pick<AttemptLimiter, 'consume' | 'release'>;

/** La consulta y la aceptación de invitaciones comparten la clave `invitation:<ip>`. */
const INVITATION_SCOPE: AccessLinkAttemptScope = {
  key: 'invitation',
  rateLimitedEvent: 'INVITATION_RATE_LIMITED',
  releaseFailedEvent: 'INVITATION_ATTEMPT_RELEASE_FAILED',
  label: 'invitación',
};

/** Reserva un intento de invitación contra el límite de la IP (ver `reserveAccessLinkAttempt`). */
export function reserveInvitationAttempt(
  attemptLimiter: InvitationAttemptLimiter,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<string> {
  return reserveAccessLinkAttempt(INVITATION_SCOPE, attemptLimiter, context, logger);
}

/** Libera el intento de invitación reservado (ver `releaseAccessLinkAttempt`). */
export function releaseInvitationAttempt(
  attemptLimiter: InvitationAttemptLimiter,
  attemptId: string,
  context: RequestContext,
  logger: ApplicationLogger,
): Promise<void> {
  return releaseAccessLinkAttempt(INVITATION_SCOPE, attemptLimiter, attemptId, context, logger);
}
