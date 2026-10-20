## ADDED Requirements

### Requirement: Curso cambiado por otra persona
Cuando la edición de un curso incluye una clase que ya no pertenece a ese curso (otra persona la quitó mientras se editaba, o es de otro curso), la API MUST responder `409` con el formato de error común y el código `COURSE_CHANGED`, sin guardar ningún cambio. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentarlo en la respuesta `409` de `PUT /api/courses/{id}`. La detección MUST hacerla el repositorio dentro de la transacción, y solo `errorHandler` MUST convertirla en la respuesta HTTP. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `COURSE_CHANGED`

#### Scenario: Formato del conflicto
- **GIVEN** un curso cuya clase «B» se ha quitado
- **WHEN** se edita enviando el `id` antiguo de «B»
- **THEN** la respuesta es `409` con `success: false` y `error.code` igual a `COURSE_CHANGED`

## MODIFIED Requirements

### Requirement: Curso que ya existe en el colegio
Cuando se intenta crear un curso, o cambiar el nombre de uno, con un nombre que ya usa otro curso del mismo colegio (comparado sin mayúsculas ni espacios sobrantes), la API MUST responder `409` con el formato de error común y el código `COURSE_ALREADY_EXISTS`. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentarlo en las respuestas `409` de `POST /api/courses` y de `PUT /api/courses/{id}`. La traducción de la violación del índice único a este error MUST hacerla el repositorio por el nombre del índice, y solo `errorHandler` MUST convertirla en la respuesta HTTP. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `COURSE_ALREADY_EXISTS`

#### Scenario: Formato del conflicto
- **GIVEN** un colegio con el curso «1º Primaria»
- **WHEN** se crea «1º primaria»
- **THEN** la respuesta es `409` con `success: false` y `error.code` igual a `COURSE_ALREADY_EXISTS`

#### Scenario: Conflicto al editar
- **GIVEN** un colegio con los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se cambia el nombre de «2º Primaria» a «1º primaria»
- **THEN** la respuesta es `409` con `error.code` igual a `COURSE_ALREADY_EXISTS`

#### Scenario: Conflicto documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan las respuestas `409` de `POST /api/courses` y de `PUT /api/courses/{id}`
- **THEN** ambas indican `COURSE_ALREADY_EXISTS`, y la de `PUT` también `COURSE_CHANGED`
