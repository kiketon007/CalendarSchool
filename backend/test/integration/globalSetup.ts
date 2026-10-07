import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { assertTestDatabase, schemaUrl } from '../support/testDatabase.js';
import { MAX_WORKERS } from '../support/testWorkers.js';

/**
 * Prepara un esquema limpio y migrado por worker (`test_1…test_N`) antes de los tests de
 * integración. Se eliminan y recrean en cada ejecución para no arrastrar restos de una
 * ejecución interrumpida (design.md D6).
 */
export default async function setup(project: TestProject): Promise<void> {
  const testDatabaseUrl = project.config.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'Falta TEST_DATABASE_URL: defínela en backend/.env (ver .env.example) o en el entorno',
    );
  }

  const schemas = Array.from({ length: MAX_WORKERS }, (_, index) => `test_${index + 1}`);
  schemas.forEach((schema) => assertTestDatabase(testDatabaseUrl, schema));

  await dropSchemas(testDatabaseUrl, schemas);
  // Secuencial: `migrate deploy` toma un bloqueo consultivo por base de datos.
  for (const schema of schemas) {
    migrateSchema(testDatabaseUrl, schema);
  }
}

async function dropSchemas(connectionString: string, schemas: string[]): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const schema of schemas) {
      // El nombre ya ha pasado la salvaguarda (test_<n>), por lo que es seguro interpolarlo.
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  } finally {
    await client.end();
  }
}

// Se invoca la CLI de Prisma con node directamente: sin npx ni shell, igual en Windows y Linux.
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

function migrateSchema(connectionString: string, schema: string): void {
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: schemaUrl(connectionString, schema) },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `No se pudo migrar el esquema ${schema}:\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
}
