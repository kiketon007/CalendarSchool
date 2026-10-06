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
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
