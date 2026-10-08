// Limpieza de los datos de la base de test antes de cada ejecución del E2E (design.md D13).
// Vive aparte de e2e.mjs para poder probarla desde los tests del backend.
import { createRequire } from 'node:module';

// `pg` es dependencia del backend: se resuelve desde su package.json, no desde la raíz.
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const pg = backendRequire('pg');

/**
 * Tablas que no se vacían: el historial de migraciones y los municipios (datos fijos del INE
 * cargados por la migración). Debe coincidir con `PRESERVED_TABLES` de backend/test/support.
 */
export const PRESERVED_TABLES = ['_prisma_migrations', 'municipalities'];

const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Salvaguarda: solo se actúa sobre bases cuyo nombre termina en `_test`. Es la misma regla que
 * `assertTestDatabase` de los tests. El mensaje nunca incluye las credenciales.
 */
export function assertTestDatabaseUrl(connectionString) {
  let databaseName;
  try {
    databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  } catch {
    throw new Error('Salvaguarda del E2E: la URL de la base de datos de test no es válida');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Salvaguarda del E2E: la base "${databaseName}" no termina en _test; no se borra ningún dato`,
    );
  }
}

/**
 * Vacía todas las tablas del esquema, salvo las de `PRESERVED_TABLES`, y devuelve sus nombres.
 * Se vacía al empezar la ejecución y nunca al terminar, para poder investigar los datos de una
 * ejecución fallida. El E2E usa el esquema `public`; el parámetro permite probarlo en un esquema
 * de worker.
 */
export async function cleanE2eData(connectionString, schema = 'public') {
  assertTestDatabaseUrl(connectionString);
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(`Salvaguarda del E2E: el nombre de esquema "${schema}" no es válido`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> ALL($2::text[])',
      [schema, PRESERVED_TABLES],
    );
    const tables = rows.map(({ tablename }) => tablename);
    if (tables.length > 0) {
      const qualified = tables.map((table) => `"${schema}"."${table.replaceAll('"', '""')}"`);
      await client.query(`TRUNCATE TABLE ${qualified.join(', ')} RESTART IDENTITY CASCADE`);
    }
    return tables;
  } finally {
    await client.end();
  }
}
