import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { GetForbiddenSlots } from '../../application/slots/getForbiddenSlots.js';
import type { UpdateForbiddenSlots } from '../../application/slots/updateForbiddenSlots.js';
import { SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

const idSchema = z.uuid();

/**
 * Lee un `id` de la ruta. Un valor que no es un UUID se trata como un curso o una asignatura que no existen
 * (`404`), igual que los de otro colegio, y no llega al caso de uso ni a la base de datos.
 */
function parseId(value: unknown): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new SubjectCourseNotFound();
  }
  return parsed.data;
}

export interface SlotsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  getForbiddenSlots: Pick<GetForbiddenSlots, 'execute'>;
  updateForbiddenSlots: Pick<UpdateForbiddenSlots, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de las franjas prohibidas de una asignatura en un curso, bajo
 * `/api/courses/:courseId/subjects/:subjectId/forbidden-slots` (US19_c): leerlas y guardarlas. Se monta **antes**
 * que el router de cursos y con `mergeParams` para leer los dos `id` de la ruta; US19_d añadirá aquí las
 * preferidas. **Lectura para los dos roles y escritura solo para `ADMIN`**: el `GET` solo exige sesión y el
 * `PUT` añade `requireRole('ADMIN')`, que responde `403 FORBIDDEN` a un `MEMBER` antes de leer los `id` o
 * validar el cuerpo (así no se revela si existen). Se autentican con el access token y no con cookies, así que
 * no usan `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad leída de la base de
 * datos, nunca de la petición.
 */
export function slotsRouter({
  authenticateRequest,
  getForbiddenSlots,
  updateForbiddenSlots,
  logger,
}: SlotsRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  // Con `mergeParams` los `id` llegan del punto de montaje; Express no los tipa en un router suelto.
  const idsOf = (params: object) => {
    const { courseId, subjectId } = params as { courseId?: unknown; subjectId?: unknown };
    return { courseId: parseId(courseId), subjectId: parseId(subjectId) };
  };

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/forbidden-slots', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const slotRule = await getForbiddenSlots.execute({ schoolId, ...idsOf(req.params) });
    sendSuccess(res, { slotRule });
  });

  router.put('/forbidden-slots', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // Rol → ids → cuerpo: un `MEMBER` recibe `403` antes de mirar los ids, y un valor que no es UUID es un
    // `404` sin mirar el cuerpo; el caso de uso valida el cuerpo.
    const slotRule = await updateForbiddenSlots.execute({
      schoolId,
      actorId,
      ...idsOf(req.params),
      body: req.body,
    });
    sendSuccess(res, { slotRule });
  });

  return router;
}
