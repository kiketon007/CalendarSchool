## ADDED Requirements

### Requirement: Profesor que ya es tutor de otra clase
Cuando una edición de un curso intenta asignar como tutor a un profesor que ya tutoriza una clase que esa misma edición no libera (de otro curso, o porque otra petición se la asignó a la vez), la API MUST responder `409` con el formato de error común y el código `PROFESSOR_ALREADY_TUTOR`, sin guardar ningún cambio de la edición. El código MUST estar a la vez en el enum `ErrorCode` del contrato y en `ERROR_CODES` del backend, y el contrato MUST documentarlo en la respuesta `409` de `PUT /api/courses/{id}`. La detección MUST hacerla el dominio (el plan de la edición) o el repositorio (la violación del índice único `classes_tutor_id_key`) dentro de la transacción, y solo `errorHandler` MUST convertirla en la respuesta HTTP. El mensaje de error MUST ir en castellano y dirigido a desarrolladores; el frontend traduce por `code`.

#### Scenario: Código alineado
- **WHEN** se ejecutan los tests de `appError`
- **THEN** `ERROR_CODES` y el enum `ErrorCode` del contrato contienen `PROFESSOR_ALREADY_TUTOR`

#### Scenario: Formato del conflicto
- **GIVEN** que Ana García tutoriza una clase de «2º Primaria»
- **WHEN** se edita «1º Primaria» con `tutorId` de Ana García en una de sus clases
- **THEN** la respuesta es `409` con `success: false` y `error.code` igual a `PROFESSOR_ALREADY_TUTOR`, y ninguno de los dos cursos cambia

#### Scenario: Conflicto documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta `409` de `PUT /api/courses/{id}`
- **THEN** su descripción indica `COURSE_ALREADY_EXISTS`, `COURSE_CHANGED` y `PROFESSOR_ALREADY_TUTOR`
