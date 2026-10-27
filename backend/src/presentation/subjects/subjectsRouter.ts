import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateSubject } from '../../application/subjects/createSubject.js';
import type { GetSubject } from '../../application/subjects/getSubject.js';
import type { ListSubjects } from '../../application/subjects/listSubjects.js';
import type { UpdateSubject } from '../../application/subjects/updateSubject.js';
import { SubjectNotFound } from '../../domain/subject/subjectErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

const subjectIdSchema = z.uuid();

/**
 * Lee el `id` de la ruta. Un valor que no es un UUID se trata como una asignatura que no existe (`404`),
 * igual que la de otro colegio, y no llega al caso de uso ni a la base de datos.
 */
function parseSubjectId(value: unknown): string {
  const parsed = subjectIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new SubjectNotFound();
  }
  return parsed.data;
}

export interface SubjectsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createSubject: Pick<CreateSubject, 'execute'>;
  listSubjects: Pick<ListSubjects, 'execute'>;
  getSubject: Pick<GetSubject, 'execute'>;
  updateSubject: Pick<UpdateSubject, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de las asignaturas del colegio bajo `/api/subjects`: listarlas y crear una (US-SUBJECT), y leer y
 * editar una por su id (US-SUBJECT_b). Como los calendarios, tienen **lectura para los dos roles y escritura
 * solo para `ADMIN`**: los `GET` solo exigen sesión y el `POST` y el `PUT` añaden `requireRole('ADMIN')`, que
 * responde `403 FORBIDDEN` a un `MEMBER` antes de leer el `id` o validar el cuerpo (así no se revela si la
 * asignatura existe). Se autentican con el access token y no con cookies, así que no usan
 * `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad leída de la base de datos,
 * nunca de la petición.
 */
export function subjectsRouter({
  authenticateRequest,
  createSubject,
  listSubjects,
  getSubject,
  updateSubject,
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

  router.get('/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const subject = await getSubject.execute({
      schoolId,
      subjectId: parseSubjectId(req.params.id),
    });
    sendSuccess(res, { subject });
  });

  router.put('/:id', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // Primero el id (un valor que no es UUID es un `404` y no se mira el cuerpo); el caso de uso valida el cuerpo.
    const subject = await updateSubject.execute({
      schoolId,
      actorId,
      subjectId: parseSubjectId(req.params.id),
      body: req.body,
    });
    sendSuccess(res, { subject });
  });

  return router;
}
