import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateCourse } from '../../application/courses/createCourse.js';
import type { ListCourses } from '../../application/courses/listCourses.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface CoursesRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createCourse: Pick<CreateCourse, 'execute'>;
  listCourses: Pick<ListCourses, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de los cursos del colegio bajo `/api/courses` (US05): crear un curso con sus clases y listar
 * los del colegio. Las pueden usar los dos roles, así que solo exigen sesión (sin `requireRole`). Se
 * autentican con el access token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y
 * quien actúa salen siempre de la identidad leída de la base de datos, nunca de la petición.
 */
export function coursesRouter({
  authenticateRequest,
  createCourse,
  listCourses,
  logger,
}: CoursesRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.post('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const course = await createCourse.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { course }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const courses = await listCourses.execute({ schoolId });
    sendSuccess(res, { courses });
  });

  return router;
}
