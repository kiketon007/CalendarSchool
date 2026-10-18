import { Router, type RequestHandler } from 'express';
import type { LogIn } from '../../application/login/logIn.js';
import type { LimitRegistrationAttempts } from '../../application/registration/limitRegistrationAttempts.js';
import type { RegisterSchool } from '../../application/registration/registerSchool.js';
import type { LogOut } from '../../application/session/logOut.js';
import type { RefreshSession } from '../../application/session/refreshSession.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import { requestContext } from '../http/requestContext.js';
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
  logIn: Pick<LogIn, 'execute'>;
  logOut: Pick<LogOut, 'execute'>;
  /** Único origen desde el que se aceptan `POST /login`, `POST /refresh` y `POST /logout`. */
  appOrigin: string;
}

/** Rutas de autenticación bajo `/api/auth`: registro (US01_b), sesión (US01_c), inicio (US02) y cierre de sesión (US03). */
export function authRouter({
  limitRegistrationAttempts,
  registerSchool,
  refreshSession,
  logIn,
  logOut,
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
    sendSuccess(res, registration, 201);
  });

  // Protección CSRF como en `/refresh`. El límite de intentos y el captcha los aplica el caso de uso,
  // después de validar el cuerpo, porque el login solo cuenta los intentos fallidos.
  router.post('/login', requireAllowedOrigin(appOrigin), async (req, res) => {
    // Una cookie `refresh_token` recibida no se lee: el login siempre crea una sesión nueva.
    const { refreshToken } = await logIn.execute(req.body, requestContext(req));
    res.setHeader('Set-Cookie', refreshTokenCookie(refreshToken));
    res.status(204).end();
  });

  // Protección CSRF como en `/refresh`: otra web no puede cerrar la sesión del usuario. La cookie solo
  // se borra si el caso de uso termina bien: ante un fallo de la base de datos la sesión puede seguir
  // válida en el servidor y el cliente debe poder reintentar.
  router.post('/logout', requireAllowedOrigin(appOrigin), async (req, res) => {
    await logOut.execute(readRefreshToken(req.get('cookie')), requestContext(req));
    res.setHeader('Set-Cookie', clearedRefreshTokenCookie());
    res.status(204).end();
  });

  router.post('/refresh', requireAllowedOrigin(appOrigin), async (req, res) => {
    try {
      const result = await refreshSession.execute(
        readRefreshToken(req.get('cookie')),
        requestContext(req),
      );
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
