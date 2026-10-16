// Limpieza de los datos de la base de test antes de cada ejecución del E2E (design.md D13).
// Vive aparte de e2e.mjs para poder probarla desde los tests del backend.
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// `pg` es dependencia del backend: se resuelve desde su package.json, no desde la raíz.
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const pg = backendRequire('pg');
const { hash: bcryptHash } = backendRequire('@node-rs/bcrypt');

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

/** Estados de `UserStatus` del modelo de datos: los únicos que acepta `setUserStatus`. */
const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'];

/**
 * Cambia el estado de un usuario, para preparar en el E2E casos que la aplicación aún no permite
 * provocar (una cuenta suspendida: US02_b la gestionará). Solo actúa sobre una base de test, con la
 * misma salvaguarda que `cleanE2eData`. Devuelve cuántas filas cambió (0 si no hay usuario con ese email).
 */
export async function setUserStatus(connectionString, email, status, schema = 'public') {
  assertTestDatabaseUrl(connectionString);
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(`Salvaguarda del E2E: el nombre de esquema "${schema}" no es válido`);
  }
  if (!USER_STATUSES.includes(status)) {
    throw new Error(`Salvaguarda del E2E: el estado "${status}" no existe en el modelo`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "${schema}"."users" SET status = $1::"${schema}"."UserStatus" WHERE email = $2`,
      [status, email],
    );
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

/** Roles de `UserRole` del modelo de datos: los únicos que acepta `createUser`. */
const USER_ROLES = ['ADMIN', 'MEMBER'];

/**
 * Coste de Bcrypt del hash de `createUser`: el mismo que `BCRYPT_COST` del backend, para que el
 * login del E2E cueste lo que costará el real (un test comprueba que el hash verifica con el hasher).
 */
const BCRYPT_COST = 12;

/**
 * Crea un usuario `ACTIVE` en el colegio del usuario cuyo email se indica, para preparar en el E2E
 * un miembro que la aplicación aún no permite crear (las invitaciones llegan con US02_b4). Solo actúa
 * sobre una base de test, con la misma salvaguarda que `cleanE2eData`. Devuelve el id del usuario
 * creado; falla, sin crear nada, si ningún usuario tiene el email que da el colegio.
 */
export async function createUser(
  connectionString,
  { schoolEmail, email, password, role, firstName = 'Miembro', lastName = 'Prueba' },
  schema = 'public',
) {
  assertTestDatabaseUrl(connectionString);
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(`Salvaguarda del E2E: el nombre de esquema "${schema}" no es válido`);
  }
  if (!USER_ROLES.includes(role)) {
    throw new Error(`Salvaguarda del E2E: el rol "${role}" no existe en el modelo`);
  }

  const passwordHash = await bcryptHash(password, { cost: BCRYPT_COST });
  const id = randomUUID();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO "${schema}"."users" (id, school_id, email, password_hash, first_name, last_name, role, status, updated_at)
       SELECT $1::uuid, school_id, $2, $3, $4, $5, $6::"${schema}"."UserRole", 'ACTIVE', now()
       FROM "${schema}"."users" WHERE email = $7`,
      [id, email, passwordHash, firstName, lastName, role, schoolEmail],
    );
    if (result.rowCount === 0) {
      throw new Error(`No hay ningún usuario con el email "${schoolEmail}" para tomar su colegio`);
    }
    return id;
  } finally {
    await client.end();
  }
}
