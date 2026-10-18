import type {
  AccessLinkRepository,
  PendingInvitation,
} from '../../domain/accessLink/accessLinkRepository.js';

export interface ListPendingInvitationsDependencies {
  accessLinkRepository: Pick<AccessLinkRepository, 'listPendingInvitations'>;
  now: () => Date;
}

/**
 * Caso de uso: lista las invitaciones pendientes de un colegio (no usadas, no revocadas y no
 * caducadas en este instante). El colegio lo toma el router de la identidad de la petición. Listar no
 * genera evento.
 */
export class ListPendingInvitations {
  constructor(private readonly dependencies: ListPendingInvitationsDependencies) {}

  execute({ schoolId }: { schoolId: string }): Promise<PendingInvitation[]> {
    const { accessLinkRepository, now } = this.dependencies;
    return accessLinkRepository.listPendingInvitations(schoolId, now());
  }
}
