import { z } from 'zod';
import type { Logger } from './logger.js';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Longitud mínima del secreto de firma de los JWT (HS256): 256 bits si es ASCII. */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Origen de la aplicación (esquema, host y puerto), sin ruta, query ni credenciales.
 * Se normaliza a `URL.origin` para compararlo tal cual con la cabecera `Origin`.
 */
const appOriginSchema = z.string().transform((value, context) => {
  const url = URL.canParse(value) ? new URL(value) : undefined;
  const isOriginOnly =
    url !== undefined &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '';
  if (!isOriginOnly) {
    context.addIssue({ code: 'custom', message: 'APP_ORIGIN no es un origen http(s) válido' });
    return z.NEVER;
  }
  return url.origin;
});

/** Longitud mínima del secreto compartido con CloudFront (cabecera `X-Origin-Verify`). */
const MIN_ORIGIN_VERIFY_SECRET_LENGTH = 32;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/),
    JWT_SECRET: z.string().min(MIN_JWT_SECRET_LENGTH),
    APP_ORIGIN: appOriginSchema,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    REGISTRATION_ATTEMPTS_MAX: z.coerce.number().int().min(1).default(5),
    LOGIN_ATTEMPTS_MAX: z.coerce.number().int().min(1).default(10),
    INVITATION_ATTEMPTS_MAX: z.coerce.number().int().min(1).default(10),
    ORIGIN_VERIFY_SECRET: z.string().min(MIN_ORIGIN_VERIFY_SECRET_LENGTH).optional(),
    RECAPTCHA_V3_SECRET: z.string().min(1).optional(),
    RECAPTCHA_V2_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, context) => {
    // Los dos secretos van juntos, y en producción son obligatorios: sin ellos se usaría el
    // verificador falso, que acepta casi cualquier token y nunca debe llegar a producción.
    const required = env.NODE_ENV === 'production';
    // Sin la cabecera secreta, en producción cualquiera podría saltarse CloudFront y elegir su IP.
    if (required && env.ORIGIN_VERIFY_SECRET === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['ORIGIN_VERIFY_SECRET'],
        message: 'ORIGIN_VERIFY_SECRET es obligatoria',
      });
    }
    for (const name of ['RECAPTCHA_V3_SECRET', 'RECAPTCHA_V2_SECRET'] as const) {
      const other =
        name === 'RECAPTCHA_V3_SECRET' ? env.RECAPTCHA_V2_SECRET : env.RECAPTCHA_V3_SECRET;
      if (env[name] === undefined && (required || other !== undefined)) {
        context.addIssue({ code: 'custom', path: [name], message: `${name} es obligatoria` });
      }
    }
  });

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: LogLevel;
  databaseUrl: string;
  /** Secreto de firma de los access tokens. Nunca se registra en los logs. */
  jwtSecret: string;
  /** Único origen desde el que se aceptan las peticiones que usan la cookie de sesión. */
  appOrigin: string;
  /** Proxies de confianza delante del backend: de ellos depende la IP del cliente (`trust proxy`). */
  trustProxyHops: number;
  /** Máximo de intentos de registro por IP en la ventana de 15 minutos. */
  registrationAttemptsMax: number;
  /** Máximo de intentos fallidos de login por IP en la ventana de 15 minutos (US02). */
  loginAttemptsMax: number;
  /** Máximo de consultas o aceptaciones de invitaciones con un enlace no válido por IP en la ventana de 15 minutos (US02_b4). */
  invitationAttemptsMax: number;
  /**
   * Valor que CloudFront envía en `X-Origin-Verify`. Ausente fuera de producción: no se verifica
   * el origen. Nunca se registra en los logs.
   */
  originVerifySecret: string | undefined;
  /**
   * Secretos de reCAPTCHA (v3 por score y v2 de reto). Ausente fuera de producción: se usa el
   * verificador falso. Nunca se registran en los logs.
   */
  recaptcha: { v3Secret: string; v2Secret: string } | undefined;
}

/**
 * Error de configuración. Solo expone los nombres de las variables inválidas,
 * nunca sus valores, porque pueden contener credenciales.
 */
export class ConfigError extends Error {
  constructor(public readonly invalidVariables: string[]) {
    super(`Configuración inválida: revisa las variables de entorno ${invalidVariables.join(', ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Valida las variables de entorno y devuelve la configuración tipada de la aplicación.
 * Recibe el entorno por parámetro para poder probarla sin tocar process.env;
 * solo los puntos de entrada (`server.ts` y `lambda.ts`) la invocan, a través de `loadConfigOrLog`.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const invalidVariables = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new ConfigError(invalidVariables.sort());
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    databaseUrl: result.data.DATABASE_URL,
    jwtSecret: result.data.JWT_SECRET,
    appOrigin: result.data.APP_ORIGIN,
    trustProxyHops: result.data.TRUST_PROXY_HOPS,
    registrationAttemptsMax: result.data.REGISTRATION_ATTEMPTS_MAX,
    loginAttemptsMax: result.data.LOGIN_ATTEMPTS_MAX,
    invitationAttemptsMax: result.data.INVITATION_ATTEMPTS_MAX,
    originVerifySecret: result.data.ORIGIN_VERIFY_SECRET,
    recaptcha:
      result.data.RECAPTCHA_V3_SECRET !== undefined && result.data.RECAPTCHA_V2_SECRET !== undefined
        ? { v3Secret: result.data.RECAPTCHA_V3_SECRET, v2Secret: result.data.RECAPTCHA_V2_SECRET }
        : undefined,
  };
}

/**
 * Carga la configuración y, si es inválida, registra una única línea JSON de nivel `fatal` con los
 * nombres de las variables (nunca sus valores) antes de relanzar el error. Así el log de arranque,
 * en local o en CloudWatch, es una línea estructurada y no la traza de Node. Cada punto de entrada
 * decide cómo terminar: `server.ts` sale con código 1 y `lambda.ts` deja fallar la inicialización.
 */
export function loadConfigOrLog(
  env: Record<string, string | undefined>,
  logger: Logger,
): AppConfig {
  try {
    return loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.fatal({ invalidVariables: error.invalidVariables }, 'Configuración inválida');
    }
    throw error;
  }
}
