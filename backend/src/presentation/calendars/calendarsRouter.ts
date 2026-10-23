import { Router } from 'express';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateCalendar } from '../../application/calendars/createCalendar.js';
import type { ListCalendars } from '../../application/calendars/listCalendars.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

export interface CalendarsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createCalendar: Pick<CreateCalendar, 'execute'>;
  listCalendars: Pick<ListCalendars, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de los calendarios base del colegio bajo `/api/calendars` (US-BASE): listarlos y crear uno. Es el
 * primer recurso con **lectura para los dos roles y escritura solo para `ADMIN`**: `GET` solo exige sesión y
 * `POST` añade `requireRole('ADMIN')`, que responde `403 FORBIDDEN` a un `MEMBER` antes de validar el cuerpo. Se
 * autentican con el access token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y
 * quien actúa salen siempre de la identidad leída de la base de datos, nunca de la petición.
 */
export function calendarsRouter({
  authenticateRequest,
  createCalendar,
  listCalendars,
  logger,
}: CalendarsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const calendars = await listCalendars.execute({ schoolId });
    sendSuccess(res, { calendars });
  });

  router.post('/', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const calendar = await createCalendar.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { calendar }, 201);
  });

  return router;
}
