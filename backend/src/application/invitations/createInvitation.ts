import { accessLinkExpiresAt } from '../../domain/accessLink/accessLink.js';
import type {
  AccessLinkRepository,
  PendingInvitation,
} from '../../domain/accessLink/accessLinkRepository.js';
import type { UserRole } from '../../domain/user/user.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';

export interface CreateInvitationDependencies {
  accessLinkRepository: Pick<AccessLinkRepository, 'createInvitation'>;
  secretTokenGenerator: Pick<SecretTokenGenerator, 'generate'>;
  idGenerator: IdGenerator;
  /** Origen de la aplicación (`APP_ORIGIN`, sin barra final): el enlace apunta a su página de invitación. */
  appOrigin: string;
  now: () => Date;
  logger: ApplicationLogger;
}

export interface CreateInvitationInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que genera la invitación, de la identidad de la petición. */
  actorId: string;
  role: UserRole;
}

export interface CreatedInvitation {
  readonly invitation: PendingInvitation;
  /** Enlace completo con el token en el fragmento. Solo existe en esta respuesta: no se guarda ni se registra. */
  readonly url: string;
}

/**
 * Caso de uso: genera una invitación al colegio. El token es aleatorio y solo se guarda su hash; el
 * enlace (`<origen>/invitacion#<token>`) se construye aquí y se devuelve una única vez. El fragmento
 * no lo envía el navegador al servidor, así que no queda en los logs de acceso ni en `Referer`.
 * Registra `INVITATION_CREATED` sin el token, su hash ni el enlace.
 */
export class CreateInvitation {
  constructor(private readonly dependencies: CreateInvitationDependencies) {}

  async execute({ schoolId, actorId, role }: CreateInvitationInput): Promise<CreatedInvitation> {
    const { accessLinkRepository, secretTokenGenerator, idGenerator, appOrigin, now, logger } =
      this.dependencies;

    const { token, hash } = secretTokenGenerator.generate();
    const invitation = await accessLinkRepository.createInvitation({
      id: idGenerator.generate(),
      schoolId,
      tokenHash: hash,
      role,
      createdById: actorId,
      expiresAt: accessLinkExpiresAt(now()),
    });

    logger.info(
      {
        event: 'INVITATION_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        invitation_id: invitation.id,
        role,
      },
      'Invitación generada',
    );
    return { invitation, url: `${appOrigin}/invitacion#${token}` };
  }
}
