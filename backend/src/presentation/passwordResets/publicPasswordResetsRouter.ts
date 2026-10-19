import { Router } from 'express';
import type { ConfirmPasswordReset } from '../../application/passwordResets/confirmPasswordReset.js';
import type { LookupPasswordReset } from '../../application/passwordResets/lookupPasswordReset.js';
import { requestContext } from '../http/requestContext.js';
import { sendSuccess } from '../http/responses.js';

export interface PublicPasswordResetsRouterDependencies {
  lookupPasswordReset: Pick<LookupPasswordReset, 'execute'>;
  confirmPasswordReset: Pick<ConfirmPasswordReset, 'execute'>;
}

/**
 * Rutas públicas del restablecimiento de contraseña bajo `/api/password-resets`, para la persona
 * que no puede iniciar sesión (US02_c): consultar el colegio y el email enmascarado, y confirmar con
 * la contraseña nueva. Se autentican con el token del enlace, que viaja en el cuerpo, así que no usan
 * `Authorization` ni cookies ni `requireAllowedOrigin` (no hay CSRF que proteger). Confirmar no crea
 * sesión ni fija cookies.
 */
export function publicPasswordResetsRouter({
  lookupPasswordReset,
  confirmPasswordReset,
}: PublicPasswordResetsRouterDependencies): Router {
  const router = Router();

  router.post('/lookup', async (req, res) => {
    const { schoolName, email } = await lookupPasswordReset.execute({
      body: req.body,
      context: requestContext(req),
    });
    sendSuccess(res, { school: { name: schoolName }, email });
  });

  router.post('/confirm', async (req, res) => {
    await confirmPasswordReset.execute({ body: req.body, context: requestContext(req) });
    res.status(204).end();
  });

  return router;
}
