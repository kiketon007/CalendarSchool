## ADDED Requirements

### Requirement: Reglas de reparto en las páginas de asignaturas
Las páginas de asignaturas MUST mostrar las reglas de reparto en tres sitios:
- **Tarjeta de `/asignaturas`:** el desplegable de cursos MUST decir «{curso}: {n} sesiones · {m} reglas», con plural y sin el sufijo si `constraintCount` es 0.
- **Edición de la asignatura:** al desmarcar un curso cuyo `constraintCount` cargado es mayor que 0, MUST verse bajo ese curso «Al guardar se borrarán sus {m} reglas en {curso}», ligado a su casilla por `aria-describedby`. El aviso MUST desaparecer al volver a marcarlo.
- **`DeleteSubjectModal`:** MUST decir «Se borrarán también {m} reglas», con la suma de los `constraintCount` de sus cursos de la tarjeta, solo si es mayor que 0, sin pedir nada al abrirse.

Los textos MUST estar en `es.json` y `en.json` y la página MUST NOT tener violaciones de `axe` con los avisos.

#### Scenario: Tarjeta con reglas
- **GIVEN** «Inglés» con 4 sesiones y 1 regla en 1º, y 3 sesiones sin reglas en 2º
- **WHEN** se despliegan sus cursos en `/asignaturas`
- **THEN** se ve «1º Primaria: 4 sesiones · 1 regla» y «2º Primaria: 3 sesiones»

#### Scenario: Aviso al desmarcar un curso
- **GIVEN** «Inglés» con 2 reglas en 1º
- **WHEN** el `ADMIN` desmarca 1º en su edición
- **THEN** ve «Al guardar se borrarán sus 2 reglas en 1º Primaria» ligado a la casilla, y al volver a marcarlo el aviso desaparece

#### Scenario: Diálogo de borrado con reglas
- **GIVEN** «Inglés» con 2 reglas en 1º y 1 en 2º
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Se borrarán también 3 reglas»; para una asignatura sin reglas no aparece esa frase

### Requirement: Reglas en las asignaturas de extremo a extremo
`cypress/e2e/subjects.cy.ts` MUST recorrer, con reglas creadas desde la carga del curso:
- Ver «· N reglas» en la tarjeta.
- Desmarcar el curso en la edición, con su aviso, y guardar: las reglas desaparecen.
- Ver «Se borrarán también N reglas» en el diálogo de borrado.

