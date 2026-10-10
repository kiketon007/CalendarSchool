## ADDED Requirements

### Requirement: El E2E no queda limitado por el límite de intentos
`scripts/e2e.mjs` MUST arrancar el backend de E2E con `REGISTRATION_ATTEMPTS_MAX` alto (1000), porque todas las peticiones de Cypress llegan desde la misma IP y la suite hace más registros de los que admite el límite real. El límite real MUST probarse en los tests de integración contra PostgreSQL, y el aviso del formulario en el E2E simulando la respuesta `429`.

#### Scenario: Suite completa sin bloqueos
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** ninguna petición de registro de la suite recibe `429` por el límite de intentos

#### Scenario: Límite real probado en integración
- **WHEN** se ejecutan los tests de integración del backend
- **THEN** un test hace 5 registros desde la misma IP con el máximo por defecto y comprueba que el sexto recibe `429` contra PostgreSQL
