import { createPrismaClient } from '../../src/infrastructure/prisma/createPrismaClient.js';
import { assertTestDatabase, testSchemaName } from './testDatabase.js';
import { MAX_WORKERS } from './testWorkers.js';

/** Esquema de PostgreSQL del worker actual (`test_<VITEST_POOL_ID>`). */
export const testSchema = testSchemaName(process.env.VITEST_POOL_ID);

if (Number(process.env.VITEST_POOL_ID) > MAX_WORKERS) {
  throw new Error(
    `VITEST_POOL_ID (${process.env.VITEST_POOL_ID}) supera MAX_WORKERS (${MAX_WORKERS}): no existe su esquema de test`,
  );
}

/** URL de la base de test (sin el parámetro de esquema). */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';

assertTestDatabase(testDatabaseUrl, testSchema);

/** Cliente Prisma del worker, apuntando a su propio esquema. */
export const testPrisma = createPrismaClient({
  connectionString: testDatabaseUrl,
  schema: testSchema,
});
