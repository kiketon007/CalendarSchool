import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateProfessor } from '../../application/professors/createProfessor.js';
import type { DeleteProfessor } from '../../application/professors/deleteProfessor.js';
import type { GetProfessor } from '../../application/professors/getProfessor.js';
import type { GetProfessorAvailability } from '../../application/professors/getProfessorAvailability.js';
import type { ListProfessors } from '../../application/professors/listProfessors.js';
import type { UpdateProfessor } from '../../application/professors/updateProfessor.js';
import type { UpdateProfessorAvailability } from '../../application/professors/updateProfessorAvailability.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface ProfessorsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createProfessor: Pick<CreateProfessor, 'execute'>;
  listProfessors: Pick<ListProfessors, 'execute'>;
  getProfessor: Pick<GetProfessor, 'execute'>;
  updateProfessor: Pick<UpdateProfessor, 'execute'>;
  deleteProfessor: Pick<DeleteProfessor, 'execute'>;
  getProfessorAvailability: Pick<GetProfessorAvailability, 'execute'>;
  updateProfessorAvailability: Pick<UpdateProfessorAvailability, 'execute'>;
  logger: Logger;
}

const professorIdSchema = z.uuid();

/** Un id que no es un UUID se trata como un profesor inexistente (`404`), sin llegar a la base de datos. */
function parseProfessorId(value: unknown): string {
  const parsed = professorIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProfessorNotFound();
  }
  return parsed.data;
}

/**
 * Rutas de los profesores del colegio bajo `/api/professors`: crear uno y listar los del colegio (US09), y
 * leer y editar uno por su id (US12), borrarlo (US13) y leer y guardar su disponibilidad (US-PROF-AVAIL).
 * Las pueden usar los dos roles, así que solo exigen sesión (sin `requireRole`). Se autentican con el
 * access token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y quien actúa salen
 * siempre de la identidad leída de la base de datos, nunca de la petición.
 */
export function professorsRouter({
  authenticateRequest,
  createProfessor,
  listProfessors,
  getProfessor,
  updateProfessor,
  deleteProfessor,
  getProfessorAvailability,
  updateProfessorAvailability,
  logger,
}: ProfessorsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.post('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const professor = await createProfessor.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { professor }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const professors = await listProfessors.execute({ schoolId });
    sendSuccess(res, { professors });
  });

  router.get('/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const professor = await getProfessor.execute({
      schoolId,
      professorId: parseProfessorId(req.params.id),
    });
    sendSuccess(res, { professor });
  });

  router.put('/:id', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El id se valida antes que el cuerpo; el caso de uso valida el cuerpo.
    const result = await updateProfessor.execute({
      schoolId,
      actorId,
      professorId: parseProfessorId(req.params.id),
      body: req.body,
    });
    sendSuccess(res, result);
  });

  router.delete('/:id', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const deleted = await deleteProfessor.execute({
      schoolId,
      actorId,
      professorId: parseProfessorId(req.params.id),
    });
    sendSuccess(res, { deleted });
  });

  router.get('/:id/availability', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const availability = await getProfessorAvailability.execute({
      schoolId,
      professorId: parseProfessorId(req.params.id),
    });
    sendSuccess(res, { availability });
  });

  router.put('/:id/availability', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El id se valida antes que el cuerpo; el caso de uso valida el cuerpo.
    const availability = await updateProfessorAvailability.execute({
      schoolId,
      actorId,
      professorId: parseProfessorId(req.params.id),
      body: req.body,
    });
    sendSuccess(res, { availability });
  });

  return router;
}
