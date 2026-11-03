import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { GetScheduleReadiness } from '../../application/schedule/getScheduleReadiness.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface ScheduleRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  getScheduleReadiness: Pick<GetScheduleReadiness, 'execute'>;
  logger: Logger;
}

/**
 * Generación de horarios bajo `/api/schedule`. Por ahora solo la comprobación previa (US-ALGO-CHECK): una lectura para
 * los dos roles (`ADMIN` y `MEMBER`), solo con sesión; US-ALGO-RUN añadirá aquí crear, consultar y cancelar una
 * generación. Se autentica con el access token y no usa `requireAllowedOrigin`. El colegio sale siempre de la
 * identidad leída de la base de datos, nunca de la petición.
 */
export function scheduleRouter({
  authenticateRequest,
  getScheduleReadiness,
  logger,
}: ScheduleRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/readiness', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const readiness = await getScheduleReadiness.execute({ schoolId });
    sendSuccess(res, { readiness });
  });

  return router;
}
