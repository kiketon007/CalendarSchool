import type { PrismaClient } from '../../src/infrastructure/prisma/createPrismaClient.js';
import { assertTestDatabase } from './testDatabase.js';

/** Tablas que no se vacían: el historial de migraciones y los municipios (datos fijos del INE). */
export const PRESERVED_TABLES = ['_prisma_migrations', 'municipalities'] as const;

/**
 * Vacía todas las tablas del esquema del worker antes de cada test (design.md D6).
 *
 * Las tablas se leen de `pg_tables`, así que las historias siguientes no tienen que tocar
 * este helper al añadir tablas. Conserva `_prisma_migrations` y las tablas de datos fijos
 * cargadas por migración (`PRESERVED_TABLES`), y se niega a ejecutarse si la conexión no apunta
 * a una base `*_test` o a un esquema `test_<n>`.
 */
export async function resetDatabase(
  prisma: PrismaClient,
  connectionString: string,
  schema: string,
): Promise<void> {
  assertTestDatabase(connectionString, schema);

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = ${schema} AND tablename <> ALL(${[...PRESERVED_TABLES]}::text[])
  `;
  if (tables.length === 0) {
    return;
  }

  const qualifiedTables = tables
    .map(({ tablename }) => `"${schema}"."${tablename.replaceAll('"', '""')}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${qualifiedTables} RESTART IDENTITY CASCADE`);
}
