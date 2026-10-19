import { Writable } from 'node:stream';
import type { CaptchaVerifier } from '../../src/application/registration/captchaVerifier.js';
import { composeApp } from '../../src/composeApp.js';
import { FakeCaptchaVerifier } from '../../src/infrastructure/fakeCaptchaVerifier.js';
import { createLogger } from '../../src/infrastructure/logger.js';
import type { PrismaClient } from '../../src/infrastructure/prisma/createPrismaClient.js';
import { TEST_APP_ORIGIN } from './appDoubles.js';
import { testDatabaseUrl, testPrisma } from './testPrisma.js';

/** Secreto de los tests de integración: firma tokens que solo viven durante el test. */
export const TEST_JWT_SECRET = 'integration-only-jwt-secret-0123456789';

export interface RealAppOptions {
  prisma?: PrismaClient;
  /** Reloj de los casos de uso; por defecto, la hora real. */
  now?: () => Date;
  /**
   * Máximo de intentos de registro por IP cada 15 minutos. Por defecto es alto (1000): los tests
   * que registran varias veces desde la misma IP no deben chocar con el límite, y el de US01_d fija 5.
   */
  registrationAttemptsMax?: number;
  /**
   * Máximo de intentos fallidos de login por IP cada 15 minutos. Por defecto es alto (1000), por la
   * misma razón que el del registro; el de US02 fija 10.
   */
  loginAttemptsMax?: number;
  /**
   * Máximo de consultas o aceptaciones de invitaciones con un enlace no válido por IP cada 15
   * minutos. Por defecto es alto (1000), por la misma razón; el de US02_b4 fija 10.
   */
  invitationAttemptsMax?: number;
  /**
   * Máximo de consultas o confirmaciones de restablecimientos con un enlace no válido por IP cada 15
   * minutos. Por defecto es alto (1000), por la misma razón.
   */
  passwordResetAttemptsMax?: number;
  /** Proxies de confianza delante del backend; por defecto, 0 (se usa la IP de la conexión). */
  trustProxyHops?: number;
  /** Verificador del captcha; por defecto, el falso, que acepta cualquier token salvo los reservados. */
  captchaVerifier?: CaptchaVerifier;
}

/**
 * Aplicación con las implementaciones reales, cableadas con `composeApp` (el mismo módulo que usan
 * `server.ts` y `lambda.ts`), sobre el cliente indicado. Captura el log para que los tests
 * comprueben los eventos.
 */
export function realApp({
  prisma = testPrisma,
  now = () => new Date(),
  registrationAttemptsMax = 1000,
  loginAttemptsMax = 1000,
  invitationAttemptsMax = 1000,
  passwordResetAttemptsMax = 1000,
  trustProxyHops = 0,
  captchaVerifier = new FakeCaptchaVerifier(),
}: RealAppOptions = {}) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = createLogger('info', stream);

  const { app, tokenIssuer } = composeApp(
    {
      nodeEnv: 'test',
      port: 0,
      logLevel: 'info',
      databaseUrl: testDatabaseUrl,
      jwtSecret: TEST_JWT_SECRET,
      appOrigin: TEST_APP_ORIGIN,
      trustProxyHops,
      registrationAttemptsMax,
      loginAttemptsMax,
      invitationAttemptsMax,
      passwordResetAttemptsMax,
      originVerifySecret: undefined,
      recaptcha: undefined,
    },
    { logger, prisma, now, captchaVerifier },
  );
  return { app, tokenIssuer, logOutput: () => lines.join('') };
}
