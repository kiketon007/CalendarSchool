import type { RequestHandler, Response } from 'express';
import type {
  AuthenticatedUser,
  AuthenticateRequest,
} from '../../application/authentication/authenticateRequest.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { Logger } from '../../infrastructure/logger.js';

/** Cabecera `Authorization: Bearer <token>` con exactamente un token y sin espacios dentro. */
const BEARER_HEADER = /^Bearer (\S+)$/;

/**
 * Autentica una petición con su access token (`Authorization: Bearer`) y deja la identidad en
 * `res.locals`: se lee con `getAuthenticatedUser`. Los endpoints protegidos no usan cookies, así que
 * no exigen la cabecera `Origin`.
 *
 * Cualquier sesión no válida responde `401 INVALID_SESSION` con `WWW-Authenticate: Bearer`, sin
 * indicar la causa al cliente (solo se registra, sin el token ni la cabecera). Un fallo de la base
 * de datos sigue siendo un `503`, nunca un `401`.
 */
export function requireAuthentication(
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>,
  logger: Logger,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = BEARER_HEADER.exec(req.get('authorization') ?? '')?.[1];
      if (token === undefined) {
        throw new InvalidSession('TOKEN_MISSING');
      }
      res.locals.auth = await authenticateRequest.execute(token);
      next();
    } catch (error) {
      if (error instanceof InvalidSession) {
        logger.info(
          { event: 'AUTHENTICATION_REJECTED', reason: error.reason },
          'Petición rechazada: la sesión no es válida',
        );
        res.setHeader('WWW-Authenticate', 'Bearer');
      }
      next(error);
    }
  };
}

/**
 * Identidad de la petición, leída de la base de datos por `requireAuthentication`. Si un handler
 * protegido se monta sin ese middleware lanza un error de programación (`500`): la ruta nunca
 * responde con datos sin identidad.
 */
export function getAuthenticatedUser(res: Response): AuthenticatedUser {
  const identity = res.locals.auth as AuthenticatedUser | undefined;
  if (identity === undefined) {
    throw new Error('La ruta protegida no pasa por requireAuthentication');
  }
  return identity;
}
