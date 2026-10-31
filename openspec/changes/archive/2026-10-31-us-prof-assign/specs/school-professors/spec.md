## MODIFIED Requirements

### Requirement: Contrato de los profesores en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/professors` (`createProfessor`), `GET /api/professors` (`listProfessors`), `GET /api/professors/{id}` (`getProfessor`), `PUT /api/professors/{id}` (`updateProfessor`) y `DELETE /api/professors/{id}` (`deleteProfessor`), todos con seguridad Bearer, con los esquemas `CreateProfessorRequest` (`firstName`, `lastName`, `position` y `classId` opcionales), `UpdateProfessorRequest` (`firstName` y `lastName` obligatorios; `position` y `classId` opcionales, que admiten `null`), `Professor` (`id`, `firstName`, `lastName`, `position` que es `DIRECTOR`, `JEFE_ESTUDIOS` o `null`, `subjects`, la lista de lo que tiene asignado (US-PROF-ASSIGN) como `ProfessorSubject` (`{ subjectId, subjectName, courseId, courseName, classId, className, sessionsPerWeek }`, en orden natural por asignatura, curso y clase; vacía si no tiene asignaciones), y `tutoredClass`, que es `null` o `{ id, name, courseId, courseName }`), la respuesta de la edición `{ professor, replacedTutor }`, donde `replacedTutor` es `null` o `{ id, firstName, lastName }`, y la del borrado `{ deleted: { freedClass } }`, donde `freedClass` es `null` o `{ id, name, courseName }`. `POST` MUST declarar `201`, `400`, `401`, `409` (`CLASS_ALREADY_HAS_TUTOR`), `500` y `503`; `GET /api/professors`, `200`, `401`, `500` y `503`; `GET /api/professors/{id}`, `200`, `401`, `404`, `500` y `503`; `PUT /api/professors/{id}`, `200`, `400`, `401`, `404`, `409` (`PROFESSOR_ALREADY_TUTOR`), `500` y `503`; `DELETE /api/professors/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `NOT_FOUND` y el enum `ErrorCode` MUST incluir `CLASS_ALREADY_HAS_TUTOR`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createProfessor`, `listProfessors`, `getProfessor`, `updateProfessor` y `deleteProfessor`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas, y cada profesor devuelto lleva `subjects` como lista de `ProfessorSubject` y `tutoredClass`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los esquemas

### Requirement: Listado de profesores con GET /api/professors
`GET /api/professors` MUST responder `200` con `success: true` y en `data.professors` los profesores del colegio de la identidad, y solo esos, cada uno con `id`, `firstName`, `lastName`, `position`, `subjects` (sus asignaciones, leídas en la misma consulta del listado y no una por profesor) y `tutoredClass`. MUST ordenarlos por apellido y después por nombre con la comparación del castellano y numérica. Sin profesores, `data.professors` MUST ser un array vacío. La respuesta MUST llevar `Cache-Control: no-store`. No admite parámetros de búsqueda ni de paginación.

#### Scenario: Profesores del colegio ordenados
- **GIVEN** un colegio con «Pérez, Luis», «García, Ana» y «García, Álvaro», y otro colegio con sus propios profesores
- **WHEN** un usuario del primer colegio pide `GET /api/professors`
- **THEN** recibe «García, Álvaro», «García, Ana» y «Pérez, Luis», cada uno con su `tutoredClass`, y ninguno del otro colegio

#### Scenario: Colegio sin profesores
- **WHEN** un usuario de un colegio sin profesores pide `GET /api/professors`
- **THEN** la respuesta es `200` con `professors: []`

#### Scenario: Asignaturas de cada profesor
- **GIVEN** «Ruiz, Eva» asignada a Inglés en 1º Primaria A y en 1º Primaria B, y «Pérez, Luis» sin asignaciones
- **WHEN** se pide `GET /api/professors`
- **THEN** Eva Ruiz lleva dos `subjects`, con «Inglés», «1º Primaria», la clase y las sesiones de Inglés en 1º, y Luis Pérez lleva `subjects: []`

