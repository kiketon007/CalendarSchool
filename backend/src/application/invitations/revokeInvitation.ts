import { InvitationNotFound } from '../../domain/accessLink/accessLinkErrors.js';
import type { AccessLinkRepository } from '../../domain/accessLink/accessLinkRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface RevokeInvitationDependencies {
  accessLinkRepository: Pick<AccessLinkRepository, 'revokeInvitation'>;
  now: () => Date;
  logger: ApplicationLogger;
}

export interface RevokeInvitationInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que revoca, de la identidad de la petición. */
  actorId: string;
  invitationId: string;
}

/**
 * Caso de uso: revoca una invitación pendiente del colegio. Es idempotente: si ya no está pendiente
 * (revocada, usada o caducada) termina sin error, sin cambios y sin evento. Registra
 * `INVITATION_REVOKED` solo cuando revoca.
 *
 * @throws InvitationNotFound si no es una invitación de este colegio (otro colegio, inexistente o con otro propósito)
 */
export class RevokeInvitation {
  constructor(private readonly dependencies: RevokeInvitationDependencies) {}

  async execute({ schoolId, actorId, invitationId }: RevokeInvitationInput): Promise<void> {
    const { accessLinkRepository, now, logger } = this.dependencies;

    const result = await accessLinkRepository.revokeInvitation(schoolId, invitationId, now());
    if (result === null) {
      throw new InvitationNotFound();
    }
    if (result === 'revoked') {
      logger.info(
        {
          event: 'INVITATION_REVOKED',
          school_id: schoolId,
          actor_id: actorId,
          invitation_id: invitationId,
        },
        'Invitación revocada',
      );
    }
  }
}
