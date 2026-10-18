import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type {
  AcceptedInvitation,
  AccessLinkRepository,
} from '../../domain/accessLink/accessLinkRepository.js';
import { PRIVACY_POLICY_VERSION } from '../../domain/privacy/privacyPolicy.js';
import { EmailAlreadyRegistered } from '../../domain/registration/registrationErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { PasswordHasher } from '../credentials/passwordHasher.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { maskEmail } from '../registration/maskEmail.js';
import type { RequestContext } from '../requestContext.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { ValidationError } from '../validationError.js';
import { parseAcceptInvitationRequest, readInvitationToken } from './acceptInvitationRequest.js';
import { releaseInvitationAttempt, reserveInvitationAttempt } from './invitationAttempts.js';

export interface AcceptInvitationDependencies {
  attemptLimiter: Pick<AttemptLimiter, 'consume' | 'release'>;
  accessLinkRepository: Pick<AccessLinkRepository, 'findPendingInvitation' | 'acceptInvitation'>;
  secretTokenGenerator: Pick<SecretTokenGenerator, 'hash'>;
  passwordHasher: Pick<PasswordHasher, 'hash'>;
  idGenerator: IdGenerator;
  now: () => Date;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: la persona invitada crea su cuenta con el token de su enlace. Orden fijo:
 * 1. límite de intentos (`TooManyAttempts`);
 * 2. enlace pendiente (`AccessLinkInvalid`), antes que los campos para que nadie sin un enlace
 *    válido pueda preguntar si un email está registrado;
 * 3. validación de los campos con las reglas del registro (`ValidationError`);
 * 4. hash de la contraseña, fuera de cualquier transacción y solo con un enlace válido;
 * 5. alta atómica: marca la invitación como usada y crea el usuario en el colegio y con el rol de
 *    la invitación (`EmailAlreadyRegistered` la deja pendiente).
 *
 * El intento reservado se libera siempre que el enlace era válido (con éxito, campos inválidos o
 * email duplicado): solo cuentan los enlaces no válidos. No crea sesión.
 */
export class AcceptInvitation {
  constructor(private readonly dependencies: AcceptInvitationDependencies) {}

  async execute({
    body,
    context,
  }: {
    body: unknown;
    context: RequestContext;
  }): Promise<AcceptedInvitation> {
    const {
      attemptLimiter,
      accessLinkRepository,
      secretTokenGenerator,
      passwordHasher,
      idGenerator,
      now,
      logger,
    } = this.dependencies;

    const attemptId = await reserveInvitationAttempt(attemptLimiter, context, logger);

    const token = readInvitationToken(body);
    if (token === undefined) {
      throw this.linkInvalid('TOKEN_MISSING', context);
    }
    const tokenHash = secretTokenGenerator.hash(token);
    if ((await accessLinkRepository.findPendingInvitation(tokenHash, now())) === null) {
      throw this.linkInvalid('NOT_PENDING', context);
    }

    // A partir de aquí el enlace es válido: el intento no debe seguir contando.
    const parsed = parseAcceptInvitationRequest(body);
    if (!parsed.success) {
      await releaseInvitationAttempt(attemptLimiter, attemptId, context, logger);
      throw new ValidationError(parsed.details);
    }
    const { password, privacyPolicyAccepted: _accepted, ...fields } = parsed.data;

    const passwordHash = await passwordHasher.hash(password);
    const instant = now();
    let accepted: AcceptedInvitation | null;
    try {
      accepted = await accessLinkRepository.acceptInvitation({
        tokenHash,
        now: instant,
        newUser: {
          id: idGenerator.generate(),
          ...fields,
          passwordHash,
          privacyPolicyAcceptedAt: instant,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        },
      });
    } catch (error) {
      if (error instanceof EmailAlreadyRegistered) {
        await releaseInvitationAttempt(attemptLimiter, attemptId, context, logger);
        logger.warn(
          {
            event: 'INVITATION_ACCEPT_REJECTED',
            reason: 'EMAIL_ALREADY_REGISTERED',
            email: maskEmail(fields.email),
            ip: context.ip,
          },
          'Invitación rechazada: el email ya está registrado',
        );
      }
      throw error;
    }
    if (accepted === null) {
      // La invitación dejó de estar pendiente entre la comprobación y el alta (otra aceptación, una
      // revocación o la caducidad): se comporta como cualquier enlace no válido.
      throw this.linkInvalid('NOT_PENDING', context);
    }

    await releaseInvitationAttempt(attemptLimiter, attemptId, context, logger);
    logger.info(
      {
        event: 'INVITATION_ACCEPTED',
        school_id: accepted.school.id,
        invitation_id: accepted.invitationId,
        user_id: accepted.user.id,
        role: accepted.user.role,
      },
      'Invitación aceptada',
    );
    return accepted;
  }

  private linkInvalid(reason: 'TOKEN_MISSING' | 'NOT_PENDING', context: RequestContext) {
    this.dependencies.logger.warn(
      { event: 'INVITATION_ACCEPT_REJECTED', reason: 'LINK_INVALID', ip: context.ip },
      'Invitación rechazada: el enlace no es válido',
    );
    return new AccessLinkInvalid(reason);
  }
}
