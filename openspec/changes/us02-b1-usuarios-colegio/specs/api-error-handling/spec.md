## ADDED Requirements

### Requirement: Acceso prohibido
Cuando una petición autenticada no tiene el rol que exige la operación, la API MUST responder `403` con el formato de error común y el código `FORBIDDEN`. El contrato MUST definirlo como respuesta reutilizable `Forbidden` en `components.responses`, y el `401` de los endpoints protegidos como respuesta reutilizable `Unauthorized`, con el código `INVALID_SESSION` y la cabecera `WWW-Authenticate`. El código `FORBIDDEN` MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend.

#### Scenario: Respuestas documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan las respuestas reutilizables `Forbidden` y `Unauthorized`
- **THEN** sus cuerpos usan el formato de error común con los códigos `FORBIDDEN` e `INVALID_SESSION`
- **AND** `Unauthorized` declara la cabecera `WWW-Authenticate` con el valor `Bearer`

#### Scenario: Códigos alineados
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `FORBIDDEN`
