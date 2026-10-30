import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { GetCourseWorkload } from '../../application/workload/getCourseWorkload.js';
import type { UpdateCourseWorkload } from '../../application/workload/updateCourseWorkload.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
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

export interface WorkloadRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  getCourseWorkload: Pick<GetCourseWorkload, 'execute'>;
  updateCourseWorkload: Pick<UpdateCourseWorkload, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de la carga horaria de un curso bajo `/api/courses/:id/workload` (US19): leerla y cambiarla. Se monta
 * **antes** que el router de cursos y con `mergeParams` para leer el `id` de la ruta. Como los calendarios y las
 * asignaturas, tiene **lectura para los dos roles y escritura solo para `ADMIN`**: el `GET` solo exige sesión
 * y el `PATCH` añade `requireRole('ADMIN')`, que responde `403 FORBIDDEN` a un `MEMBER` antes de leer el `id`
 * o validar el cuerpo (así no se revela si el curso existe). Se autentican con el access token y no con
 * cookies, así que no usan `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad
 * leída de la base de datos, nunca de la petición.
 */
export function workloadRouter({
  authenticateRequest,
  getCourseWorkload,
  updateCourseWorkload,
  logger,
}: WorkloadRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  // Con `mergeParams` el `id` llega del punto de montaje; Express no lo tipa en un router suelto.
  const courseIdOf = (params: object) => parseCourseId((params as { id?: unknown }).id);

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const workload = await getCourseWorkload.execute({
      schoolId,
      courseId: courseIdOf(req.params),
    });
    sendSuccess(res, { workload });
  });

  router.patch('/', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // Rol → id → cuerpo: un `MEMBER` recibe `403` antes de mirar el id, y un valor que no es UUID es un `404`
    // sin mirar el cuerpo; el caso de uso valida el cuerpo.
    const workload = await updateCourseWorkload.execute({
      schoolId,
      actorId,
      courseId: courseIdOf(req.params),
      body: req.body,
    });
    sendSuccess(res, { workload });
  });

  return router;
}
