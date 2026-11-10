## MODIFIED Requirements

### Requirement: E2E orquestado
`npm run test:e2e` MUST ejecutar `scripts/e2e.mjs`, el mismo en local y en CI, que en orden: lee solo `TEST_DATABASE_URL`; comprueba que el puerto del backend de E2E está libre; compila backend y frontend; aplica las migraciones al esquema `public` de `calendarschool_test`; arranca `node dist/server.js` con variables explícitas y sin cargar `.env`; arranca `vite preview` con el proxy hacia ese backend; espera a `http://localhost:4173/api/health`; ejecuta Cypress en modo headless con un tiempo máximo de ejecución; y cierra los procesos que arrancó, también en Windows.

#### Scenario: E2E correcto
- **GIVEN** el proyecto instalado, PostgreSQL levantado y el puerto de E2E libre
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** Cypress abre `/`, comprueba que la aplicación lleva a `/login` (por `data-testid`) y que `/api/health` responde `200` con la forma esperada a través del proxy
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
