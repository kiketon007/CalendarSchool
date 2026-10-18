import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type {
  AccessLinkRepository,
  InvitationPreview,
} from '../../domain/accessLink/accessLinkRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { RequestContext } from '../requestContext.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { readInvitationToken } from './acceptInvitationRequest.js';
import { releaseInvitationAttempt, reserveInvitationAttempt } from './invitationAttempts.js';

export interface LookupInvitationDependencies {
  attemptLimiter: Pick<AttemptLimiter, 'consume' | 'release'>;
  accessLinkRepository: Pick<AccessLinkRepository, 'findPendingInvitation'>;
  secretTokenGenerator: Pick<SecretTokenGenerator, 'hash'>;
  now: () => Date;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: consulta el colegio y el rol de una invitación a partir del token de su enlace.
 * No consume la invitación ni escribe nada, así que abrir el enlace (o su vista previa en una
 * aplicación de mensajería) no lo invalida. Reserva un intento contra el límite de la IP y solo lo
 * libera si el enlace es válido.
 *
 * @throws TooManyAttempts si se ha superado el límite de intentos
 * @throws AccessLinkInvalid si falta el token o no hay una invitación pendiente con ese hash
 */
export class LookupInvitation {
  constructor(private readonly dependencies: LookupInvitationDependencies) {}

  async execute({
    body,
    context,
  }: {
    body: unknown;
    context: RequestContext;
  }): Promise<InvitationPreview> {
    const { attemptLimiter, accessLinkRepository, secretTokenGenerator, now, logger } =
      this.dependencies;

    const attemptId = await reserveInvitationAttempt(attemptLimiter, context, logger);

    const token = readInvitationToken(body);
    if (token === undefined) {
      throw new AccessLinkInvalid('TOKEN_MISSING');
    }
    const preview = await accessLinkRepository.findPendingInvitation(
      secretTokenGenerator.hash(token),
      now(),
    );
    if (preview === null) {
      throw new AccessLinkInvalid('NOT_PENDING');
    }

    await releaseInvitationAttempt(attemptLimiter, attemptId, context, logger);
    return preview;
  }
}
