## MODIFIED Requirements

### Requirement: El E2E no queda limitado por el límite de intentos
`scripts/e2e.mjs` MUST arrancar el backend de E2E con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` altos (1000), porque todas las peticiones de Cypress llegan desde la misma IP y la suite hace más registros, inicios de sesión fallidos y consultas de enlaces no válidos de los que admiten los límites reales. Los límites reales MUST probarse en los tests de integración contra PostgreSQL, y los avisos de los formularios en el E2E simulando la respuesta `429`.

#### Scenario: Suite completa sin bloqueos
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** ninguna petición de registro, de inicio de sesión ni de invitaciones de la suite recibe `429` por el límite de intentos

#### Scenario: Límite real probado en integración
- **WHEN** se ejecutan los tests de integración del backend
- **THEN** un test hace 5 registros desde la misma IP con el máximo por defecto y comprueba que el sexto recibe `429` contra PostgreSQL
- **AND** otro test agota el límite de las invitaciones con enlaces no válidos y comprueba el `429` contra PostgreSQL
