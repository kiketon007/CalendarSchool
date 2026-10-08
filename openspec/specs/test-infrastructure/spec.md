# test-infrastructure Specification

## Purpose
Define la infraestructura de tests: suites unitarias, de integración y E2E, umbrales de cobertura, aislamiento por esquema de worker con vaciado entre tests y orquestación del E2E con Cypress y limpieza de sus datos antes de cada ejecución. Origen: cambio `bootstrap-proyecto` (US00).
## Requirements
### Requirement: Suites de test del backend
El backend MUST tener dos proyectos de Vitest: unitario (sin base de datos) e integración (contra `calendarschool_test`). `npm test` MUST ejecutar ambos más los tests del frontend y requiere PostgreSQL levantado; `test:unit` MUST ejecutar solo el proyecto unitario sin necesitar base de datos. Los nombres de `describe` e `it` MUST estar en inglés.

#### Scenario: Tests unitarios sin base de datos
- **GIVEN** PostgreSQL parado
- **WHEN** se ejecuta `npm run test:unit`
- **THEN** los tests unitarios pasan

#### Scenario: Suite completa
- **GIVEN** PostgreSQL levantado
- **WHEN** se ejecuta `npm test` desde la raíz
- **THEN** se ejecutan los tests de backend (unitarios e integración) y de frontend, y todos pasan

### Requirement: Umbrales de cobertura
La cobertura del backend MUST alcanzar el 90 % (ramas, funciones, líneas y sentencias), medida sobre la unión de tests unitarios e integración y declarada en `backend/vitest.config.ts`. La del frontend MUST alcanzar el 80 %. Solo MUST excluirse: cliente Prisma generado, `*.d.ts`, ficheros de configuración, tests, `cypress/`, `scripts/`, `.gitkeep`, `server.ts` y `main.tsx`; la lista MUST documentarse con un comentario en la configuración. Los puntos de entrada `server.ts` y `main.tsx` MUST NOT contener lógica.

#### Scenario: Cobertura por debajo del umbral
- **GIVEN** un módulo medido sin tests
- **WHEN** se ejecuta `npm test`
- **THEN** el comando falla indicando el umbral incumplido

### Requirement: Aislamiento por esquema de worker
Los tests de integración MUST ejecutarse en paralelo, cada worker en su propio esquema `test_<n>` de `calendarschool_test`, cuyo URL se obtiene de `TEST_DATABASE_URL`. El `globalSetup` del proyecto de integración MUST crear y migrar los esquemas `test_1…test_N`, con N igual a la constante `maxWorkers` compartida, y cada fichero de test MUST usar el esquema `test_<VITEST_POOL_ID>`.

#### Scenario: Workers aislados
- **GIVEN** dos ficheros de test de integración que se ejecutan en paralelo
- **WHEN** cada uno escribe datos
- **THEN** cada uno lo hace en su propio esquema y ninguno ve los datos del otro

#### Scenario: Esquemas recreados en cada ejecución
- **GIVEN** un esquema `test_1` con restos de una ejecución interrumpida
- **WHEN** se inicia la suite de integración
- **THEN** el `globalSetup` lo elimina, lo recrea y lo migra antes de ejecutar los tests

### Requirement: Vaciado entre tests
Antes de cada test de integración, `resetDatabase()` MUST vaciar todas las tablas del esquema del worker leídas dinámicamente de `pg_tables`, excepto `_prisma_migrations`, con `TRUNCATE ... RESTART IDENTITY CASCADE`. MUST negarse a ejecutarse si la base no termina en `_test` o el esquema no es `test_<n>`.

#### Scenario: Vaciado de una tabla
- **GIVEN** una tabla temporal creada en el esquema del worker con una fila
- **WHEN** se llama a `resetDatabase()`
- **THEN** la tabla queda vacía y `_prisma_migrations` sigue intacta

#### Scenario: Otros esquemas intactos
- **GIVEN** una tabla con datos en el esquema `public` de `calendarschool_test`
- **WHEN** un worker llama a `resetDatabase()`
- **THEN** los datos de `public` siguen presentes

#### Scenario: Salvaguarda contra la base de desarrollo
- **GIVEN** una URL que apunta a `calendarschool`
- **WHEN** se llama a `resetDatabase()`
- **THEN** lanza un error sin ejecutar ninguna sentencia

#### Scenario: Salvaguarda contra un esquema no permitido
- **GIVEN** el esquema `public` de `calendarschool_test`
- **WHEN** se llama a `resetDatabase()`
- **THEN** lanza un error sin ejecutar ninguna sentencia

### Requirement: E2E orquestado
`npm run test:e2e` MUST ejecutar `scripts/e2e.mjs`, el mismo en local y en CI, que en orden: lee solo `TEST_DATABASE_URL`; comprueba que el puerto del backend de E2E está libre; compila backend y frontend; aplica las migraciones al esquema `public` de `calendarschool_test`; arranca `node dist/server.js` con variables explícitas y sin cargar `.env`; arranca `vite preview` con el proxy hacia ese backend; espera a `http://localhost:4173/api/health`; ejecuta Cypress en modo headless con un tiempo máximo de ejecución; y cierra los procesos que arrancó, también en Windows.

#### Scenario: E2E correcto
- **GIVEN** el proyecto instalado, PostgreSQL levantado y el puerto de E2E libre
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** Cypress carga la página inicial (por `data-testid`) y comprueba que `/api/health` responde `200` con la forma esperada a través del proxy
- **AND** al terminar no queda ningún proceso arrancado por el script

#### Scenario: Puerto de E2E ocupado
- **GIVEN** el puerto del backend de E2E ocupado
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** el script falla con un mensaje claro sin compilar ni ejecutar Cypress

#### Scenario: Cypress no termina
- **GIVEN** Cypress se queda colgado (p. ej. su navegador se cae sin que el proceso termine)
- **WHEN** se supera el tiempo máximo de ejecución de Cypress (10 minutos por defecto)
- **THEN** el script cierra Cypress y los procesos que arrancó, y falla con un mensaje claro en lugar de esperar indefinidamente

#### Scenario: El E2E nunca usa la base de desarrollo
- **GIVEN** `backend/.env` con `DATABASE_URL` apuntando a `calendarschool` y `npm run dev` en marcha
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** el backend de E2E usa `calendarschool_test` y las peticiones de Cypress no llegan al backend de desarrollo

### Requirement: Aislamiento entre Cypress y Vitest
Cypress MUST vivir en `frontend/cypress/` con su propio `tsconfig.json`, specs con sufijo `.cy.ts` y `eslint-plugin-cypress` aplicado solo a `cypress/**`. Vitest del frontend MUST funcionar sin `globals` y excluir `cypress/`.

#### Scenario: Comprobación de tipos sin conflictos
- **WHEN** se ejecuta la comprobación de tipos del frontend y de Cypress
- **THEN** no hay errores por definiciones duplicadas de `describe`, `it` o `expect`

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

