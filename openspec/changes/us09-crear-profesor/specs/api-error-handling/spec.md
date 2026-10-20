## ADDED Requirements

### Requirement: Clase que ya tiene tutor
Cuando se intenta asignar a un profesor una clase que ya tiene tutor, la API MUST responder `409` con el formato de error común y el código `CLASS_ALREADY_HAS_TUTOR`, sin cambiar nada. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentarlo en la respuesta `409` de `POST /api/professors`. La detección MUST hacerla el repositorio con la asignación condicionada dentro de la transacción, y solo `errorHandler` MUST convertirla en la respuesta HTTP. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `CLASS_ALREADY_HAS_TUTOR`

#### Scenario: Formato del conflicto
- **GIVEN** una clase con tutor
- **WHEN** se crea un profesor con el `classId` de esa clase
- **THEN** la respuesta es `409` con `success: false` y `error.code` igual a `CLASS_ALREADY_HAS_TUTOR`

#### Scenario: Conflicto documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta `409` de `POST /api/professors`
- **THEN** su descripción indica `CLASS_ALREADY_HAS_TUTOR`

## MODIFIED Requirements

### Requirement: Errores de validación por campo
Los errores de validación de la entrada MUST responder `400` con el código `VALIDATION_ERROR` y un elemento en `details` por cada campo inválido, con la forma `{ "field": "<nombre del campo>", "code": "<código de campo>" }`. Los códigos de campo MUST ser genéricos y reutilizables entre historias: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`, `DUPLICATE` (un elemento repetido de una lista) y `NOT_FOUND` (un campo que apunta a algo que no existe en el colegio). El frontend MUST traducir la pareja campo-código mediante i18n y mostrar el mensaje bajo el campo correspondiente. El contrato MUST definirlo como respuesta reutilizable `ValidationError` en `components.responses`.

#### Scenario: Error de validación documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta reutilizable `ValidationError`
- **THEN** su cuerpo usa el formato de error común con el código `VALIDATION_ERROR` y `details` como lista de objetos `{ field, code }`
- **AND** `code` solo admite `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`, `DUPLICATE` y `NOT_FOUND`
