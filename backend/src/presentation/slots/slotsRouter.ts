import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { GetSubjectSlots } from '../../application/slots/getSubjectSlots.js';
import type { UpdateSubjectSlots } from '../../application/slots/updateSubjectSlots.js';
import { SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { SlotRuleType } from '../../domain/slots/subjectSlots.js';
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
  getSubjectSlots: Pick<GetSubjectSlots, 'execute'>;
  updateSubjectSlots: Pick<UpdateSubjectSlots, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de las franjas de una asignatura en un curso, bajo `/api/courses/:courseId/subjects/:subjectId`: las
 * prohibidas en `/forbidden-slots` (US19_c) y las preferidas en `/preferred-slots` (US19_d), cada una para leerlas
 * y guardarlas. Las dos rutas son el mismo manejador con el tipo de regla fijo. Se monta **antes** que el router de
 * cursos y con `mergeParams` para leer los dos `id` de la ruta. **Lectura para los dos roles y escritura solo para `ADMIN`**: el `GET` solo exige sesión y el
 * `PUT` añade `requireRole('ADMIN')`, que responde `403 FORBIDDEN` a un `MEMBER` antes de leer los `id` o
 * validar el cuerpo (así no se revela si existen). Se autentican con el access token y no con cookies, así que
 * no usan `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad leída de la base de
 * datos, nunca de la petición.
 */
export function slotsRouter({
  authenticateRequest,
  getSubjectSlots,
  updateSubjectSlots,
  logger,
}: SlotsRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  // Con `mergeParams` los `id` llegan del punto de montaje; Express no los tipa en un router suelto.
  const idsOf = (params: object) => {
    const { courseId, subjectId } = params as { courseId?: unknown; subjectId?: unknown };
    return { courseId: parseId(courseId), subjectId: parseId(subjectId) };
  };

  router.use(requireAuthentication(authenticateRequest, logger));

  const routes: [path: string, type: SlotRuleType][] = [
    ['/forbidden-slots', 'FORBIDDEN_SLOTS'],
    ['/preferred-slots', 'PREFERRED_SLOTS'],
  ];

  for (const [path, type] of routes) {
    router.get(path, async (req, res) => {
      const { schoolId } = getAuthenticatedUser(res);
      const slotRule = await getSubjectSlots.execute({ schoolId, ...idsOf(req.params), type });
      sendSuccess(res, { slotRule });
    });

    router.put(path, requireRole('ADMIN', logger), async (req, res) => {
      const { schoolId, userId: actorId } = getAuthenticatedUser(res);
      // Rol → ids → cuerpo: un `MEMBER` recibe `403` antes de mirar los ids, y un valor que no es UUID es un
      // `404` sin mirar el cuerpo; el caso de uso valida el cuerpo.
      const slotRule = await updateSubjectSlots.execute({
        schoolId,
        actorId,
        ...idsOf(req.params),
        type,
        body: req.body,
      });
      sendSuccess(res, { slotRule });
    });
  }

  return router;
}
