import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';

/**
 * Códigos con los que Prisma 7 y el adaptador de PostgreSQL señalan que no se pudo conectar:
 * errores de red (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`) y errores de conexión de Prisma
 * (`P1000` autenticación, `P1001` servidor inalcanzable, `P1002` timeout del servidor,
 * `P1008` timeout de la operación, `P1017` conexión cerrada).
 */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
]);

function isConnectionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    CONNECTION_ERROR_CODES.has(error.code)
  );
}

/**
 * Ejecuta una operación contra la base de datos y traduce los fallos de conexión a
 * `DatabaseUnavailable` (D12). Cualquier otro error se propaga sin cambios.
 */
export async function translateDatabaseErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw isConnectionError(error) ? new DatabaseUnavailable(error) : error;
  }
}