### Requirement: Búsqueda de profesores por nombre y apellidos
Con profesores, la página `/profesores` MUST mostrar encima del listado un campo `type="search"` con la etiqueta visible «Buscar por nombre, apellidos o asignatura», que admita como mucho 100 caracteres. Al escribir, sin retraso ni petición al servidor, MUST mostrar solo los profesores en cuyo nombre, apellidos o nombres de sus asignaturas asignadas aparecen **todas** las palabras del texto, en cualquier orden y como parte de una palabra, sin distinguir mayúsculas, acentos (la `ñ` busca como `n`) ni espacios sobrantes; los guiones y apóstrofos MUST tratarse como texto normal. MUST conservar el orden de la API. Un texto vacío o solo con espacios MUST NOT filtrar. Mientras hay texto, la línea del total MUST ser un `role="status"` con «Mostrando N de M profesores»; sin texto, «M profesores» sin `role="status"`. Sin coincidencias, MUST mostrar «No hay profesores que coincidan con «X»» (el texto como texto plano) y un botón «Limpiar búsqueda» que vacía el campo, muestra todos y devuelve el foco al campo, sin paginación. MUST NOT buscar por cargo, tutoría, curso ni clase. El texto MUST vivir solo en el estado de la página (ni en la URL ni en almacenamiento).

#### Scenario: Por nombre
- **GIVEN** «García, Ana», «López, Juana» y «Pérez, Juan»
- **WHEN** escribe «juan»
- **THEN** ve «López, Juana» y «Pérez, Juan», en ese orden, y «Mostrando 2 de 3 profesores»

#### Scenario: Por apellido
- **GIVEN** «Hernández, Eva», «Hernán, Pau» y «García, Ana»
- **WHEN** escribe «hern»
- **THEN** ve «Hernández, Eva» y «Hernán, Pau»

#### Scenario: Mayúsculas y acentos
- **WHEN** escribe «GARCIA», «garcía» o «  garcia  »
- **THEN** ve «García, Ana»

#### Scenario: Varias palabras en cualquier orden
- **GIVEN** «García, Ana», «García, Luis» y «Pérez, Ana»
- **WHEN** escribe «ana garcia» o «garcia ana»
- **THEN** ve solo «García, Ana»

#### Scenario: Guiones y apóstrofos
- **GIVEN** «García-López, José María» y «O'Neill, Mary»
- **WHEN** escribe «garcía-lópez», «lopez» u «o'neill»
- **THEN** ve el profesor correspondiente

#### Scenario: Sin resultados
- **WHEN** escribe «zzz»
- **THEN** ve «No hay profesores que coincidan con «zzz»» y «Limpiar búsqueda», sin paginación; al pulsarlo, el campo se vacía, vuelven todos y el foco está en el campo

#### Scenario: Texto vacío
- **WHEN** el campo está vacío o solo tiene espacios
- **THEN** ve todos los profesores y «M profesores», sin `role="status"`

#### Scenario: Texto como texto plano
- **WHEN** escribe «<b>x</b>»
- **THEN** el mensaje sin resultados muestra ese texto literal, sin interpretarlo como marcado

#### Scenario: Límite de caracteres
- **WHEN** intenta escribir más de 100 caracteres
- **THEN** el campo no admite más

#### Scenario: Por asignatura
- **GIVEN** «Ruiz, Eva» con Inglés asignado y «García, Ana» con Lengua
- **WHEN** escribe «ingl» o «eva ingles»
- **THEN** ve solo «Ruiz, Eva»

## ADDED Requirements

### Requirement: Asignaturas en el listado de profesores
`ProfessorsPage` MUST mostrar las asignaturas de cada profesor en una columna «Asignaturas», entre «Cargo» y «Tutoría», y en un `dt`/`dd` de cada tarjeta:
- se agrupan por asignatura en orden natural, con sus clases como «{curso} {clase}» separadas por comas y los grupos separados por « · », por ejemplo «Inglés: 1º Primaria A, 1º Primaria B · Lengua: 2º Primaria A»;
- sin asignaciones, «Sin asignaturas», con el color secundario del tema;
- el texto es texto plano.

`professorsService` MUST validar cada `ProfessorSubject` y dejar de exigir la lista vacía: cualquier otra forma es `unavailable`.

#### Scenario: Columna en la tabla
- **GIVEN** «Ruiz, Eva» con Inglés en 1º Primaria A y B
- **WHEN** abro «Profesores» desde 768 px
- **THEN** su fila dice «Inglés: 1º Primaria A, 1º Primaria B» en «Asignaturas»

#### Scenario: Sin asignaturas
- **GIVEN** un profesor sin asignaciones
- **THEN** su columna dice «Sin asignaturas»

#### Scenario: En las tarjetas
- **WHEN** abro «Profesores» a 360 px
- **THEN** cada tarjeta lleva sus asignaturas con la misma forma
