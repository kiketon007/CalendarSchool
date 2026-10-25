import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateCalendar } from '../../application/calendars/createCalendar.js';
import type { DeleteCalendar } from '../../application/calendars/deleteCalendar.js';
import type { GetCalendar } from '../../application/calendars/getCalendar.js';
import type { ListCalendars } from '../../application/calendars/listCalendars.js';
import type { UpdateCalendar } from '../../application/calendars/updateCalendar.js';
import { CalendarNotFound } from '../../domain/calendar/calendarErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

const calendarIdSchema = z.uuid();

/**
 * Lee el `id` de la ruta. Un valor que no es un UUID se trata como un calendario que no existe (`404`), igual
 * que el de otro colegio, y no llega al caso de uso ni a la base de datos.
 */
function parseCalendarId(value: unknown): string {
  const parsed = calendarIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CalendarNotFound();
  }
  return parsed.data;
}

export interface CalendarsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createCalendar: Pick<CreateCalendar, 'execute'>;
  listCalendars: Pick<ListCalendars, 'execute'>;
  getCalendar: Pick<GetCalendar, 'execute'>;
  updateCalendar: Pick<UpdateCalendar, 'execute'>;
  deleteCalendar: Pick<DeleteCalendar, 'execute'>;
  logger: Logger;
}

/**
 * Rutas de los calendarios base del colegio bajo `/api/calendars`: listarlos y crear uno (US-BASE), leer y
 * editar uno por su id (US-BASE_b) y borrarlo (US-BASE_c). Es el primer recurso con **lectura para los dos roles y escritura solo para
 * `ADMIN`**: los `GET` solo exigen sesión y el `POST`, el `PUT` y el `DELETE` añaden `requireRole('ADMIN')`, que responde
 * `403 FORBIDDEN` a un `MEMBER` antes de leer el `id` o validar el cuerpo (así no se revela si el calendario
 * existe). Se autentican con el access token y no con cookies, así que no usan `requireAllowedOrigin`. El
 * colegio y quien actúa salen siempre de la identidad leída de la base de datos, nunca de la petición.
 */
export function calendarsRouter({
  authenticateRequest,
  createCalendar,
  listCalendars,
  getCalendar,
  updateCalendar,
  deleteCalendar,
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

  router.get('/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const calendar = await getCalendar.execute({
      schoolId,
      calendarId: parseCalendarId(req.params.id),
    });
    sendSuccess(res, { calendar });
  });

  router.put('/:id', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El id se valida antes que el cuerpo; el caso de uso valida el cuerpo.
    const calendar = await updateCalendar.execute({
      schoolId,
      actorId,
      calendarId: parseCalendarId(req.params.id),
      body: req.body,
    });
    sendSuccess(res, { calendar });
  });

  router.delete('/:id', requireRole('ADMIN', logger), async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // Sin cuerpo: el rol se comprueba antes de leer el id, y el caso de uso devuelve lo que se borró de verdad.
    const deleted = await deleteCalendar.execute({
      schoolId,
      actorId,
      calendarId: parseCalendarId(req.params.id),
    });
    sendSuccess(res, { deleted });
  });

  return router;
}
