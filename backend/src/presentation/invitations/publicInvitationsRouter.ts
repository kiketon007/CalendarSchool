import { Router } from 'express';
import type { AcceptInvitation } from '../../application/invitations/acceptInvitation.js';
import type { LookupInvitation } from '../../application/invitations/lookupInvitation.js';
import { requestContext } from '../http/requestContext.js';
import { sendSuccess } from '../http/responses.js';

export interface PublicInvitationsRouterDependencies {
  lookupInvitation: Pick<LookupInvitation, 'execute'>;
  acceptInvitation: Pick<AcceptInvitation, 'execute'>;
}

/**
 * Rutas públicas de las invitaciones bajo `/api/invitations`, para la persona invitada (US02_b4):
 * consultar el colegio y el rol, y aceptar. Se autentican con el token del enlace, que viaja en el
 * cuerpo, así que no usan `Authorization` ni cookies ni `requireAllowedOrigin` (no hay CSRF que
 * proteger). Se montan **antes** que el router de los administradores, que exige sesión en todas
 * sus rutas.
 */
export function publicInvitationsRouter({
  lookupInvitation,
  acceptInvitation,
}: PublicInvitationsRouterDependencies): Router {
  const router = Router();

  router.post('/lookup', async (req, res) => {
    const { schoolName, role } = await lookupInvitation.execute({
      body: req.body,
      context: requestContext(req),
    });
    sendSuccess(res, { school: { name: schoolName }, role });
  });

  router.post('/accept', async (req, res) => {
    // El id de la invitación solo sirve para el log: no sale en la respuesta. Tampoco se crea sesión.
    const { user, school } = await acceptInvitation.execute({
      body: req.body,
      context: requestContext(req),
    });
    sendSuccess(res, { user, school }, 201);
  });

  return router;
}
