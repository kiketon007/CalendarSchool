import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { ListConstraints } from '../../application/constraints/listConstraints.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface ConstraintsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  listConstraints: Pick<ListConstraints, 'execute'>;
  logger: Logger;
}

/**
 * Listado de las reglas de reparto del colegio bajo `/api/constraints` (US20): una lectura para los dos roles
 * (`ADMIN` y `MEMBER`), solo con sesión. Las reglas se editan en la carga de cada curso y en sus cuadrículas. Se
 * autentica con el access token y no usa `requireAllowedOrigin`. El colegio sale siempre de la identidad leída
 * de la base de datos, nunca de la petición.
 */
export function constraintsRouter({
  authenticateRequest,
  listConstraints,
  logger,
}: ConstraintsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const constraints = await listConstraints.execute({ schoolId });
    sendSuccess(res, { constraints });
  });

  return router;
}
