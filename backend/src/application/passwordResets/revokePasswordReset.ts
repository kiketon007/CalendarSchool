import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import { UserNotFound } from '../../domain/user/userManagementErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface RevokePasswordResetDependencies {
  accessLinkRepository: Pick<AccessLinkRepository, 'revokePasswordReset'>;
  now: () => Date;
  logger: ApplicationLogger;
}

export interface RevokePasswordResetInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que revoca, de la identidad de la petición. */
  actorId: string;
  /** Usuario cuyo restablecimiento pendiente se revoca. */
  userId: string;
}

/**
 * Caso de uso: revoca el restablecimiento pendiente de un usuario del colegio. Es idempotente: si el
 * usuario no tiene ninguno pendiente termina sin error, sin cambios y sin evento. Registra
 * `PASSWORD_RESET_LINK_REVOKED` solo cuando revoca.
 *
 * @throws UserNotFound si el usuario no es de este colegio, no existe o está eliminado
 */
export class RevokePasswordReset {
  constructor(private readonly dependencies: RevokePasswordResetDependencies) {}

  async execute({ schoolId, actorId, userId }: RevokePasswordResetInput): Promise<void> {
    const { accessLinkRepository, now, logger } = this.dependencies;

    const result = await accessLinkRepository.revokePasswordReset(schoolId, userId, now());
    if (result === 'notFound') {
      throw new UserNotFound();
    }
    if (result === 'revoked') {
      logger.info(
        {
          event: 'PASSWORD_RESET_LINK_REVOKED',
          school_id: schoolId,
          actor_id: actorId,
          user_id: userId,
        },
        'Enlace de restablecimiento de contraseña revocado',
      );
    }
  }
}
