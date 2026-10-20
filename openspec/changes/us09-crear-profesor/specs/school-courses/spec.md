## ADDED Requirements

### Requirement: Tutor de las clases en las páginas de cursos
La columna «Tutores» de la tabla de `/cursos` y su equivalente en las tarjetas MUST mostrar el nombre y el apellido del tutor de cada clase que lo tenga, como «A: Ana García, B: Luis Pérez» (solo las clases con tutor, en el orden de las clases), y «Sin tutor» si ninguna clase del curso lo tiene. La edición de un curso (`/cursos/:id/editar`) MUST mostrar, en cada fila de una clase que ya existe, su tutor como texto («Tutor: Ana García» o «Sin tutor»), sin selector, y ese texto MUST NOT formar parte del cuerpo del `PUT` ni contar como cambio del formulario. Los nombres MUST pintarse como texto plano.

#### Scenario: Cursos con tutores
- **GIVEN** «1º Primaria» con la clase «A» tutorizada por Ana García y la clase «B» sin tutor
- **WHEN** un usuario abre `/cursos`
- **THEN** la columna «Tutores» de ese curso muestra «A: Ana García»

#### Scenario: Curso sin tutores
- **GIVEN** «2º Primaria» sin ningún tutor
- **THEN** su columna «Tutores» muestra «Sin tutor»

#### Scenario: Tutor en la edición
- **GIVEN** el curso «1º Primaria» con la clase «A» tutorizada por Ana García
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** la fila de la clase «A» muestra «Tutor: Ana García» y la de «B», «Sin tutor»
- **AND** «Guardar» sigue deshabilitado y un cambio del nombre de la clase no envía el tutor en el `PUT`

### Requirement: Los tutores se conservan al editar un curso y se liberan al borrarlo
Editar un curso con `PUT /api/courses/{id}` MUST conservar el tutor de cada clase que mantiene su `id`, también si se renombra, y MUST NOT modificar `classes.tutor_id`. Quitar una clase en una edición MUST dejar libre a su tutor: el profesor sigue existiendo, sin clase. Borrar un curso con `DELETE /api/courses/{id}` MUST dejar libres a los tutores de sus clases (`ON DELETE SET NULL`), sin borrar a ningún profesor.

#### Scenario: Renombrar una clase con tutor
- **GIVEN** la clase «A» tutorizada por Ana García
- **WHEN** se edita el curso y «A» pasa a llamarse «Grupo A»
- **THEN** la respuesta y el listado muestran «Grupo A» con Ana García como tutora

#### Scenario: Quitar una clase con tutor
- **WHEN** se edita el curso sin la clase tutorizada por Ana García
- **THEN** la clase desaparece y Ana García sigue existiendo, con `tutoredClass: null`

#### Scenario: Borrar un curso con tutores
- **GIVEN** un curso cuyas clases tienen tutores
- **WHEN** se borra el curso
- **THEN** el curso y sus clases desaparecen y los profesores siguen existiendo, con `tutoredClass: null`

## MODIFIED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`), `GET /api/courses` (`listCourses`), `GET /api/courses/{id}` (`getCourse`), `PUT /api/courses/{id}` (`updateCourse`), `GET /api/courses/{id}/impact` (`getCourseDeletionImpact`) y `DELETE /api/courses/{id}` (`deleteCourse`), todos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID y `name`), `Course` (`id`, `name`, `createdAt` en ISO 8601 y `classes`), `SchoolClass` (`id`, `name` y `tutor`, que es `null` si la clase no tiene tutor o un `TutorSummary` con `id`, `firstName` y `lastName`), `CourseImpact` (`classCount` y `studentCount`, enteros no negativos) y sus respuestas. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET /api/courses`, `200`, `401`, `500` y `503`; `GET /api/courses/{id}` y `GET /api/courses/{id}/impact`, `200`, `401`, `404`, `500` y `503`; `PUT /api/courses/{id}`, `200`, `400`, `401`, `404`, `409` (`COURSE_ALREADY_EXISTS` o `COURSE_CHANGED`), `500` y `503`; `DELETE /api/courses/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse`, `listCourses`, `getCourse`, `updateCourse`, `getCourseDeletionImpact` y `deleteCourse`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas; el `201` y los `200` de lectura y edición devuelven cada curso con `createdAt` y sus clases con su `tutor` (o `null`), y los del impacto y del borrado, un `CourseImpact`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las seis operaciones y los esquemas, también `createdAt`, el `id` opcional de `UpdateCourseRequest`, `CourseImpact` y `TutorSummary`

### Requirement: Listado de cursos con GET /api/courses
`GET /api/courses` MUST responder `200` con `success: true` y en `data.courses` los cursos del colegio de la identidad, y solo esos, cada uno con `id`, `name`, `createdAt` (ISO 8601) y `classes` (`id`, `name` y `tutor`, que es `null` o `{ id, firstName, lastName }` del profesor que la tutoriza). Los cursos y, dentro de cada uno, las clases MUST ordenarse por nombre con la comparación del castellano y numérica (`localeCompare('es', { numeric: true })`). Sin cursos, `data.courses` MUST ser un array vacío. La respuesta MUST llevar `Cache-Control: no-store`. No admite parámetros de búsqueda ni de paginación.

#### Scenario: Cursos del colegio ordenados
- **GIVEN** un colegio con «10º Curso», «2º Primaria» y «1º Primaria» (clases «B» y «A»), y otro colegio con sus propios cursos
- **WHEN** un usuario del primer colegio pide `GET /api/courses`
- **THEN** recibe «1º Primaria» (clases «A» y «B»), «2º Primaria» y «10º Curso», cada uno con su `createdAt`, y ninguno del otro colegio

#### Scenario: Clase con tutor
- **GIVEN** la clase «A» de «1º Primaria» tutorizada por Ana García
- **WHEN** se pide `GET /api/courses`
- **THEN** esa clase lleva `tutor: { id, firstName: "Ana", lastName: "García" }` y las demás, `tutor: null`

#### Scenario: Colegio sin cursos
- **WHEN** un usuario de un colegio sin cursos pide `GET /api/courses`
- **THEN** la respuesta es `200` con `courses: []`

### Requirement: Leer un curso con GET /api/courses/{id}
`GET /api/courses/{id}` MUST responder `200` con `success: true` y en `data.course` el curso del colegio de la identidad con ese `id`, con la misma forma que en el listado (`id`, `name`, `createdAt` en ISO 8601 y `classes` con `id`, `name` y `tutor`, ordenadas por nombre con `localeCompare('es', { numeric: true })`). Un curso inexistente, de otro colegio o un `id` que no es un UUID MUST responder `404 NOT_FOUND`, con la misma respuesta en los tres casos para no revelar que el curso existe en otro colegio; un `id` que no es un UUID MUST responderse sin consultar la base de datos.

#### Scenario: Curso del colegio
- **GIVEN** el curso «1º Primaria» con las clases «B» y «A» en el colegio de la identidad
- **WHEN** se pide `GET /api/courses/<id>`
- **THEN** la respuesta es `200` con «1º Primaria», su `createdAt` y las clases «A» y «B», cada una con su `id` y su `tutor` (o `null`)

#### Scenario: Curso de otro colegio o inexistente
- **WHEN** se pide el `id` de un curso de otro colegio, un UUID que no existe o el texto `abc`
- **THEN** la respuesta es `404` con `error.code` igual a `NOT_FOUND` en los tres casos
