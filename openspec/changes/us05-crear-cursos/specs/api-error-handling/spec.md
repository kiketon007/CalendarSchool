## ADDED Requirements

### Requirement: Curso que ya existe en el colegio
Cuando se intenta crear un curso con un nombre que ya usa otro curso del mismo colegio (comparado sin mayúsculas ni espacios sobrantes), la API MUST responder `409` con el formato de error común y el código `COURSE_ALREADY_EXISTS`. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentarlo en la respuesta `409` de `POST /api/courses`. La traducción de la violación del índice único a este error MUST hacerla el repositorio por el nombre del índice, y solo `errorHandler` MUST convertirla en la respuesta HTTP. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `COURSE_ALREADY_EXISTS`

#### Scenario: Formato del conflicto
- **GIVEN** un colegio con el curso «1º Primaria»
- **WHEN** se crea «1º primaria»
- **THEN** la respuesta es `409` con `success: false` y `error.code` igual a `COURSE_ALREADY_EXISTS`

#### Scenario: Conflicto documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta `409` de `POST /api/courses`
- **THEN** su descripción indica `COURSE_ALREADY_EXISTS`
