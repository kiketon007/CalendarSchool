import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { ListSchoolUsers } from '../../application/users/listSchoolUsers.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

export interface UsersRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  listSchoolUsers: Pick<ListSchoolUsers, 'execute'>;
  logger: Logger;
}

/** Rutas de los usuarios del colegio bajo `/api/users`, reservadas a los administradores (US02_b1). */
export function usersRouter({
  authenticateRequest,
  listSchoolUsers,
  logger,
}: UsersRouterDependencies): Router {
  const router = Router();

  // Primero la identidad (401) y después el rol (403). Sin `requireAllowedOrigin`: estos endpoints se
  // autentican con el access token, no con cookies, así que no hay riesgo de CSRF.
  router.use(requireAuthentication(authenticateRequest, logger), requireRole('ADMIN', logger));

  router.get('/', async (_req, res) => {
    // El colegio sale de la identidad leída de la base de datos, nunca de la petición.
    const { schoolId } = getAuthenticatedUser(res);
    const users = await listSchoolUsers.execute({ schoolId });
    sendSuccess(
      res,
      users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() })),
    );
  });

  return router;
}
