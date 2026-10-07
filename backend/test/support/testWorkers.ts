/**
 * Número de workers de Vitest. Es también el número de esquemas `test_<n>` que crea el
 * globalSetup de integración: cada worker usa el esquema `test_<VITEST_POOL_ID>`.
 * Lo comparten vitest.config.ts y el globalSetup para que no puedan divergir.
 */
export const MAX_WORKERS = 4;
