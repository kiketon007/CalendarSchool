/**
 * Utilidades de la base de datos de test (design.md D6). Cada worker de Vitest usa su propio
 * esquema `test_<n>` dentro de una base cuyo nombre termina en `_test`.
 */

const WORKER_SCHEMA_PATTERN = /^test_\d+$/;

/**
 * Salvaguarda: lanza un error si la conexión no apunta a una base `*_test` o si el esquema
 * no es de un worker (`test_<n>`). Impide que un test vacíe la base de desarrollo o el
 * esquema `public` de test que usa el E2E. El mensaje nunca incluye credenciales.
 */
export function assertTestDatabase(connectionString: string, schema: string): void {
  let databaseName: string;
  try {
    databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  } catch {
    throw new Error('Salvaguarda de tests: la URL de la base de datos de test no es válida');
  }

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Salvaguarda de tests: la base "${databaseName}" no termina en _test; no se ejecuta ninguna sentencia`,
    );
  }

  if (!WORKER_SCHEMA_PATTERN.test(schema)) {
    throw new Error(
      `Salvaguarda de tests: el esquema "${schema}" no es un esquema de worker (test_<n>); no se ejecuta ninguna sentencia`,
    );
  }
}

/** Nombre del esquema del worker actual a partir de `VITEST_POOL_ID`. */
export function testSchemaName(poolId: string | undefined): string {
  if (!poolId || !/^[1-9]\d*$/.test(poolId)) {
    throw new Error('VITEST_POOL_ID no está definido o no es un entero positivo');
  }
  return `test_${poolId}`;
}

/** Devuelve la URL de conexión con el parámetro `schema` fijado, que usa la CLI de Prisma. */
export function schemaUrl(connectionString: string, schema: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('schema', schema);
  return url.toString();
}
