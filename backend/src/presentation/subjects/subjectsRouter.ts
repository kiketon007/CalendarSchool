import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateSubject } from '../../application/subjects/createSubject.js';
import type { ListSubjects } from '../../application/subjects/listSubjects.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

export interface SubjectsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createSubject: Pick<CreateSubject, 'execute'>;
  listSubjects: Pick<ListSubjects, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de las asignaturas del colegio bajo `/api/subjects`: listarlas y crear una (US-SUBJECT). Como los
 * calendarios, tienen **lectura para los dos roles y escritura solo para `ADMIN`**: el `GET` solo exige
 * sesión y el `POST` añade `requireRole('ADMIN')`, que responde `403 FORBIDDEN` a un `MEMBER` antes de
 * validar el cuerpo. Se autentican con el access token y no con cookies, así que no usan
 * `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad leída de la base de datos,
 * nunca de la petición.
 */
export function subjectsRouter({
  authenticateRequest,
  createSubject,
  listSubjects,
  logger,
}: SubjectsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const subjects = await listSubjects.execute({ schoolId });
    sendSuccess(res, { subjects });
  });

  router.post('/', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const subject = await createSubject.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { subject }, 201);
  });

  return router;
}
