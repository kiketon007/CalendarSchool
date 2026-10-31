import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { GetCourseAssignments } from '../../application/assignments/getCourseAssignments.js';
import type { UpdateCourseAssignments } from '../../application/assignments/updateCourseAssignments.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

const courseIdSchema = z.uuid();

/**
 * Lee el `id` del curso de la ruta. Un valor que no es un UUID se trata como un curso que no existe (`404`),
 * igual que el de otro colegio, y no llega al caso de uso ni a la base de datos.
 */
function parseCourseId(value: unknown): string {
  const parsed = courseIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CourseNotFound();
  }
  return parsed.data;
}

export interface AssignmentsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  getCourseAssignments: Pick<GetCourseAssignments, 'execute'>;
  updateCourseAssignments: Pick<UpdateCourseAssignments, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de los profesores de un curso bajo `/api/courses/:id/assignments` (US-PROF-ASSIGN): leer la matriz y
 * guardar su estado final. Se monta **antes** que el router de cursos y con `mergeParams` para leer el `id` de la
 * ruta, como la carga horaria. Las pueden usar los dos roles (`ADMIN` y `MEMBER`), así que solo exigen sesión
 * (sin `requireRole`): es un dato de los profesores, que los dos gestionan. Se autentican con el access token y no
 * con cookies, así que no usan `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad
 * leída de la base de datos, nunca de la petición. El `id` se valida antes que el cuerpo.
 */
export function assignmentsRouter({
  authenticateRequest,
  getCourseAssignments,
  updateCourseAssignments,
  logger,
}: AssignmentsRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  // Con `mergeParams` el `id` llega del punto de montaje; Express no lo tipa en un router suelto.
  const courseIdOf = (params: object) => parseCourseId((params as { id?: unknown }).id);

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const assignments = await getCourseAssignments.execute({
      schoolId,
      courseId: courseIdOf(req.params),
    });
    sendSuccess(res, { assignments });
  });

  router.put('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El id se valida antes que el cuerpo; el caso de uso valida el cuerpo.
    const assignments = await updateCourseAssignments.execute({
      schoolId,
      actorId,
      courseId: courseIdOf(req.params),
      body: req.body,
    });
    sendSuccess(res, { assignments });
  });

  return router;
}
