import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { PasswordHasher } from '../credentials/passwordHasher.js';
import { parseFields, USER_FIELD_SCHEMAS } from '../registration/userFields.js';
import type { RequestContext } from '../requestContext.js';
import { readAccessLinkToken } from '../tokens/readAccessLinkToken.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { ValidationError } from '../validationError.js';
import {
  releasePasswordResetAttempt,
  reservePasswordResetAttempt,
} from './passwordResetAttempts.js';

export interface ConfirmPasswordResetDependencies {
  attemptLimiter: Pick<AttemptLimiter, 'consume' | 'release'>;
  accessLinkRepository: Pick<AccessLinkRepository, 'findPendingPasswordReset' | 'resetPassword'>;
  secretTokenGenerator: Pick<SecretTokenGenerator, 'hash'>;
  passwordHasher: Pick<PasswordHasher, 'hash'>;
  now: () => Date;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: la persona elige su contraseña nueva con el token de su enlace de restablecimiento.
 * Orden fijo:
 * 1. límite de intentos (`TooManyAttempts`);
 * 2. enlace pendiente (`AccessLinkInvalid`), antes que la contraseña para que nadie sin un enlace
 *    válido obtenga información;
 * 3. reglas de la contraseña del registro (`ValidationError` con el campo `password`);
 * 4. hash de la contraseña, fuera de cualquier transacción y solo con un enlace válido;
 * 5. cambio atómico: marca el enlace como usado, cambia la contraseña y revoca las sesiones.
 *
 * El intento reservado se libera siempre que el enlace era válido (con éxito o con contraseña
 * inválida): solo cuentan los enlaces no válidos. No crea sesión. La cuenta sale del enlace, nunca
 * del cuerpo.
 */
export class ConfirmPasswordReset {
  constructor(private readonly dependencies: ConfirmPasswordResetDependencies) {}

  async execute({ body, context }: { body: unknown; context: RequestContext }): Promise<void> {
    const {
      attemptLimiter,
      accessLinkRepository,
      secretTokenGenerator,
      passwordHasher,
      now,
      logger,
    } = this.dependencies;

    const attemptId = await reservePasswordResetAttempt(attemptLimiter, context, logger);

    const token = readAccessLinkToken(body);
    if (token === undefined) {
      throw this.linkInvalid('TOKEN_MISSING', context);
    }
    const tokenHash = secretTokenGenerator.hash(token);
    if ((await accessLinkRepository.findPendingPasswordReset(tokenHash, now())) === null) {
      throw this.linkInvalid('NOT_PENDING', context);
    }

    // A partir de aquí el enlace es válido: el intento no debe seguir contando.
    const parsed = parseFields(body, { password: USER_FIELD_SCHEMAS.password });
    if (!parsed.success) {
      await releasePasswordResetAttempt(attemptLimiter, attemptId, context, logger);
      throw new ValidationError(parsed.details);
    }

    const passwordHash = await passwordHasher.hash(parsed.data.password as string);
    const completed = await accessLinkRepository.resetPassword({
      tokenHash,
      now: now(),
      passwordHash,
    });
    if (completed === null) {
      // El enlace dejó de estar pendiente entre la comprobación y el cambio (otra confirmación, una
      // revocación, la caducidad o la baja del usuario): se comporta como cualquier enlace no válido.
      throw this.linkInvalid('NOT_PENDING', context);
    }

    await releasePasswordResetAttempt(attemptLimiter, attemptId, context, logger);
    logger.info(
      {
        event: 'PASSWORD_RESET_COMPLETED',
        school_id: completed.schoolId,
        user_id: completed.userId,
        revoked_sessions: completed.revokedSessions,
      },
      'Contraseña restablecida',
    );
  }

  private linkInvalid(reason: 'TOKEN_MISSING' | 'NOT_PENDING', context: RequestContext) {
    this.dependencies.logger.warn(
      { event: 'PASSWORD_RESET_REJECTED', reason: 'LINK_INVALID', ip: context.ip },
      'Restablecimiento rechazado: el enlace no es válido',
    );
    return new AccessLinkInvalid(reason);
  }
}
