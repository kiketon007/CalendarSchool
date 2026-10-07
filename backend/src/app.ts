import express, { type Express } from 'express';
import { CheckHealth } from './application/health/checkHealth.js';
import type { DatabasePing } from './application/health/databasePing.js';
import type { Logger } from './infrastructure/logger.js';
import { healthRouter } from './presentation/health/healthRouter.js';
import { errorHandler, notFoundHandler } from './presentation/http/errorHandler.js';
import { REQUEST_TIMEOUT_MS, requestTimeout } from './presentation/http/requestTimeout.js';

export interface AppDependencies {
  databasePing: DatabasePing;
  logger: Logger;
  /** Límite de tiempo por petición; por defecto, 10 s. Los tests lo reducen. */
  requestTimeoutMs?: number;
}

/**
 * Compone la aplicación Express. Recibe todas sus dependencias por parámetro y nunca lee
 * process.env: así se prueba con Supertest y dobles, y más adelante se envuelve para Lambda.
 */
export function createApp({
  databasePing,
  logger,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestTimeout(requestTimeoutMs));
  app.use(express.json());

  const api = express.Router();
  api.use('/health', healthRouter(new CheckHealth(databasePing, logger)));
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler(logger));

  return app;
}
