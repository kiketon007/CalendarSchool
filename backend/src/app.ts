import express, { type Express } from 'express';
import type { ListMunicipalities } from './application/municipality/listMunicipalities.js';
import { CheckHealth } from './application/health/checkHealth.js';
import type { LimitRegistrationAttempts } from './application/registration/limitRegistrationAttempts.js';
import type { RegisterSchool } from './application/registration/registerSchool.js';
import type { RefreshSession } from './application/session/refreshSession.js';
import type { DatabasePing } from './application/health/databasePing.js';
import type { Logger } from './infrastructure/logger.js';
import { authRouter } from './presentation/auth/authRouter.js';
import { municipalityRouter } from './presentation/municipality/municipalityRouter.js';
import { healthRouter } from './presentation/health/healthRouter.js';
import { errorHandler, notFoundHandler } from './presentation/http/errorHandler.js';
import { REQUEST_TIMEOUT_MS, requestTimeout } from './presentation/http/requestTimeout.js';
import { requireOriginVerification } from './presentation/http/requireOriginVerification.js';

export interface AppDependencies {
  databasePing: DatabasePing;
  logger: Logger;
  limitRegistrationAttempts: Pick<LimitRegistrationAttempts, 'execute'>;
  registerSchool: Pick<RegisterSchool, 'execute'>;
  refreshSession: Pick<RefreshSession, 'execute'>;
  listMunicipalities: Pick<ListMunicipalities, 'execute'>;
  /** Origen de la aplicación: el único desde el que se acepta `POST /api/auth/refresh`. */
  appOrigin: string;
  /**
   * Proxies de confianza delante del backend (`TRUST_PROXY_HOPS`); por defecto, 0. De ellos depende
   * `req.ip`: con 0 es la dirección de la conexión y con N, la que está N saltos desde la derecha de
   * `X-Forwarded-For`, de modo que el cliente no puede elegir su IP escribiendo la cabecera.
   */
  trustProxyHops?: number;
  /**
   * Secreto que CloudFront envía en `X-Origin-Verify`. Si se indica, toda petición sin él se rechaza
   * con `403 ORIGIN_NOT_ALLOWED` antes que cualquier otro middleware; sin él (desarrollo, tests y
   * E2E) no se comprueba nada.
   */
  originVerifySecret?: string;
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
  limitRegistrationAttempts,
  registerSchool,
  refreshSession,
  listMunicipalities,
  appOrigin,
  trustProxyHops = 0,
  originVerifySecret,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);

  // Lo primero de todo: una petición que no viene de CloudFront no debe llegar ni a analizar el
  // cuerpo. `trust proxy` ya está fijado, así que el `debug` de este middleware ve la IP resuelta.
  if (originVerifySecret !== undefined) {
    app.use(requireOriginVerification(originVerifySecret, logger));
  }
  app.use(requestTimeout(requestTimeoutMs));
  app.use(express.json());

  const api = express.Router();
  api.use('/health', healthRouter(new CheckHealth(databasePing, logger)));
  api.use(
    '/auth',
    authRouter({ limitRegistrationAttempts, registerSchool, refreshSession, appOrigin }),
  );
  api.use('/municipalities', municipalityRouter(listMunicipalities));
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler(logger));

  return app;
}
