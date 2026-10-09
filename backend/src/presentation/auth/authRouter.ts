import { Router } from 'express';
import type { RegisterSchool } from '../../application/registration/registerSchool.js';
import { sendSuccess } from '../http/responses.js';

/** Rutas de autenticación bajo `/api/auth`. Por ahora, solo el registro (US01_b). */
export function authRouter(registerSchool: Pick<RegisterSchool, 'execute'>): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const result = await registerSchool.execute(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    // Solo los datos del alta: el refresh token nunca va en el cuerpo de la respuesta.
    sendSuccess(res, result.registration, 201);
  });

  return router;
}
