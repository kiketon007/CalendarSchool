import { Writable } from 'node:stream';
import { ListMunicipalities } from '../../src/application/municipality/listMunicipalities.js';
import { RegisterSchool } from '../../src/application/registration/registerSchool.js';
import { CreateSession } from '../../src/application/session/createSession.js';
import { RefreshSession } from '../../src/application/session/refreshSession.js';
import { createApp } from '../../src/app.js';
import { AcceptAllCaptchaVerifier } from '../../src/infrastructure/acceptAllCaptchaVerifier.js';
import { BcryptPasswordHasher } from '../../src/infrastructure/bcryptPasswordHasher.js';
import { CryptoRefreshTokenGenerator } from '../../src/infrastructure/cryptoRefreshTokenGenerator.js';
import { JoseTokenIssuer } from '../../src/infrastructure/joseTokenIssuer.js';
import { createLogger } from '../../src/infrastructure/logger.js';
import type { PrismaClient } from '../../src/infrastructure/prisma/createPrismaClient.js';
import { PrismaDatabasePing } from '../../src/infrastructure/prisma/prismaDatabasePing.js';
import { PrismaMunicipalityRepository } from '../../src/infrastructure/prisma/prismaMunicipalityRepository.js';
import { PrismaRefreshTokenRepository } from '../../src/infrastructure/prisma/prismaRefreshTokenRepository.js';
import { PrismaRegistrationRepository } from '../../src/infrastructure/prisma/prismaRegistrationRepository.js';
import { UuidV7IdGenerator } from '../../src/infrastructure/uuidV7IdGenerator.js';
import { TEST_APP_ORIGIN } from './appDoubles.js';
import { testPrisma } from './testPrisma.js';

/** Secreto de los tests de integración: firma tokens que solo viven durante el test. */
export const TEST_JWT_SECRET = 'integration-only-jwt-secret-0123456789';

export interface RealAppOptions {
  prisma?: PrismaClient;
  /** Reloj de los casos de uso; por defecto, la hora real. */
  now?: () => Date;
}

/**
 * Aplicación con las implementaciones reales, cableadas como en `server.ts`, sobre el cliente
 * indicado. Captura el log para que los tests comprueben los eventos.
 */
export function realApp({ prisma = testPrisma, now = () => new Date() }: RealAppOptions = {}) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = createLogger('info', stream);
  const municipalityRepository = new PrismaMunicipalityRepository(prisma);
  const idGenerator = new UuidV7IdGenerator();
  const refreshTokenGenerator = new CryptoRefreshTokenGenerator();
  const tokenIssuer = new JoseTokenIssuer(TEST_JWT_SECRET, now);

  const app = createApp({
    databasePing: new PrismaDatabasePing(prisma, logger),
    logger,
    registerSchool: new RegisterSchool({
      registrationRepository: new PrismaRegistrationRepository(prisma),
      municipalityRepository,
      passwordHasher: new BcryptPasswordHasher(),
      idGenerator,
      captchaVerifier: new AcceptAllCaptchaVerifier(),
      createSession: new CreateSession({ idGenerator, refreshTokenGenerator, now }),
      logger,
    }),
    refreshSession: new RefreshSession({
      refreshTokenRepository: new PrismaRefreshTokenRepository(prisma),
      refreshTokenGenerator,
      tokenIssuer,
      now,
      logger,
    }),
    listMunicipalities: new ListMunicipalities(municipalityRepository),
    appOrigin: TEST_APP_ORIGIN,
  });
  return { app, tokenIssuer, logOutput: () => lines.join('') };
}
