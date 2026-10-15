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

/**
 * Mensajes del pool de `pg` cuando el servidor corta la conexión (o se agota el tiempo de conexión
 * del cliente) en mitad de una consulta. El error llega sin código, así que no hay otra forma de
 * reconocerlo. Se aceptan solo estos dos mensajes fijos: cualquier otro error sin código sigue siendo
 * un fallo inesperado y no debe ocultarse como indisponibilidad de la base de datos.
 */
const CONNECTION_TERMINATED_MESSAGES = new Set([
  'Connection terminated unexpectedly',
  'Connection terminated due to connection timeout',
]);

function isConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && typeof error.code === 'string') {
    return CONNECTION_ERROR_CODES.has(error.code);
  }
  return (
    'message' in error &&
    typeof error.message === 'string' &&
    CONNECTION_TERMINATED_MESSAGES.has(error.message)
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
