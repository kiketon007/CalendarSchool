## ADDED Requirements

### Requirement: Ejecución de una spec concreta del E2E
`npm run test:e2e` MUST pasar a Cypress los argumentos que reciba tras `--`, de modo que `npm run test:e2e -- --spec <ruta>` ejecute solo esa spec con el mismo entorno que la suite completa (compilación, migración, limpieza de datos y servidores). Sin argumentos, MUST ejecutar todas las specs, como hasta ahora.

#### Scenario: Una sola spec
- **GIVEN** el proyecto instalado, PostgreSQL levantado y los puertos de E2E libres
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/session.cy.ts`
- **THEN** Cypress ejecuta únicamente `session.cy.ts` en modo headless, después de compilar, migrar y vaciar los datos de la base de test
- **AND** al terminar no queda ningún proceso arrancado por el script

#### Scenario: Sin argumentos
- **WHEN** se ejecuta `npm run test:e2e` sin argumentos
- **THEN** Cypress ejecuta todas las specs de `cypress/e2e/`
