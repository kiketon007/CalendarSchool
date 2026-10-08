## ADDED Requirements

### Requirement: Datos del E2E limpios en cada ejecución
`scripts/e2e.mjs` MUST vaciar las tablas del esquema `public` de la base de test, salvo `_prisma_migrations` y `municipalities`, después de migrar y antes de arrancar el backend. MUST aplicar la misma salvaguarda que `resetDatabase()`: solo actúa sobre bases cuyo nombre termina en `_test`. Los datos de una ejecución fallida MUST quedar disponibles hasta la siguiente ejecución.

#### Scenario: Ejecución parte de cero
- **GIVEN** que una ejecución anterior del E2E dejó colegios y usuarios en el esquema `public` de `calendarschool_test`
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** `schools` y `users` están vacías al arrancar el backend
- **AND** `municipalities` y `_prisma_migrations` conservan sus filas

#### Scenario: Base que no es de test
- **WHEN** `TEST_DATABASE_URL` apunta a una base cuyo nombre no termina en `_test`
- **THEN** el script aborta antes de borrar ningún dato y muestra un mensaje que explica el motivo

#### Scenario: Datos disponibles tras un fallo
- **WHEN** una ejecución del E2E falla
- **THEN** los datos escritos por esa ejecución siguen en la base hasta que se ejecuta de nuevo
