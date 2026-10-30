## ADDED Requirements

### Requirement: Reglas de reparto en el borrado de un curso
`COURSE_DELETED` MUST llevar además `constraint_count`, las reglas borradas con el curso, sin nombres. `DeleteCourseModal` MUST mostrar «Se borrarán también {n} reglas de reparto», con plural, solo si el `constraintCount` del impacto es mayor que 0. El texto MUST estar en `es.json` y `en.json`.

#### Scenario: Diálogo con reglas
- **GIVEN** 1º con tres clases y 3 reglas de reparto
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Se borrarán sus 3 clases» y «Se borrarán también 3 reglas de reparto»; para un curso sin reglas no aparece esa frase

#### Scenario: Evento con reglas
- **WHEN** se borra 1º con 3 reglas
- **THEN** el log lleva `COURSE_DELETED` con `constraint_count: 3` y ningún nombre

#### Scenario: Recorrido con reglas
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/courses.cy.ts` con un curso con reglas
- **THEN** el diálogo muestra el aviso de las reglas y, tras borrar, las tarjetas de sus asignaturas en `/asignaturas` ya no muestran ese curso ni sus reglas

## MODIFIED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`), `GET /api/courses` (`listCourses`), `GET /api/courses/{id}` (`getCourse`), `PUT /api/courses/{id}` (`updateCourse`), `GET /api/courses/{id}/impact` (`getCourseDeletionImpact`) y `DELETE /api/courses/{id}` (`deleteCourse`), todos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID, `name` y `tutorId` opcional, que es un UUID o `null`), `Course` (`id`, `name`, `createdAt` en ISO 8601, `classes` y `studentCount`, el número de alumnos del curso con y sin clase), `SchoolClass` (`id`, `name`, `tutor`, que es `null` si la clase no tiene tutor o un `TutorSummary` con `id`, `firstName` y `lastName`, y `studentCount`, el número de alumnos de la clase), `CourseImpact` (`classCount`, `studentCount` y `constraintCount`, el número de reglas de reparto del curso, enteros no negativos) y sus respuestas. Los dos `studentCount` MUST ser obligatorios, enteros y no negativos, y su descripción MUST decir que los alumnos del curso sin clase son la diferencia entre el del curso y la suma de los de sus clases. La descripción de `tutorId` MUST indicar que omitirlo no cambia el tutor, que `null` lo quita y que un UUID lo asigna. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET /api/courses`, `200`, `401`, `500` y `503`; `GET /api/courses/{id}` y `GET /api/courses/{id}/impact`, `200`, `401`, `404`, `500` y `503`; `PUT /api/courses/{id}`, `200`, `400`, `401`, `404`, `409` (`COURSE_ALREADY_EXISTS`, `COURSE_CHANGED` o `PROFESSOR_ALREADY_TUTOR`), `500` y `503`; `DELETE /api/courses/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE` y `NOT_FOUND`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse`, `listCourses`, `getCourse`, `updateCourse`, `getCourseDeletionImpact` y `deleteCourse`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas; el `201` y los `200` de lectura y edición devuelven cada curso con `createdAt` y `studentCount` y sus clases con su `tutor` (o `null`) y su `studentCount`, y los del impacto y del borrado, un `CourseImpact`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las seis operaciones y los esquemas, también `createdAt`, el `id` opcional y el `tutorId` opcional (`string | null`) de `UpdateCourseRequest`, `CourseImpact` (con `constraintCount`), `TutorSummary` y el `studentCount` (`number`) de `Course` y de `SchoolClass`

### Requirement: Impacto de borrar un curso con GET /api/courses/{id}/impact
`GET /api/courses/{id}/impact` MUST responder `200` con `success: true` y en `data.impact` lo que se perdería al borrar el curso del colegio de la identidad: `classCount` (número de clases del curso), `studentCount` (número de alumnos del curso, con y sin clase, que se quedarían sin curso ni clase) y `constraintCount` (número de reglas de reparto de cualquier asignatura en el curso, que se borrarían por la cascada). No MUST cambiar nada. Un curso inexistente, de otro colegio o con un `id` que no es un UUID MUST responder `404 NOT_FOUND`, igual en los tres casos y sin consultar la base de datos con un `id` mal formado. La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Impacto de un curso con clases
- **GIVEN** el curso «1º Primaria» con las clases «A», «B» y «C» en el colegio de la identidad, y sin alumnos
- **WHEN** se pide `GET /api/courses/<id>/impact`
- **THEN** la respuesta es `200` con `{ "impact": { "classCount": 3, "studentCount": 0 } }` y el curso sigue igual

