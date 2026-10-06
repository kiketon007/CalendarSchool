import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: LogLevel;
  databaseUrl: string;
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
    const invalidVariables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new ConfigError(invalidVariables.sort());
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    databaseUrl: result.data.DATABASE_URL,
  };
}
