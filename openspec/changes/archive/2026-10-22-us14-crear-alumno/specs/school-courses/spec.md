## MODIFIED Requirements

### Requirement: Impacto de borrar un curso con GET /api/courses/{id}/impact
`GET /api/courses/{id}/impact` MUST responder `200` con `success: true` y en `data.impact` lo que se perdería al borrar el curso del colegio de la identidad: `classCount` (número de clases del curso) y `studentCount` (número de alumnos del curso, con y sin clase, que se quedarían sin curso ni clase). No MUST cambiar nada. Un curso inexistente, de otro colegio o con un `id` que no es un UUID MUST responder `404 NOT_FOUND`, igual en los tres casos y sin consultar la base de datos con un `id` mal formado. La respuesta MUST llevar `Cache-Control: no-store`.

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

### Requirement: Borrar un curso con DELETE /api/courses/{id}
`DELETE /api/courses/{id}` MUST borrar el curso del colegio de la identidad y todas sus clases en una única transacción, con la fila del curso bloqueada (`FOR UPDATE`) para que no se cruce con una edición del mismo curso ni con el alta de un alumno en ese curso, y responder `200` con `success: true` y en `data.deleted` lo que se borró de verdad (`classCount` y `studentCount`, contados dentro de la misma transacción; `studentCount` son los alumnos del curso, con y sin clase). El borrado MUST ser real (sin papelera) y MUST NOT borrar alumnos: los del curso MUST quedar con `course_id` y `class_id` a `NULL`. Si falla cualquier escritura, MUST NOT quedar ningún cambio. Un curso inexistente, de otro colegio, ya borrado o con un `id` que no es un UUID MUST responder `404 NOT_FOUND` sin borrar nada. De dos borrados simultáneos del mismo curso, MUST terminar uno con `200` y el otro con `404`. Una edición (`PUT`) que se procese después de un borrado del mismo curso MUST responder `404`.

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

### Requirement: Diálogo para borrar un curso
En `/cursos`, cada fila de la tabla y cada tarjeta MUST tener, junto a «Editar», un botón «Borrar» (no un enlace) cuyo nombre accesible incluya el curso («Borrar 1º Primaria»), visible para los dos roles. Al pulsarlo MUST abrirse un diálogo modal (siempre montado, con el foco inicial en «Cancelar», sin botón de cierre de cabecera y que se cierra con Escape) que pide el impacto con `GET /api/courses/{id}/impact` y, mientras llega, muestra un indicador `role="status"` con «Borrar curso» deshabilitado. Con el impacto MUST mostrar «¿Borrar «{nombre}»?», «Se borrarán sus {N} clases» (con plural), «Tiene {M} alumnos asignados» solo si `studentCount` es mayor que 0, y «Esta acción no se puede deshacer», con «Cancelar» y «Borrar curso». Si el impacto no se puede leer, MUST mostrar un `role="alert"` con «Reintentar» y mantener «Borrar curso» deshabilitado. Al confirmar MUST enviar un único `DELETE` (guarda síncrona contra la doble pulsación), deshabilitar los dos botones y mostrar «Borrando…». Con el `200` MUST cerrar el diálogo, quitar el curso del listado sin volver a pedir la lista, mostrar «Curso «{nombre}» eliminado» en un `role="status"` (añadiendo que {M} alumnos quedan sin curso solo si el `studentCount` borrado es mayor que 0) y llevar el foco al título de la página. Con un `404` (al pedir el impacto o al borrar) MUST cerrar el diálogo, volver a pedir la lista y mostrar «Ese curso ya no existe». Con un `503`, un `500` o un error de red al borrar MUST mostrar «No se pudo borrar el curso. Inténtalo de nuevo» con `role="alert"` dentro del diálogo, que sigue abierto. «Cancelar» y Escape MUST cerrar el diálogo sin borrar y devolver el foco al botón «Borrar» del curso. No MUST pedirse una segunda confirmación.

#### Scenario: Diálogo con el impacto
- **GIVEN** el curso «1º Primaria» con tres clases
- **WHEN** se pulsa «Borrar 1º Primaria»
- **THEN** el diálogo muestra «¿Borrar «1º Primaria»?», «Se borrarán sus 3 clases» y «Esta acción no se puede deshacer», y «Cancelar» tiene el foco

#### Scenario: Alumnos asignados
- **GIVEN** que el impacto devuelve `studentCount: 12`
- **THEN** el diálogo muestra «Tiene 12 alumnos asignados»
- **AND** con `studentCount: 0` esa línea no aparece

#### Scenario: Borrar
- **WHEN** se pulsa «Borrar curso»
- **THEN** se envía un solo `DELETE`, el curso desaparece del listado sin volver a pedirlo, se ve «Curso «1º Primaria» eliminado» y el foco está en el título

#### Scenario: Borrar un curso con alumnos
- **GIVEN** que el `DELETE` devuelve `studentCount: 3`
- **THEN** el aviso dice «Curso «1º Primaria» eliminado. 3 alumnos quedan sin curso.»

#### Scenario: Doble pulsación
- **WHEN** se pulsa «Borrar curso» dos veces seguidas
- **THEN** se envía un único `DELETE` y los botones están deshabilitados con «Borrando…»

#### Scenario: Cancelar
- **WHEN** se pulsa «Cancelar» o Escape
- **THEN** el diálogo se cierra sin enviar nada y el foco vuelve a «Borrar 1º Primaria»

#### Scenario: Impacto que no se puede leer
- **GIVEN** que `GET …/impact` responde `503`
- **THEN** el diálogo muestra el error con «Reintentar» y «Borrar curso» deshabilitado

#### Scenario: Fallo al borrar
- **GIVEN** que el `DELETE` responde `503`
- **THEN** el diálogo sigue abierto con «No se pudo borrar el curso. Inténtalo de nuevo» y se puede reintentar

#### Scenario: Curso ya borrado
- **GIVEN** que otra persona ya borró el curso
- **WHEN** se abre el diálogo o se confirma
- **THEN** el diálogo se cierra, la lista se vuelve a pedir y se ve «Ese curso ya no existe»

#### Scenario: Último curso
- **WHEN** se borra el único curso del colegio
- **THEN** el listado muestra «Todavía no hay cursos» con «Crear curso» y sin campo de búsqueda

## ADDED Requirements

### Requirement: Los alumnos se conservan al editar y al borrar un curso
Quitar una clase al editar un curso con `PUT /api/courses/{id}` MUST dejar a sus alumnos en el curso con `class_id` a `NULL` (`ON DELETE SET NULL`), sin borrarlos ni moverlos a otra clase. Renombrar una clase (que conserva su `id`) MUST NOT cambiar la clase de sus alumnos. Borrar un curso MUST dejar a sus alumnos sin curso ni clase. Ninguna operación sobre cursos MUST borrar alumnos.

#### Scenario: Quitar una clase con alumnos
- **GIVEN** un alumno de la clase «A» de «1º Primaria»
- **WHEN** se edita el curso sin la clase «A»
- **THEN** la respuesta es `200` y el alumno sigue en «1º Primaria», sin clase

#### Scenario: Renombrar una clase con alumnos
- **GIVEN** un alumno de la clase «A»
- **WHEN** se edita el curso y «A» pasa a llamarse «Grupo A» con su `id`
- **THEN** el alumno está en «Grupo A»

#### Scenario: Borrar el curso de un alumno
- **GIVEN** un alumno de «1º Primaria» A
- **WHEN** se borra «1º Primaria»
- **THEN** el alumno sigue existiendo, sin curso ni clase
