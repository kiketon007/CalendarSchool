import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CancelGeneration } from '../../application/schedule/cancelGeneration.js';
import type { GetCurrentGeneration } from '../../application/schedule/getCurrentGeneration.js';
import type { GetGeneration } from '../../application/schedule/getGeneration.js';
import type { GetScheduleDraft } from '../../application/schedule/getScheduleDraft.js';
import type { GetScheduleReadiness } from '../../application/schedule/getScheduleReadiness.js';
import type { StartGeneration } from '../../application/schedule/startGeneration.js';
import { GenerationNotFound } from '../../domain/schedule/generationErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

export interface ScheduleRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  getScheduleReadiness: Pick<GetScheduleReadiness, 'execute'>;
  startGeneration: Pick<StartGeneration, 'execute'>;
  getCurrentGeneration: Pick<GetCurrentGeneration, 'execute'>;
  getGeneration: Pick<GetGeneration, 'execute'>;
  cancelGeneration: Pick<CancelGeneration, 'execute'>;
  getScheduleDraft: Pick<GetScheduleDraft, 'execute'>;
  logger: Logger;
}

const generationIdSchema = z.uuid();

/** Un id que no es un UUID se trata como una generación inexistente (`404`), sin llegar a la base de datos. */
function parseGenerationId(value: unknown): string {
  const parsed = generationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new GenerationNotFound();
  }
  return parsed.data;
}

/**
 * Generación de horarios bajo `/api/schedule`: la comprobación previa (US-ALGO-CHECK, una lectura para los dos roles)
 * y la generación en segundo plano (US-ALGO-RUN): iniciarla (`POST /generate`, `202`), leer la actual
 * (`GET /generate`) o una por su id (`GET /generate/:id`) y cancelarla (`DELETE /generate/:id`). Iniciar y cancelar
 * son solo del rol `ADMIN` (`requireRole`, que responde `403`); leer lo ven los dos roles. Se autentica con el access
 * token y no usa `requireAllowedOrigin`. El colegio y quien actúa salen siempre de la identidad leída de la base de
 * datos, nunca de la petición.
 */
export function scheduleRouter({
  authenticateRequest,
  getScheduleReadiness,
  startGeneration,
  getCurrentGeneration,
  getGeneration,
  cancelGeneration,
  getScheduleDraft,
  logger,
}: ScheduleRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/readiness', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const readiness = await getScheduleReadiness.execute({ schoolId });
    sendSuccess(res, { readiness });
  });

  // El horario borrador del colegio para verlo (US-ALGO-VIEW): solo lectura, para los dos roles.
  router.get('/draft', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const schedule = await getScheduleDraft.execute({ schoolId });
    sendSuccess(res, { schedule });
  });

  router.post('/generate', requireRole('ADMIN', logger), async (_req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const generation = await startGeneration.execute({ schoolId, actorId });
    sendSuccess(res, { generation }, 202);
  });

  router.get('/generate', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const generation = await getCurrentGeneration.execute({ schoolId });
    sendSuccess(res, { generation });
  });

  router.get('/generate/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const generation = await getGeneration.execute({
      schoolId,
      generationId: parseGenerationId(req.params.id),
    });
    sendSuccess(res, { generation });
  });

  router.delete('/generate/:id', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const generation = await cancelGeneration.execute({
      schoolId,
      actorId,
      generationId: parseGenerationId(req.params.id),
    });
    sendSuccess(res, { generation });
  });

  return router;
}
