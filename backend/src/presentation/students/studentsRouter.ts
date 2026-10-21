import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateStudent } from '../../application/students/createStudent.js';
import type { ListStudents } from '../../application/students/listStudents.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface StudentsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createStudent: Pick<CreateStudent, 'execute'>;
  listStudents: Pick<ListStudents, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de los alumnos del colegio bajo `/api/students`: crear uno y listar los del colegio (US14). Las
 * pueden usar los dos roles, así que solo exigen sesión (sin `requireRole`). Se autentican con el access
 * token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y quien actúa salen siempre
 * de la identidad leída de la base de datos, nunca de la petición.
 */
export function studentsRouter({
  authenticateRequest,
  createStudent,
  listStudents,
  logger,
}: StudentsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.post('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const student = await createStudent.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { student }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const students = await listStudents.execute({ schoolId });
    sendSuccess(res, { students });
  });

  return router;
}
