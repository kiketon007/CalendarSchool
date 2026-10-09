import { Router, type Request, type RequestHandler } from 'express';
import type { LimitRegistrationAttempts } from '../../application/registration/limitRegistrationAttempts.js';
import type { RegisterSchool } from '../../application/registration/registerSchool.js';
import type { RequestContext } from '../../application/requestContext.js';
import type { RefreshSession } from '../../application/session/refreshSession.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import { requireAllowedOrigin } from '../http/requireAllowedOrigin.js';
import { sendSuccess } from '../http/responses.js';
import {
  clearedRefreshTokenCookie,
  readRefreshToken,
  refreshTokenCookie,
} from './sessionCookie.js';

export interface AuthRouterDependencies {
  limitRegistrationAttempts: Pick<LimitRegistrationAttempts, 'execute'>;
  registerSchool: Pick<RegisterSchool, 'execute'>;
  refreshSession: Pick<RefreshSession, 'execute'>;
  /** Único origen desde el que se acepta `POST /refresh`. */
  appOrigin: string;
}

function requestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

/** Rutas de autenticación bajo `/api/auth`: registro (US01_b) y sesión (US01_c). */
export function authRouter({
  limitRegistrationAttempts,
  registerSchool,
  refreshSession,
  appOrigin,
}: AuthRouterDependencies): Router {
  const router = Router();

  // Paso 1 del orden de procesamiento (US01_d): antes del captcha, la validación y las consultas.
  // `express.json()` ya se ha ejecutado, así que un cuerpo que no es JSON responde 400 sin contar.
  const limitAttempts: RequestHandler = async (req, _res, next) => {
    await limitRegistrationAttempts.execute(requestContext(req));
    next();
  };

  router.post('/register', limitAttempts, async (req, res) => {
    const { registration, refreshToken } = await registerSchool.execute(
      req.body,
      requestContext(req),
    );
    // La sesión se inicia con la cookie; el refresh token nunca va en el cuerpo de la respuesta.
    res.setHeader('Set-Cookie', refreshTokenCookie(refreshToken));
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, registration, 201);
  });

  router.post('/refresh', requireAllowedOrigin(appOrigin), async (req, res) => {
    try {
      const result = await refreshSession.execute(
        readRefreshToken(req.get('cookie')),
        requestContext(req),
      );
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess(res, result);
    } catch (error) {
      // Una sesión no válida no se puede recuperar: se borra la cookie. Ante otros fallos
      // (p. ej. la base de datos no responde) se conserva, porque la sesión puede seguir viva.
      if (error instanceof InvalidSession) {
        res.setHeader('Set-Cookie', clearedRefreshTokenCookie());
      }
      throw error;
    }
  });

  return router;
}
