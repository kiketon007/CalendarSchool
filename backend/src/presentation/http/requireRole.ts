import type { RequestHandler } from 'express';
import { Forbidden } from '../../application/authentication/forbidden.js';
import type { UserRole } from '../../domain/user/user.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser } from './requireAuthentication.js';

/**
 * Exige un rol a la identidad de la petición (el rol leído de la base de datos, no el del token).
 * Va siempre después de `requireAuthentication`: sin sesión la respuesta es `401`, nunca `403`. Con
 * otro rol responde `403 FORBIDDEN`.
 */
export function requireRole(requiredRole: UserRole, logger: Logger): RequestHandler {
  return (_req, res, next) => {
    const { userId, schoolId, role } = getAuthenticatedUser(res);
    if (role !== requiredRole) {
      logger.warn(
        {
          event: 'AUTHORIZATION_DENIED',
          user_id: userId,
          school_id: schoolId,
          role,
          required_role: requiredRole,
        },
        'Acceso denegado: el usuario no tiene el rol que exige la operación',
      );
      next(new Forbidden(role, requiredRole));
      return;
    }
    next();
  };
}
