import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateProfessor } from '../../application/professors/createProfessor.js';
import type { ListProfessors } from '../../application/professors/listProfessors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface ProfessorsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createProfessor: Pick<CreateProfessor, 'execute'>;
  listProfessors: Pick<ListProfessors, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de los profesores del colegio bajo `/api/professors`: crear uno y listar los del colegio (US09).
 * Las pueden usar los dos roles, así que solo exigen sesión (sin `requireRole`). Se autentican con el
 * access token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y quien actúa salen
 * siempre de la identidad leída de la base de datos, nunca de la petición.
 */
export function professorsRouter({
  authenticateRequest,
  createProfessor,
  listProfessors,
  logger,
}: ProfessorsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.post('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const professor = await createProfessor.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { professor }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const professors = await listProfessors.execute({ schoolId });
    sendSuccess(res, { professors });
  });

  return router;
}
