import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import { parseChangeRoleRequest } from '../../application/users/changeRoleRequest.js';
import type { CreatePasswordReset } from '../../application/passwordResets/createPasswordReset.js';
import type { RevokePasswordReset } from '../../application/passwordResets/revokePasswordReset.js';
import type { ListSchoolUsers } from '../../application/users/listSchoolUsers.js';
import type { ManageSchoolUser } from '../../application/users/manageSchoolUser.js';
import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { UserAction } from '../../domain/user/userManagement.js';
import { UserNotFound } from '../../domain/user/userManagementErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { requireRole } from '../http/requireRole.js';
import { sendSuccess } from '../http/responses.js';

export interface UsersRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  listSchoolUsers: Pick<ListSchoolUsers, 'execute'>;
  manageSchoolUser: Pick<ManageSchoolUser, 'execute'>;
  createPasswordReset: Pick<CreatePasswordReset, 'execute'>;
  revokePasswordReset: Pick<RevokePasswordReset, 'execute'>;
  logger: Logger;
}

const userIdSchema = z.uuid();

/** Un id que no es un UUID se trata como un usuario inexistente (`404`), sin llegar a la base de datos. */
function parseUserId(value: unknown): string {
  const parsed = userIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new UserNotFound();
  }
  return parsed.data;
}

/** Usuario en el formato de la API: la fecha de alta en ISO 8601. */
function toResponse(user: SchoolUser) {
  return { ...user, createdAt: user.createdAt.toISOString() };
}

/**
 * Rutas de los usuarios del colegio bajo `/api/users`, reservadas a los administradores: la lista
 * (US02_b1), el cambio de rol, la baja y la reactivación (US02_b2), y generar o revocar el enlace de
 * restablecimiento de contraseña (US02_c). El `201` de la generación es la única respuesta que lleva
 * el enlace.
 */
export function usersRouter({
  authenticateRequest,
  listSchoolUsers,
  manageSchoolUser,
  createPasswordReset,
  revokePasswordReset,
  logger,
}: UsersRouterDependencies): Router {
  const router = Router();

  // Primero la identidad (401) y después el rol (403), antes de validar nada. Sin
  // `requireAllowedOrigin`: estos endpoints se autentican con el access token, no con cookies, así
  // que no hay riesgo de CSRF.
  router.use(requireAuthentication(authenticateRequest, logger), requireRole('ADMIN', logger));

  /** Aplica una acción al usuario de la ruta. El colegio y quien actúa salen de la identidad, nunca de la petición. */
  async function manage(res: Response, userId: unknown, action: () => UserAction): Promise<void> {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const user = await manageSchoolUser.execute({
      schoolId,
      actorId,
      userId: parseUserId(userId),
      action: action(),
    });
    sendSuccess(res, toResponse(user));
  }

  router.get('/', async (_req, res) => {
    // El colegio sale de la identidad leída de la base de datos, nunca de la petición.
    const { schoolId } = getAuthenticatedUser(res);
    const users = await listSchoolUsers.execute({ schoolId });
    sendSuccess(res, users.map(toResponse));
  });

  router.put('/:id/role', (req, res) =>
    // El id se valida antes que el cuerpo: un usuario inexistente no debe dar pistas sobre el cuerpo.
    manage(res, req.params.id, () => ({
      type: 'changeRole',
      role: parseChangeRoleRequest(req.body),
    })),
  );

  router.post('/:id/suspend', (req, res) =>
    manage(res, req.params.id, () => ({ type: 'suspend' })),
  );

  router.post('/:id/reactivate', (req, res) =>
    manage(res, req.params.id, () => ({ type: 'reactivate' })),
  );

  router.post('/:id/password-reset', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const { passwordReset, url } = await createPasswordReset.execute({
      schoolId,
      actorId,
      userId: parseUserId(req.params.id),
    });
    sendSuccess(
      res,
      {
        passwordReset: {
          userId: passwordReset.userId,
          createdAt: passwordReset.createdAt.toISOString(),
          expiresAt: passwordReset.expiresAt.toISOString(),
        },
        url,
      },
      201,
    );
  });

  router.post('/:id/password-reset/revoke', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    await revokePasswordReset.execute({ schoolId, actorId, userId: parseUserId(req.params.id) });
    res.status(204).end();
  });

  return router;
}