#### Scenario: Recorrido con reglas
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/subjects.cy.ts`
- **THEN** todos los tests pasan

## MODIFIED Requirements

### Requirement: Contrato de las asignaturas en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/subjects` (`createSubject`), `GET /api/subjects` (`listSubjects`), `GET /api/subjects/{id}` (`getSubject`), `PUT /api/subjects/{id}` (`updateSubject`) y `DELETE /api/subjects/{id}` (`deleteSubject`), con seguridad Bearer, y los esquemas `SubjectType` (`CORE`, `ELECTIVE`, `CUSTOM`), `SubjectStatus` (`ACTIVE`, `INACTIVE`), `SubjectColor` (`blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`), `CreateSubjectRequest` (`name`, `type`, `status`, `color` y `courses` obligatorios; `code` y `description` opcionales y admitiendo `null`; `courses` como lista de `{ courseId, sessionsPerWeek }`; sin más propiedades), `UpdateSubjectRequest` (la misma forma), `SubjectCourse` (`id`, `name`, `sessionsPerWeek` y `constraintCount`, el número de reglas de reparto de la asignatura en ese curso, entero no negativo; solo en las respuestas, nunca en las peticiones), `Subject` (`id`, `name`, `code` como texto o `null`, `type`, `status`, `description` como texto o `null`, `color`, `courses` como lista de `SubjectCourse` y `createdAt`) y `DeleteSubjectResponse` (`{ deleted: { id } }`). `POST` MUST declarar `201` (`{ subject: Subject }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/subjects`, `200` (`{ subjects: Subject[] }`), `401`, `500` y `503`; `GET /api/subjects/{id}`, `200` (`{ subject: Subject }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ subject: Subject }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`; `DELETE`, sin cuerpo, `200` (`DeleteSubjectResponse`), `401`, `403`, `404`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `SubjectNotFound` en `components.responses`. Las descripciones de `POST`, `PUT` y `DELETE` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createSubject`, `listSubjects`, `getSubject`, `updateSubject` y `deleteSubject`
- **THEN** las cinco exigen Bearer y declaran las respuestas indicadas, `createSubject`, `updateSubject` y `deleteSubject` declaran `403`, y `getSubject`, `updateSubject` y `deleteSubject` declaran `404` con `SubjectNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los esquemas `CreateSubjectRequest`, `UpdateSubjectRequest`, `Subject`, `SubjectCourse` (con `constraintCount`), `SubjectColor` y `DeleteSubjectResponse`

### Requirement: Cursos al editar una asignatura
Al editar, las filas de `subject_courses` de la asignatura MUST quedar como dice `courses` **aplicando solo las diferencias**: las de los cursos que no están se borran (y sus reglas de reparto caen por la cascada), las de los cursos que siguen con otras sesiones se actualizan, y las de los cursos nuevos se insertan. Las de los cursos que siguen con las mismas sesiones MUST NOT escribirse: conservan su `created_at` y sus reglas. `courses` MUST seguir las reglas del alta (entre 1 y 100, sin repetidos, sesiones de 1 a 5), así que una asignatura que se quedó sin cursos no se puede guardar sin marcar alguno. Un curso de otro colegio o inexistente MUST responder `400` con `NOT_FOUND` en `courses[<i>].courseId` sin cambiar nada. La edición MUST hacerse en una transacción que bloquea primero la fila de la asignatura (`FOR UPDATE`, filtrada por colegio) y después, con `FOR SHARE` y en orden de `id`, la unión de los cursos pedidos y de los que tiene hoy, antes de tocar `subject_courses`; si algo falla, la asignatura MUST conservar todos sus campos y sus cursos.

#### Scenario: Cambiar sesiones, añadir y quitar
- **GIVEN** «Inglés» con 1º (3 sesiones) y 2º (3 sesiones)
- **WHEN** se edita con 1º (2 sesiones) y 3º (2 sesiones)
- **THEN** «Inglés» tiene 1º con 2 sesiones y 3º con 2 sesiones, y ya no tiene 2º

#### Scenario: Asignatura sin cursos
- **GIVEN** «Inglés» sin cursos porque se borró el único que tenía
- **WHEN** se edita solo el nombre con `courses: []`, y después con «2º Primaria»
- **THEN** la primera respuesta es `400` con `REQUIRED` en `courses` y la segunda `200` con «2º Primaria»

#### Scenario: Curso que ya no existe
- **WHEN** se edita con un curso borrado y otro de otro colegio
- **THEN** la respuesta es `400` con `NOT_FOUND` en sus `courses[<i>].courseId` y nada cambia

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la inserción en `subject_courses`
- **WHEN** se edita «Inglés» cambiando el nombre, el color y los cursos
- **THEN** la petición falla y «Inglés» conserva su nombre, su color y sus cursos

#### Scenario: Edición contra borrado de un curso, un alta y un calendario
- **WHEN** se edita una asignatura a la vez que se borra uno de sus cursos (pedido o actual), a la vez que se crea otra asignatura con cursos en común, a la vez que se edita otra asignatura con cursos en común, o a la vez que se edita un calendario que se lleva uno de sus cursos, varias rondas
- **THEN** la edición responde `200` o `400` y el resto termina sin error, nunca con `500` ni interbloqueo

#### Scenario: Guardar sin tocar los cursos conserva las reglas
- **GIVEN** «Inglés» con 1º (4 sesiones), un máximo de 2 al día y bloques de 2 en 1º
- **WHEN** se edita «Inglés» cambiando solo su nombre, y después cambiando sus sesiones en 1º a 5
- **THEN** las dos veces conserva sus 2 reglas en 1º y la fila de 1º conserva su `created_at`

#### Scenario: Quitar un curso borra sus reglas
- **GIVEN** «Inglés» con 2 reglas en 1º y 1 en 2º
- **WHEN** se edita quitando 1º
- **THEN** no queda ninguna regla de «Inglés» en 1º y sigue la de 2º
