// Raíz de composición compartida por los puntos de entrada (`server.ts` y `lambda.ts`): construye
// el cliente Prisma, los repositorios, los casos de uso y la aplicación a partir de la configuración.
// Como ellos, conoce todas las capas y no pertenece a ninguna; la lógica de arranque (escuchar en
// un puerto o exportar el handler) se queda en cada punto de entrada.
import type { Express } from 'express';
import { AttemptLimiter } from './application/attempts/attemptLimiter.js';
import { AuthenticateRequest } from './application/authentication/authenticateRequest.js';
import { LOGIN_ATTEMPTS_WINDOW_MS, LogIn } from './application/login/logIn.js';
import { ListMunicipalities } from './application/municipality/listMunicipalities.js';
import type { CaptchaVerifier } from './application/registration/captchaVerifier.js';
import {
  LimitRegistrationAttempts,
  REGISTRATION_ATTEMPTS_WINDOW_MS,
} from './application/registration/limitRegistrationAttempts.js';
import { RegisterSchool } from './application/registration/registerSchool.js';
import { CreateSession } from './application/session/createSession.js';
import { LogOut } from './application/session/logOut.js';
import { RefreshSession } from './application/session/refreshSession.js';
import type { TokenIssuer } from './application/session/tokenIssuer.js';
import { ListSchoolUsers } from './application/users/listSchoolUsers.js';
import { ManageSchoolUser } from './application/users/manageSchoolUser.js';
import { createApp } from './app.js';
import { BcryptPasswordHasher } from './infrastructure/bcryptPasswordHasher.js';
import type { AppConfig } from './infrastructure/config.js';
import { CryptoRefreshTokenGenerator } from './infrastructure/cryptoRefreshTokenGenerator.js';
import { createCaptchaVerifier } from './infrastructure/createCaptchaVerifier.js';
import { JoseTokenIssuer } from './infrastructure/joseTokenIssuer.js';
import type { Logger } from './infrastructure/logger.js';
import {
  createPrismaClient,
  type PrismaClient,
  type PrismaClientOptions,
} from './infrastructure/prisma/createPrismaClient.js';
import { PrismaAttemptRepository } from './infrastructure/prisma/prismaAttemptRepository.js';
import { PrismaDatabasePing } from './infrastructure/prisma/prismaDatabasePing.js';
import { PrismaMunicipalityRepository } from './infrastructure/prisma/prismaMunicipalityRepository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma/prismaRefreshTokenRepository.js';
import { PrismaSchoolUserRepository } from './infrastructure/prisma/prismaSchoolUserRepository.js';
import { PrismaRegistrationRepository } from './infrastructure/prisma/prismaRegistrationRepository.js';
import { PrismaUserCredentialsRepository } from './infrastructure/prisma/prismaUserCredentialsRepository.js';
import { UuidV7IdGenerator } from './infrastructure/uuidV7IdGenerator.js';

export interface ComposeAppOptions {
  logger: Logger;
  /** Conexiones máximas del pool: `lambda.ts` usa 2; `server.ts`, el valor por defecto de `pg`. */
  poolMax?: number;
  /** TLS hacia la base de datos: `lambda.ts` lo usa con la CA de Supabase. */
  ssl?: PrismaClientOptions['ssl'];
  /**
   * Solo para los tests de integración: un cliente ya creado (con su esquema de worker). Quien lo
   * pasa es responsable de cerrarlo; por defecto, `composeApp` crea el suyo con `DATABASE_URL`.
   */
  prisma?: PrismaClient;
  /** Reloj de los casos de uso; por defecto, la hora real. Los tests lo fijan. */
  now?: () => Date;
  /** Solo para los tests: sustituye al verificador que elegiría `createCaptchaVerifier`. */
  captchaVerifier?: CaptchaVerifier;
}

export interface ComposedApp {
  app: Express;
  /** Para cerrar el pool al terminar. */
  prisma: PrismaClient;
  /** Los tests de integración lo usan para emitir access tokens válidos. */
  tokenIssuer: TokenIssuer;
}

/** Compone la aplicación real a partir de una configuración ya validada. */
export function composeApp(
  config: AppConfig,
  {
    logger,
    poolMax,
    ssl,
    prisma = createPrismaClient({ connectionString: config.databaseUrl, poolMax, ssl }),
    now = () => new Date(),
    captchaVerifier = createCaptchaVerifier({
      recaptcha: config.recaptcha,
      appOrigin: config.appOrigin,
      logger,
    }),
  }: ComposeAppOptions,
): ComposedApp {
  const municipalityRepository = new PrismaMunicipalityRepository(prisma);
  const idGenerator = new UuidV7IdGenerator();
  const refreshTokenGenerator = new CryptoRefreshTokenGenerator();
  const tokenIssuer = new JoseTokenIssuer(config.jwtSecret, now);
  const passwordHasher = new BcryptPasswordHasher();
  const createSession = new CreateSession({ idGenerator, refreshTokenGenerator, now });
  const schoolUserRepository = new PrismaSchoolUserRepository(prisma);
  const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);

  // Un limitador por operación, con su propia política, sobre la misma tabla de intentos.
  const attemptRepository = new PrismaAttemptRepository(prisma, idGenerator);
  const limitRegistrationAttempts = new LimitRegistrationAttempts({
    attemptLimiter: new AttemptLimiter({
      attemptRepository,
      policy: {
        maxAttempts: config.registrationAttemptsMax,
        windowMs: REGISTRATION_ATTEMPTS_WINDOW_MS,
      },
      now,
    }),
    logger,
  });
  const loginAttemptLimiter = new AttemptLimiter({
    attemptRepository,
    policy: { maxAttempts: config.loginAttemptsMax, windowMs: LOGIN_ATTEMPTS_WINDOW_MS },
    now,
  });

  const app = createApp({
    databasePing: new PrismaDatabasePing(prisma, logger),
    logger,
    limitRegistrationAttempts,
    registerSchool: new RegisterSchool({
      registrationRepository: new PrismaRegistrationRepository(prisma),
      municipalityRepository,
      passwordHasher,
      idGenerator,
      // El real con los secretos de reCAPTCHA y el falso sin ellos (que loadConfig exige en producción).
      captchaVerifier,
      createSession,
      now,
      logger,
    }),
    refreshSession: new RefreshSession({
      refreshTokenRepository,
      refreshTokenGenerator,
      tokenIssuer,
      now,
      logger,
    }),
    logIn: new LogIn({
      attemptLimiter: loginAttemptLimiter,
      captchaVerifier,
      userCredentialsRepository: new PrismaUserCredentialsRepository(prisma),
      passwordHasher,
      createSession,
      refreshTokenRepository,
      logger,
    }),
    logOut: new LogOut({ refreshTokenRepository, refreshTokenGenerator, now, logger }),
    listMunicipalities: new ListMunicipalities(municipalityRepository),
    authenticateRequest: new AuthenticateRequest({ tokenIssuer, refreshTokenRepository, now }),
    listSchoolUsers: new ListSchoolUsers(schoolUserRepository),
    manageSchoolUser: new ManageSchoolUser({ schoolUserRepository, now, logger }),
    appOrigin: config.appOrigin,
    trustProxyHops: config.trustProxyHops,
    originVerifySecret: config.originVerifySecret,
  });

  return { app, prisma, tokenIssuer };
}
