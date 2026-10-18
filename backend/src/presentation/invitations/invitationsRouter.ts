import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateInvitation } from '../../application/invitations/createInvitation.js';
import { parseCreateInvitationRequest } from '../../application/invitations/createInvitationRequest.js';
import type { ListPendingInvitations } from '../../application/invitations/listPendingInvitations.js';
import type { RevokeInvitation } from '../../application/invitations/revokeInvitation.js';
import { InvitationNotFound } from '../../domain/accessLink/accessLinkErrors.js';
import type { PendingInvitation } from '../../domain/accessLink/accessLinkRepository.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

export interface InvitationsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createInvitation: Pick<CreateInvitation, 'execute'>;
  listPendingInvitations: Pick<ListPendingInvitations, 'execute'>;
  revokeInvitation: Pick<RevokeInvitation, 'execute'>;
  logger: Logger;
}

const invitationIdSchema = z.uuid();

/** Un id que no es un UUID se trata como una invitación inexistente (`404`), sin llegar a la base de datos. */
function parseInvitationId(value: unknown): string {
  const parsed = invitationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvitationNotFound();
  }
  return parsed.data;
}

/** Invitación en el formato de la API: las fechas en ISO 8601. */
function toResponse(invitation: PendingInvitation) {
  return {
    ...invitation,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/**
 * Rutas de las invitaciones al colegio bajo `/api/invitations`, reservadas a los administradores:
 * generar, listar las pendientes y revocar (US02_b3). El `201` de la generación es la única
 * respuesta que lleva el enlace.
 */
export function invitationsRouter({
  authenticateRequest,
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
  logger,
}: InvitationsRouterDependencies): Router {
  const router = Router();

  // Primero la identidad (401) y después el rol (403), antes de validar nada. Sin
  // `requireAllowedOrigin`: se autentican con el access token, no con cookies, así que no hay CSRF.
  router.use(requireAuthentication(authenticateRequest, logger), requireRole('ADMIN', logger));

  router.post('/', async (req, res) => {
    // El colegio y quien invita salen de la identidad leída de la base de datos, nunca de la petición.
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const role = parseCreateInvitationRequest(req.body);
    const { invitation, url } = await createInvitation.execute({ schoolId, actorId, role });
    sendSuccess(res, { invitation: toResponse(invitation), url }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const invitations = await listPendingInvitations.execute({ schoolId });
    sendSuccess(res, invitations.map(toResponse));
  });

  router.post('/:id/revoke', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    await revokeInvitation.execute({
      schoolId,
      actorId,
      invitationId: parseInvitationId(req.params.id),
    });
    res.status(204).end();
  });

  return router;
}
