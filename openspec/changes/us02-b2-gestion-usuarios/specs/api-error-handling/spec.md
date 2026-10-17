## ADDED Requirements

### Requirement: Conflictos de la gestión de usuarios
Cuando una operación de gestión de usuarios choca con el estado del colegio o del usuario, la API MUST responder `409` con el formato de error común y uno de estos códigos: `LAST_ADMIN_REQUIRED` (la operación dejaría el colegio sin ningún `ADMIN` activo), `CANNOT_SUSPEND_SELF` (el usuario intenta darse de baja a sí mismo) o `USER_NOT_ACTIVE` (la operación exige un usuario `ACTIVE`). Los tres códigos MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentar en cada operación qué códigos `409` puede devolver. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Códigos alineados
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `LAST_ADMIN_REQUIRED`, `CANNOT_SUSPEND_SELF` y `USER_NOT_ACTIVE`

#### Scenario: Formato de un conflicto
- **GIVEN** que el único `ADMIN` activo de un colegio intenta pasarse a `MEMBER`
- **WHEN** la API rechaza la operación
- **THEN** responde `409` con `success: false` y `error.code` igual a `LAST_ADMIN_REQUIRED`

#### Scenario: Conflictos documentados
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta `409` de `PUT /api/users/{id}/role`
- **THEN** su descripción enumera `LAST_ADMIN_REQUIRED` y `USER_NOT_ACTIVE`, y la de `POST /api/users/{id}/suspend` enumera `LAST_ADMIN_REQUIRED` y `CANNOT_SUSPEND_SELF`
