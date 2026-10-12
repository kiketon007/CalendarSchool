import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import { PrismaClient } from './generated/client.js';

/**
 * Tiempo máximo para obtener una conexión del pool. Sin él (por defecto de `pg`, sin límite), una
 * base que no responde deja las consultas pendientes indefinidamente.
 */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;

export interface PrismaClientOptions {
  connectionString: string;
  /** Esquema de PostgreSQL. Solo lo usan los tests (`test_<n>`); por defecto, `public`. */
  schema?: string;
  /** Conexiones máximas del pool; por defecto, las de `pg` (10). La Lambda usa 2 por instancia. */
  poolMax?: number;
  /** Tiempo máximo para obtener una conexión; por defecto, `DEFAULT_CONNECTION_TIMEOUT_MS`. */
  connectionTimeoutMillis?: number;
  /** TLS hacia el servidor. En producción lleva la CA de Supabase; nunca `rejectUnauthorized: false`. */
  ssl?: PoolConfig['ssl'];
}

/**
 * Construye el cliente Prisma con el adaptador de PostgreSQL. Es el único punto donde se
 * instancia el cliente: el resto de capas no importan nunca el código generado.
 */
export function createPrismaClient({
  connectionString,
  schema,
  poolMax,
  connectionTimeoutMillis = DEFAULT_CONNECTION_TIMEOUT_MS,
  ssl,
}: PrismaClientOptions): PrismaClient {
  const pool: PoolConfig = {
    connectionString,
    ...(poolMax !== undefined && { max: poolMax }),
    connectionTimeoutMillis,
    ...(ssl !== undefined && { ssl }),
  };

  if (!schema) {
    return new PrismaClient({ adapter: new PrismaPg(pool) });
  }

  // La opción `schema` del adaptador solo cualifica las consultas de modelo; el search_path
  // hace que el SQL crudo ($queryRaw) use también ese esquema y no `public`.
  const adapter = new PrismaPg({ ...pool, options: `-c search_path=${schema}` }, { schema });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
