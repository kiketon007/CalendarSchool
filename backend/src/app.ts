import express, { type Express } from 'express';
import type { ListMunicipalities } from './application/municipality/listMunicipalities.js';
import { CheckHealth } from './application/health/checkHealth.js';
import type { RegisterSchool } from './application/registration/registerSchool.js';
import type { RefreshSession } from './application/session/refreshSession.js';
import type { DatabasePing } from './application/health/databasePing.js';
import type { Logger } from './infrastructure/logger.js';
import { authRouter } from './presentation/auth/authRouter.js';
import { municipalityRouter } from './presentation/municipality/municipalityRouter.js';
import { healthRouter } from './presentation/health/healthRouter.js';
import { errorHandler, notFoundHandler } from './presentation/http/errorHandler.js';
import { REQUEST_TIMEOUT_MS, requestTimeout } from './presentation/http/requestTimeout.js';

export interface AppDependencies {
  databasePing: DatabasePing;
  logger: Logger;
  registerSchool: Pick<RegisterSchool, 'execute'>;
  refreshSession: Pick<RefreshSession, 'execute'>;
  listMunicipalities: Pick<ListMunicipalities, 'execute'>;
  /** Origen de la aplicación: el único desde el que se acepta `POST /api/auth/refresh`. */
  appOrigin: string;
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
  registerSchool,
  refreshSession,
  listMunicipalities,
  appOrigin,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestTimeout(requestTimeoutMs));
  app.use(express.json());

  const api = express.Router();
  api.use('/health', healthRouter(new CheckHealth(databasePing, logger)));
  api.use('/auth', authRouter({ registerSchool, refreshSession, appOrigin }));
  api.use('/municipalities', municipalityRouter(listMunicipalities));
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler(logger));

  return app;
}
