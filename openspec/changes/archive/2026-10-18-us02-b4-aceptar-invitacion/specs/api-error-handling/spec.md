## ADDED Requirements

### Requirement: Enlace de acceso no válido
Cuando una operación pública con un enlace de acceso recibe un token que no corresponde a un enlace pendiente del propósito esperado (caducado, usado, revocado, inexistente, de otro propósito o ausente), la API MUST responder `410` con el formato de error común y el código `ACCESS_LINK_INVALID`, sin indicar cuál de los casos es. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `ACCESS_LINK_INVALID`

#### Scenario: Formato de un enlace no válido
- **GIVEN** una invitación revocada
- **WHEN** se acepta con su token
- **THEN** la respuesta es `410` con `success: false` y `error.code` igual a `ACCESS_LINK_INVALID`
