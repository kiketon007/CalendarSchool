## MODIFIED Requirements

### Requirement: Errores de validación por campo
Los errores de validación de la entrada MUST responder `400` con el código `VALIDATION_ERROR` y un elemento en `details` por cada campo inválido, con la forma `{ "field": "<nombre del campo>", "code": "<código de campo>" }`. Los códigos de campo MUST ser genéricos y reutilizables entre historias: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`, `DUPLICATE` (un elemento repetido de una lista), `NOT_FOUND` (un campo que apunta a algo que no existe en el colegio), `NOT_ALLOWED` (un campo que no se admite por el valor de otro campo), `INVALID_RANGE` (el final de un intervalo no es posterior a su inicio), `TOO_LONG` (un intervalo que supera la duración máxima) y `OVERLAP` (un intervalo que empieza antes de que acabe el anterior). El frontend MUST traducir la pareja campo-código mediante i18n y mostrar el mensaje bajo el campo correspondiente. El contrato MUST definirlo como respuesta reutilizable `ValidationError` en `components.responses`.

#### Scenario: Error de validación documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta reutilizable `ValidationError`
- **THEN** su cuerpo usa el formato de error común con el código `VALIDATION_ERROR` y `details` como lista de objetos `{ field, code }`
- **AND** `code` solo admite `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`, `DUPLICATE`, `NOT_FOUND`, `NOT_ALLOWED`, `INVALID_RANGE`, `TOO_LONG` y `OVERLAP`

#### Scenario: Campo no admitido por el valor de otro
- **GIVEN** un cuerpo en el que un campo solo se admite según el valor de otro (p. ej. la beca de comedor de un alumno que no come en el comedor)
- **WHEN** se envía con ese campo
- **THEN** la respuesta es `400 VALIDATION_ERROR` con `{ "field": "<campo>", "code": "NOT_ALLOWED" }`

#### Scenario: Intervalos de tiempo
- **GIVEN** un calendario con un periodo que acaba antes de empezar, otro de 100 minutos y otro que empieza antes de que acabe el anterior
- **WHEN** se envía
- **THEN** la respuesta es `400 VALIDATION_ERROR` con `INVALID_RANGE`, `TOO_LONG` y `OVERLAP` en el campo de cada periodo

## ADDED Requirements

### Requirement: Calendario que ya existe en el colegio
Cuando se intenta crear un calendario con un nombre que ya usa otro calendario del mismo colegio (comparado sin mayúsculas ni espacios sobrantes), la API MUST responder `409` con el formato de error común y el código `CALENDAR_ALREADY_EXISTS`. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentarlo en la respuesta `409` de `POST /api/calendars`. La traducción de la violación del índice único a este error MUST hacerla el repositorio por el nombre del índice, y solo `errorHandler` MUST convertirla en la respuesta HTTP.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `CALENDAR_ALREADY_EXISTS`

#### Scenario: Formato del conflicto
- **GIVEN** un colegio con el calendario «Primaria»
- **WHEN** se crea «primaria »
- **THEN** la respuesta es `409` con `success: false` y `error.code` igual a `CALENDAR_ALREADY_EXISTS`
