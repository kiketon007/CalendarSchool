import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CancelGeneration } from '../../application/schedule/cancelGeneration.js';
import type { GetCurrentGeneration } from '../../application/schedule/getCurrentGeneration.js';
import type { GetGeneration } from '../../application/schedule/getGeneration.js';
import type { ConfirmSchedule } from '../../application/schedule/confirmSchedule.js';
import type { DiscardScheduleDraft } from '../../application/schedule/discardScheduleDraft.js';
import type { GetSchedule } from '../../application/schedule/getSchedule.js';
import type { GetScheduleOverview } from '../../application/schedule/getScheduleOverview.js';
import type { GetScheduleReadiness } from '../../application/schedule/getScheduleReadiness.js';
import type { ListPreviousSchedules } from '../../application/schedule/listPreviousSchedules.js';
import type { StartGeneration } from '../../application/schedule/startGeneration.js';
import { ValidationError } from '../../application/validationError.js';
import { GenerationNotFound } from '../../domain/schedule/generationErrors.js';
import { ScheduleNotFound } from '../../domain/schedule/scheduleErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';
import { parseStartGenerationRequest } from './startGenerationRequest.js';

export interface ScheduleRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  getScheduleReadiness: Pick<GetScheduleReadiness, 'execute'>;
  startGeneration: Pick<StartGeneration, 'execute'>;
  getCurrentGeneration: Pick<GetCurrentGeneration, 'execute'>;
  getGeneration: Pick<GetGeneration, 'execute'>;
  cancelGeneration: Pick<CancelGeneration, 'execute'>;
  getSchedule: Pick<GetSchedule, 'execute'>;
  getScheduleOverview: Pick<GetScheduleOverview, 'execute'>;
  listPreviousSchedules: Pick<ListPreviousSchedules, 'execute'>;
  confirmSchedule: Pick<ConfirmSchedule, 'execute'>;
  discardScheduleDraft: Pick<DiscardScheduleDraft, 'execute'>;
  logger: Logger;
}

const generationIdSchema = z.uuid();

/** Un id que no es un UUID se trata como un horario inexistente (`404`), sin llegar a la base de datos. */
function parseScheduleId(value: unknown): string {
  const parsed = generationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ScheduleNotFound();
  }
  return parsed.data;
}

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
  getSchedule,
  getScheduleOverview,
  listPreviousSchedules,
  confirmSchedule,
  discardScheduleDraft,
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
    const schedule = await getSchedule.execute({ schoolId, which: 'draft' });
    sendSuccess(res, { schedule });
  });

  // El horario oficial vigente (US-ALGO-CONFIRM): lectura para los dos roles, con la misma forma que el borrador.
  router.get('/official', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const schedule = await getSchedule.execute({ schoolId, which: 'official' });
    sendSuccess(res, { schedule });
  });

  // Qué horarios tiene el colegio (el borrador, el oficial vigente y cuántos se sustituyeron), sin sus entradas.
  router.get('/overview', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const overview = await getScheduleOverview.execute({ schoolId });
    sendSuccess(res, overview);
  });

  // Los horarios oficiales anteriores (US-ALGO-CONFIRM_b): las cabeceras de los sustituidos, para los dos roles.
  router.get('/previous', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const schedules = await listPreviousSchedules.execute({ schoolId });
    sendSuccess(res, { schedules });
  });

  // El cuerpo es opcional (`{ improve? }`) y se lee después de comprobar el rol: un `MEMBER` recibe `403` aunque sea inválido.
  router.post('/generate', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const parsed = parseStartGenerationRequest(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const generation = await startGeneration.execute({
      schoolId,
      actorId,
      improve: parsed.data.improve,
    });
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

  // Un horario oficial por su id, vigente o sustituido (US-ALGO-CONFIRM_b): lectura para los dos roles. Va después de
  // todas las rutas literales. Un borrador, un id de otro colegio, uno inexistente o uno que no es un UUID son un
  // horario inexistente (`404`).
  router.get('/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const schedule = await getSchedule.execute({
      schoolId,
      which: { id: parseScheduleId(req.params.id) },
    });
    if (schedule === null) {
      throw new ScheduleNotFound();
    }
    sendSuccess(res, { schedule });
  });

  // Confirmar el borrador como oficial y descartarlo (US-ALGO-CONFIRM): solo el administrador. Las rutas literales de
  // arriba van antes, y un id que no es un UUID es un horario inexistente (`404`) sin llegar al caso de uso.
  router.post('/:id/confirm', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const schedule = await confirmSchedule.execute({
      schoolId,
      actorId,
      scheduleId: parseScheduleId(req.params.id),
    });
    sendSuccess(res, { schedule });
  });

  router.delete('/:id', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    await discardScheduleDraft.execute({
      schoolId,
      actorId,
      scheduleId: parseScheduleId(req.params.id),
    });
    res.status(204).end();
  });

  return router;
}