#### Scenario: Impacto de un curso con alumnos
- **GIVEN** el curso «1º Primaria» con dos alumnos en la clase «A» y uno sin clase, y otro curso con un alumno
- **WHEN** se pide el impacto de «1º Primaria»
- **THEN** `studentCount` es `3`

#### Scenario: Curso ajeno o inexistente
- **WHEN** se pide el impacto de un curso de otro colegio, de un UUID que no existe o de `abc`
- **THEN** la respuesta es `404` con `error.code` igual a `NOT_FOUND` en los tres casos

#### Scenario: Impacto de un curso con reglas
- **GIVEN** 1º con 2 reglas de «Inglés» y 1 de «Plástica»
- **WHEN** se pide su impacto
- **THEN** `constraintCount` es 3

### Requirement: Borrar un curso con DELETE /api/courses/{id}
`DELETE /api/courses/{id}` MUST borrar el curso del colegio de la identidad y todas sus clases en una única transacción, con la fila del curso bloqueada (`FOR UPDATE`) para que no se cruce con una edición del mismo curso ni con el alta de un alumno en ese curso, y responder `200` con `success: true` y en `data.deleted` lo que se borró de verdad (`classCount`, `studentCount` y `constraintCount`, contados dentro de la misma transacción antes de borrar; `studentCount` son los alumnos del curso, con y sin clase). Las reglas de reparto del curso MUST caer por la cascada desde `subject_courses`. El borrado MUST ser real (sin papelera) y MUST NOT borrar alumnos: los del curso MUST quedar con `course_id` y `class_id` a `NULL`. Si falla cualquier escritura, MUST NOT quedar ningún cambio. Un curso inexistente, de otro colegio, ya borrado o con un `id` que no es un UUID MUST responder `404 NOT_FOUND` sin borrar nada. De dos borrados simultáneos del mismo curso, MUST terminar uno con `200` y el otro con `404`. Una edición (`PUT`) que se procese después de un borrado del mismo curso MUST responder `404`.

#### Scenario: Borrar un curso con sus clases
- **GIVEN** el curso «1º Primaria» con las clases «A», «B» y «C» y sin alumnos
- **WHEN** se envía `DELETE /api/courses/<id>`
- **THEN** la respuesta es `200` con `{ "deleted": { "classCount": 3, "studentCount": 0 } }`, y en la base de datos no quedan ni el curso ni sus clases

#### Scenario: Borrar un curso con alumnos
- **GIVEN** el curso «1º Primaria» con dos alumnos en la clase «A» y uno sin clase
- **WHEN** se borra el curso
- **THEN** la respuesta lleva `studentCount: 3` y los tres alumnos siguen existiendo, sin curso ni clase

#### Scenario: Curso de otro colegio
- **WHEN** se envía `DELETE` con el `id` de un curso de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y ese curso y sus clases siguen existiendo

#### Scenario: Atomicidad
- **GIVEN** que una de las escrituras de la transacción falla
- **WHEN** se procesa el borrado
- **THEN** el curso y todas sus clases siguen existiendo y los alumnos conservan su curso y su clase

#### Scenario: Borrados simultáneos
- **WHEN** se envían a la vez dos `DELETE` del mismo curso
- **THEN** uno responde `200` y el otro `404`, y el curso ya no existe

#### Scenario: Borrar mientras otra persona edita
- **WHEN** se envían a la vez un `DELETE` y un `PUT` del mismo curso
- **THEN** ninguna respuesta es `500`, y si el `PUT` se procesa después del borrado responde `404`

#### Scenario: Borrar un curso con reglas
- **GIVEN** 1º con 3 reglas de reparto
- **WHEN** se borra 1º
- **THEN** `data.deleted.constraintCount` es 3 y no queda ninguna regla de 1º
