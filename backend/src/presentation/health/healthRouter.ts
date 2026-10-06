import { Router } from 'express';
import type { CheckHealth } from '../../application/health/checkHealth.js';
import { AppError } from '../http/appError.js';
import { sendSuccess } from '../http/responses.js';

/** Rutas de salud del servicio (`GET /api/health`). */
export function healthRouter(checkHealth: CheckHealth): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const report = await checkHealth.execute();

    if (report.status !== 'ok') {
      throw new AppError('DATABASE_UNAVAILABLE', 503, 'La base de datos no está disponible');
    }
    sendSuccess(res, report);
  });

  return router;
}
