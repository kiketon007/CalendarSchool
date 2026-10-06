import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export interface PrismaClientOptions {
  connectionString: string;
  /** Esquema de PostgreSQL. Solo lo usan los tests (`test_<n>`); por defecto, `public`. */
  schema?: string;
}

/**
 * Construye el cliente Prisma con el adaptador de PostgreSQL. Es el único punto donde se
 * instancia el cliente: el resto de capas no importan nunca el código generado.
 */
export function createPrismaClient({ connectionString, schema }: PrismaClientOptions): PrismaClient {
  if (!schema) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }

  // La opción `schema` del adaptador solo cualifica las consultas de modelo; el search_path
  // hace que el SQL crudo ($queryRaw) use también ese esquema y no `public`.
  const adapter = new PrismaPg(
    { connectionString, options: `-c search_path=${schema}` },
    { schema },
  );
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
