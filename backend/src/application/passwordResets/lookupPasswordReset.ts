import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import { maskEmail } from '../registration/maskEmail.js';
import type { RequestContext } from '../requestContext.js';
import { readAccessLinkToken } from '../tokens/readAccessLinkToken.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import {
  releasePasswordResetAttempt,
  reservePasswordResetAttempt,
} from './passwordResetAttempts.js';

export interface LookupPasswordResetDependencies {
  attemptLimiter: Pick<AttemptLimiter, 'consume' | 'release'>;
  accessLinkRepository: Pick<AccessLinkRepository, 'findPendingPasswordReset'>;
  secretTokenGenerator: Pick<SecretTokenGenerator, 'hash'>;
  now: () => Date;
  logger: ApplicationLogger;
}

/** Lo que ve quien abre el enlace: el colegio y el email con el local enmascarado. */
export interface PasswordResetLookup {
  readonly schoolName: string;
  /** Email enmascarado (`a***@example.com`); nunca en claro. */
  readonly email: string;
}

/**
 * Caso de uso: consulta el colegio y el email (enmascarado) de un restablecimiento a partir del token
 * de su enlace. No consume el enlace ni escribe nada, así que abrirlo (o su vista previa en una
 * aplicación de mensajería) no lo invalida. Reserva un intento contra el límite de la IP y solo lo
 * libera si el enlace es válido.
 *
 * @throws TooManyAttempts si se ha superado el límite de intentos
 * @throws AccessLinkInvalid si falta el token o no hay un restablecimiento pendiente con ese hash
 */
export class LookupPasswordReset {
  constructor(private readonly dependencies: LookupPasswordResetDependencies) {}

  async execute({
    body,
    context,
  }: {
    body: unknown;
    context: RequestContext;
  }): Promise<PasswordResetLookup> {
    const { attemptLimiter, accessLinkRepository, secretTokenGenerator, now, logger } =
      this.dependencies;

    const attemptId = await reservePasswordResetAttempt(attemptLimiter, context, logger);

    const token = readAccessLinkToken(body);
    if (token === undefined) {
      throw new AccessLinkInvalid('TOKEN_MISSING');
    }
    const preview = await accessLinkRepository.findPendingPasswordReset(
      secretTokenGenerator.hash(token),
      now(),
    );
    if (preview === null) {
      throw new AccessLinkInvalid('NOT_PENDING');
    }

    await releasePasswordResetAttempt(attemptLimiter, attemptId, context, logger);
    return { schoolName: preview.schoolName, email: maskEmail(preview.email) ?? '***' };
  }
}
