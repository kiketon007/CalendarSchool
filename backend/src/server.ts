// Punto de entrada del backend. No contiene lógica (está excluido de la cobertura):
// solo carga la configuración, compone las dependencias y arranca el servidor HTTP.
// Si la configuración es inválida o el puerto está ocupado, el proceso termina con error.
import { ListMunicipalities } from './application/municipality/listMunicipalities.js';
import { AttemptLimiter } from './application/attempts/attemptLimiter.js';
import {
  LimitRegistrationAttempts,
  REGISTRATION_ATTEMPTS_WINDOW_MS,
} from './application/registration/limitRegistrationAttempts.js';
import { RegisterSchool } from './application/registration/registerSchool.js';
import { CreateSession } from './application/session/createSession.js';
import { RefreshSession } from './application/session/refreshSession.js';
import { createApp } from './app.js';
import { AcceptAllCaptchaVerifier } from './infrastructure/acceptAllCaptchaVerifier.js';
import { BcryptPasswordHasher } from './infrastructure/bcryptPasswordHasher.js';
import { CryptoRefreshTokenGenerator } from './infrastructure/cryptoRefreshTokenGenerator.js';
import { JoseTokenIssuer } from './infrastructure/joseTokenIssuer.js';
import { loadConfig } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';
import { PrismaAttemptRepository } from './infrastructure/prisma/prismaAttemptRepository.js';
import { PrismaDatabasePing } from './infrastructure/prisma/prismaDatabasePing.js';
import { PrismaMunicipalityRepository } from './infrastructure/prisma/prismaMunicipalityRepository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma/prismaRefreshTokenRepository.js';
import { PrismaRegistrationRepository } from './infrastructure/prisma/prismaRegistrationRepository.js';
import { UuidV7IdGenerator } from './infrastructure/uuidV7IdGenerator.js';

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const prisma = createPrismaClient({ connectionString: config.databaseUrl });

const municipalityRepository = new PrismaMunicipalityRepository(prisma);
const idGenerator = new UuidV7IdGenerator();
const refreshTokenGenerator = new CryptoRefreshTokenGenerator();
const now = () => new Date();

const limitRegistrationAttempts = new LimitRegistrationAttempts({
  attemptLimiter: new AttemptLimiter({
    attemptRepository: new PrismaAttemptRepository(prisma, idGenerator),
    policy: {
      maxAttempts: config.registrationAttemptsMax,
      windowMs: REGISTRATION_ATTEMPTS_WINDOW_MS,
    },
    now,
  }),
  logger,
});

const app = createApp({
  databasePing: new PrismaDatabasePing(prisma, logger),
  logger,
  limitRegistrationAttempts,
  registerSchool: new RegisterSchool({
    registrationRepository: new PrismaRegistrationRepository(prisma),
    municipalityRepository,
    passwordHasher: new BcryptPasswordHasher(),
    idGenerator,
    // Provisional hasta US01_e: acepta cualquier token. No debe llegar a producción.
    captchaVerifier: new AcceptAllCaptchaVerifier(),
    createSession: new CreateSession({ idGenerator, refreshTokenGenerator, now }),
    logger,
  }),
  refreshSession: new RefreshSession({
    refreshTokenRepository: new PrismaRefreshTokenRepository(prisma),
    refreshTokenGenerator,
    tokenIssuer: new JoseTokenIssuer(config.jwtSecret, now),
    now,
    logger,
  }),
  listMunicipalities: new ListMunicipalities(municipalityRepository),
  appOrigin: config.appOrigin,
  trustProxyHops: config.trustProxyHops,
});

// En Express 5 el callback también recibe los errores de arranque (p. ej. puerto ocupado):
// se relanzan para que el proceso termine en vez de saltar a otro puerto o seguir sin escuchar.
app.listen(config.port, (error?: Error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'Backend escuchando');
});
