import { z } from 'zod';

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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/),
  JWT_SECRET: z.string().min(MIN_JWT_SECRET_LENGTH),
  APP_ORIGIN: appOriginSchema,
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  REGISTRATION_ATTEMPTS_MAX: z.coerce.number().int().min(1).default(5),
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
 * solo server.ts la invoca con process.env.
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
  };
}
