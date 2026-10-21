## MODIFIED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`), `GET /api/courses` (`listCourses`), `GET /api/courses/{id}` (`getCourse`), `PUT /api/courses/{id}` (`updateCourse`), `GET /api/courses/{id}/impact` (`getCourseDeletionImpact`) y `DELETE /api/courses/{id}` (`deleteCourse`), todos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID, `name` y `tutorId` opcional, que es un UUID o `null`), `Course` (`id`, `name`, `createdAt` en ISO 8601 y `classes`), `SchoolClass` (`id`, `name` y `tutor`, que es `null` si la clase no tiene tutor o un `TutorSummary` con `id`, `firstName` y `lastName`), `CourseImpact` (`classCount` y `studentCount`, enteros no negativos) y sus respuestas. La descripción de `tutorId` MUST indicar que omitirlo no cambia el tutor, que `null` lo quita y que un UUID lo asigna. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET /api/courses`, `200`, `401`, `500` y `503`; `GET /api/courses/{id}` y `GET /api/courses/{id}/impact`, `200`, `401`, `404`, `500` y `503`; `PUT /api/courses/{id}`, `200`, `400`, `401`, `404`, `409` (`COURSE_ALREADY_EXISTS`, `COURSE_CHANGED` o `PROFESSOR_ALREADY_TUTOR`), `500` y `503`; `DELETE /api/courses/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE` y `NOT_FOUND`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse`, `listCourses`, `getCourse`, `updateCourse`, `getCourseDeletionImpact` y `deleteCourse`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas; el `201` y los `200` de lectura y edición devuelven cada curso con `createdAt` y sus clases con su `tutor` (o `null`), y los del impacto y del borrado, un `CourseImpact`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las seis operaciones y los esquemas, también `createdAt`, el `id` opcional y el `tutorId` opcional (`string | null`) de `UpdateCourseRequest`, `CourseImpact` y `TutorSummary`

### Requirement: Eventos de log de los cursos
El backend MUST registrar `COURSE_CREATED` con `school_id`, `actor_id`, `course_id` y `class_count` tras crear un curso, y `COURSE_CREATION_REJECTED` con `school_id`, `actor_id` y `reason: "duplicate"` cuando el nombre ya existe. Tras editar un curso MUST registrar `COURSE_UPDATED` con `school_id`, `actor_id`, `course_id`, `classes_added`, `classes_removed`, `classes_renamed` y `tutors_changed` (las clases cuyo tutor se asigna, se cambia o se quita en esa edición), y al rechazar una edición, `COURSE_UPDATE_REJECTED` con `school_id`, `actor_id`, `course_id` y `reason` igual a `"duplicate"` (nombre ya usado), `"changed"` (curso cambiado por otra persona), `"professor_not_found"` (tutor inexistente o de otro colegio) o `"professor_already_tutor"` (tutor de otra clase que la edición no libera). Tras borrar un curso MUST registrar `COURSE_DELETED` con `school_id`, `actor_id`, `course_id`, `class_count` y `student_count` (lo que se borró de verdad). Pedir el impacto MUST NOT registrar nada. Los eventos MUST NOT incluir los nombres del curso, de las clases ni de los profesores.

#### Scenario: Curso creado
- **WHEN** se crea un curso con dos clases
- **THEN** el log tiene `COURSE_CREATED` con `class_count: 2` y sin los nombres

#### Scenario: Curso duplicado
- **WHEN** se rechaza un curso por nombre repetido
- **THEN** el log tiene `COURSE_CREATION_REJECTED` con `reason: "duplicate"`

#### Scenario: Curso editado
- **WHEN** se edita un curso quitando una clase, añadiendo otra, renombrando una tercera y asignando el tutor de una cuarta
- **THEN** el log tiene `COURSE_UPDATED` con `classes_added: 1`, `classes_removed: 1`, `classes_renamed: 1` y `tutors_changed: 1`, sin los nombres

#### Scenario: Edición rechazada
- **WHEN** se rechaza una edición por nombre repetido, por curso cambiado, por un tutor que no existe o por un tutor de otra clase
- **THEN** el log tiene `COURSE_UPDATE_REJECTED` con `reason` igual a `"duplicate"`, `"changed"`, `"professor_not_found"` o `"professor_already_tutor"`

#### Scenario: Curso borrado
- **WHEN** se borra un curso con tres clases
- **THEN** el log tiene `COURSE_DELETED` con `class_count: 3` y `student_count: 0`, sin los nombres
- **AND** un borrado que responde `404` no deja `COURSE_DELETED`

### Requirement: Editar un curso y sus clases con PUT /api/courses/{id}
`PUT /api/courses/{id}` MUST recibir `{ name, classes: [{ id?, name, tutorId? }] }` y dejar el curso del colegio de la identidad exactamente en ese estado, en una única transacción: cada clase con `id` MUST conservar ese `id` y tomar el nombre recibido; cada clase sin `id` MUST crearse con un UUIDv7 nuevo; cada clase guardada cuyo `id` no aparece MUST borrarse. Dentro de la transacción MUST actualizarse primero el nombre del curso y su `updated_at` (así un nombre ya usado falla sin haber escrito nada más), después borrarse las clases ausentes, renombrarse en dos fases las que cambian de nombre (primero a un nombre temporal que no puede coincidir con un nombre válido y luego al definitivo), crearse las nuevas y por último escribirse los tutores (ver «Asignar, cambiar, mover y quitar tutores al editar un curso»), de modo que un intercambio de nombres entre clases, la reutilización del nombre de una clase quitada y un intercambio de tutores se guarden sin error. Si falla cualquier escritura, MUST NOT quedar ningún cambio. La respuesta MUST ser `200` con `success: true` y en `data.course` el estado final con la forma del listado (también el `tutor` de cada clase), con `createdAt` sin cambios. MUST ignorar las propiedades desconocidas del cuerpo, también un `schoolId` o un `tutor`. Un `PUT` idéntico al estado guardado MUST responder `200` y dejar los mismos datos. Un curso inexistente, de otro colegio o un `id` que no es un UUID MUST responder `404 NOT_FOUND` sin cambiar nada.

#### Scenario: Cambiar el nombre del curso
- **GIVEN** el curso «1º Primaria» con la clase «A»
- **WHEN** se envía `{ "name": "1º Primaria Tarde", "classes": [{ "id": "<id de A>", "name": "A" }] }`
- **THEN** la respuesta es `200` con «1º Primaria Tarde», la clase «A» con el mismo `id` y el mismo `createdAt`

#### Scenario: Renombrar una clase conserva su identidad
- **WHEN** la clase «A» se envía con su `id` y el nombre «Grupo A»
- **THEN** la respuesta y la base de datos tienen la clase «Grupo A» con el `id` que tenía «A»

#### Scenario: Añadir y quitar clases
- **GIVEN** el curso con las clases «A», «B» y «C»
- **WHEN** se envían «A» y «B» con sus `id` y «D» sin `id`
- **THEN** el curso tiene «A», «B» y «D»; «C» ya no existe y «D» tiene un `id` nuevo

#### Scenario: Intercambio de nombres
- **GIVEN** las clases «A» (id 1) y «B» (id 2)
- **WHEN** se envían `{ id: 1, name: "B" }` y `{ id: 2, name: "A" }`
- **THEN** la respuesta es `200` y la clase 1 se llama «B» y la 2, «A»

#### Scenario: Reutilizar el nombre de una clase quitada
- **GIVEN** las clases «A» y «C»
- **WHEN** se envía «A» con su `id` y una «C» sin `id`
- **THEN** la respuesta es `200`, el curso tiene «A» y «C», y la nueva «C» tiene un `id` distinto del de la anterior

#### Scenario: Atomicidad
- **GIVEN** que una de las escrituras de la transacción falla
- **WHEN** se procesa la petición
- **THEN** el curso, todas sus clases y sus tutores quedan como estaban

#### Scenario: Curso de otro colegio
- **WHEN** se envía un `PUT` válido con el `id` de un curso de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y ese curso no cambia

#### Scenario: Propiedades desconocidas
- **WHEN** el cuerpo incluye un `schoolId` de otro colegio o un objeto `tutor` en una clase
- **THEN** se ignoran: el curso sigue en el colegio de la identidad y sus tutores no cambian

### Requirement: Validación de la edición de un curso
El cuerpo de `PUT /api/courses/{id}` MUST cumplir las reglas de los nombres del curso y de sus clases (de 1 a 12 clases, nombres válidos y únicos dentro del curso) y, además, cada `id` de clase presente MUST ser un UUID (`INVALID_FORMAT` en `classes[<i>].id`) y MUST NOT repetirse en el cuerpo (`DUPLICATE` en `classes[<i>].id`, en la segunda y siguientes apariciones). Cada `tutorId` presente MUST ser un UUID o `null` (`INVALID_FORMAT` en `classes[<i>].tutorId`) y el mismo profesor MUST NOT elegirse en dos clases del cuerpo (`DUPLICATE` en `classes[<i>].tutorId`, en la segunda y siguientes apariciones, sin distinguir mayúsculas). Dentro de una clase, los errores MUST salir en el orden `id`, `tutorId` y `name`. Una petición no válida MUST responder `400 VALIDATION_ERROR` con un elemento `{ field, code }` por cada campo inválido, sin cambiar nada. Un `tutorId` que no es de un profesor del colegio de la identidad (inexistente o de otro colegio, sin distinguirlos) MUST responder `400 VALIDATION_ERROR` con `{ field: "classes[<i>].tutorId", code: "NOT_FOUND" }`, sin cambiar nada.

#### Scenario: Id de clase no válido
- **WHEN** la segunda clase se envía con `"id": "abc"`
- **THEN** la respuesta es `400` con `{ field: "classes[1].id", code: "INVALID_FORMAT" }`

#### Scenario: Id de clase repetido
- **WHEN** dos clases se envían con el mismo `id`
- **THEN** la respuesta es `400` con `{ field: "classes[1].id", code: "DUPLICATE" }` y no cambia nada

#### Scenario: Reglas de US05 al editar
- **WHEN** se envía un nombre vacío, `classes: []`, 13 clases o dos clases «A» y «a»
- **THEN** la respuesta es `400` con los mismos campos y códigos que al crear

#### Scenario: Tutor no válido
- **WHEN** la primera clase se envía con `"tutorId": "abc"` o con `"tutorId": 5`
- **THEN** la respuesta es `400` con `{ field: "classes[0].tutorId", code: "INVALID_FORMAT" }`

#### Scenario: Mismo profesor en dos clases
- **WHEN** dos clases se envían con el mismo `tutorId`
- **THEN** la respuesta es `400` con `{ field: "classes[1].tutorId", code: "DUPLICATE" }` y no cambia nada

#### Scenario: Profesor que no existe en el colegio
- **WHEN** una clase se envía con el `tutorId` de un profesor de otro colegio o con un UUID que no es de ningún profesor
- **THEN** la respuesta es `400` con `{ field: "classes[<i>].tutorId", code: "NOT_FOUND" }`, igual en los dos casos, y no cambia nada

### Requirement: Página de edición de un curso
La página `/cursos/:id/editar` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y pedir el curso una sola vez (también con `StrictMode`), con un indicador `role="status"` mientras carga. Con un `404` MUST mostrar «Este curso no existe o ya no está disponible» con un enlace a «Cursos»; con un `503` o un error de red, «No se ha podido cargar el curso» con «Reintentar». Con el curso cargado MUST mostrar el mismo formulario que la creación (nombre del curso y una fila por clase, en el orden del servidor), relleno con los datos actuales, con las mismas reglas compartidas al enviar, los mismos límites de filas (añadir hasta 12, quitar cualquiera salvo la última) y la misma guarda síncrona contra el doble envío, y además el tutor de cada fila (ver «Elegir el tutor de cada clase en la edición del curso»). Quitar una fila MUST NOT pedir confirmación ni borrar nada hasta guardar. «Guardar» MUST estar deshabilitado mientras el formulario no tenga cambios reales respecto a lo cargado (comparando los valores recortados y con los espacios colapsados, también el orden y el número de filas y el tutor elegido) y mientras se envía. Con el `200` MUST navegar a `/cursos` reemplazando la entrada del historial y pasar el nombre para el aviso «Curso «{nombre}» actualizado». Un `400` MUST marcar sus campos; un `409 COURSE_ALREADY_EXISTS`, el nombre del curso con «Ya existe un curso con este nombre. Usa otro» y el foco en él; un `409 COURSE_CHANGED` MUST mostrar con `role="alert"` «Otra persona ha cambiado este curso. Recárgalo para ver la versión actual (se perderán tus cambios)» y un botón «Recargar» que vuelve a pedir el curso y rellena el formulario con lo guardado; un `409 PROFESSOR_ALREADY_TUTOR`, lo que dice «Elegir el tutor de cada clase en la edición del curso»; un `404`, el mensaje de curso no disponible; un `503`, un `500` o un error de red MUST mostrar «No se pudo guardar el curso. Inténtalo de nuevo» con `role="alert"`, conservando lo escrito. «Cancelar» MUST volver a `/cursos` sin guardar.

#### Scenario: Formulario relleno
- **GIVEN** el curso «1º Primaria» con las clases «A» y «B»
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** el nombre es «1º Primaria», hay dos filas «A» y «B» y «Guardar» está deshabilitado

#### Scenario: Sin cambios reales
- **WHEN** se escribe un espacio al final del nombre, se cambia una clase y se vuelve a dejar como estaba, o se vuelve a elegir el tutor que ya tenía una fila
- **THEN** «Guardar» sigue deshabilitado

#### Scenario: Guardar los cambios
- **WHEN** se cambia el nombre a «1º Primaria Tarde», se renombra «A» a «Grupo A», se añade «C» y se pulsa «Guardar»
- **THEN** se envía un solo `PUT` con «Grupo A» y «B» con sus `id` y «C» sin `id`, y la aplicación navega a `/cursos` con «Curso «1º Primaria Tarde» actualizado»

#### Scenario: Nombre que ya existe
- **GIVEN** que la API responde `409 COURSE_ALREADY_EXISTS`
- **THEN** el nombre muestra «Ya existe un curso con este nombre. Usa otro», tiene el foco y el formulario conserva lo escrito

#### Scenario: Curso cambiado
- **GIVEN** que la API responde `409 COURSE_CHANGED`
- **THEN** se ve el aviso de curso cambiado con «Recargar»
- **AND** al pulsar «Recargar» se vuelve a pedir el curso y el formulario muestra lo guardado

#### Scenario: Curso no disponible
- **WHEN** se abre `/cursos/<id>/editar` con un curso que no existe o es de otro colegio, o el `PUT` responde `404`
- **THEN** se ve «Este curso no existe o ya no está disponible» con un enlace a «Cursos»

#### Scenario: Error del servidor al guardar
- **GIVEN** que la API responde `503`
- **THEN** se ve «No se pudo guardar el curso. Inténtalo de nuevo» con `role="alert"`, sin mensajes técnicos, y lo escrito se conserva

#### Scenario: Cancelar
- **WHEN** se cambian campos y se pulsa «Cancelar»
- **THEN** la aplicación vuelve a `/cursos` sin enviar nada

### Requirement: Tutor de las clases en las páginas de cursos
La columna «Tutores» de la tabla de `/cursos` y su equivalente en las tarjetas MUST mostrar el nombre y el apellido del tutor de cada clase que lo tenga, como «A: Ana García, B: Luis Pérez» (solo las clases con tutor, en el orden de las clases), y «Sin tutor» si ninguna clase del curso lo tiene. La edición de un curso (`/cursos/:id/editar`) MUST permitir elegir el tutor de cada fila con un desplegable (ver «Elegir el tutor de cada clase en la edición del curso»); solo si la lista de profesores no se puede cargar MUST mostrar, en cada fila de una clase que ya existe, su tutor como texto («Tutor: Ana García» o «Sin tutor»), y ese texto MUST NOT formar parte del cuerpo del `PUT` ni contar como cambio del formulario. Los nombres MUST pintarse como texto plano.

#### Scenario: Cursos con tutores
- **GIVEN** «1º Primaria» con la clase «A» tutorizada por Ana García y la clase «B» sin tutor
- **WHEN** un usuario abre `/cursos`
- **THEN** la columna «Tutores» de ese curso muestra «A: Ana García»

#### Scenario: Curso sin tutores
- **GIVEN** «2º Primaria» sin ningún tutor
- **THEN** su columna «Tutores» muestra «Sin tutor»

#### Scenario: Tutor de solo lectura si los profesores no cargan
- **GIVEN** el curso «1º Primaria» con la clase «A» tutorizada por Ana García, y que `GET /api/professors` falla
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** la fila de la clase «A» muestra «Tutor: Ana García» y la de «B», «Sin tutor», sin desplegable
- **AND** «Guardar» sigue deshabilitado y un cambio del nombre de la clase no envía `tutorId` en el `PUT`

### Requirement: Los tutores se conservan al editar un curso y se liberan al borrarlo
Editar un curso con `PUT /api/courses/{id}` MUST conservar el tutor de cada clase que mantiene su `id`, también si se renombra, salvo que la clase traiga un `tutorId` distinto del guardado: una clase sin `tutorId` en el cuerpo MUST NOT cambiar su `classes.tutor_id`. Quitar una clase en una edición MUST dejar libre a su tutor: el profesor sigue existiendo, sin clase, y puede elegirse como tutor de otra clase en la misma edición. Borrar un curso con `DELETE /api/courses/{id}` MUST dejar libres a los tutores de sus clases (`ON DELETE SET NULL`), sin borrar a ningún profesor.

#### Scenario: Renombrar una clase con tutor
- **GIVEN** la clase «A» tutorizada por Ana García
- **WHEN** se edita el curso y «A» pasa a llamarse «Grupo A», sin `tutorId`
- **THEN** la respuesta y el listado muestran «Grupo A» con Ana García como tutora

#### Scenario: Edición sin tutores en el cuerpo
- **GIVEN** un curso con tutores en varias clases
- **WHEN** se envía un `PUT` que renombra, añade y quita clases sin ningún `tutorId`
- **THEN** las clases que siguen conservan su tutor

#### Scenario: Quitar una clase con tutor
- **WHEN** se edita el curso sin la clase tutorizada por Ana García
- **THEN** la clase desaparece y Ana García sigue existiendo, con `tutoredClass: null`

#### Scenario: Quitar una clase y pasar su tutor a otra
- **GIVEN** la clase «A» tutorizada por Ana García y la clase «B» sin tutor
- **WHEN** se edita el curso sin «A» y con el `tutorId` de Ana García en «B»
- **THEN** la respuesta es `200`, «A» desaparece y «B» tiene a Ana García como tutora

#### Scenario: Borrar un curso con tutores
- **GIVEN** un curso cuyas clases tienen tutores
- **WHEN** se borra el curso
- **THEN** el curso y sus clases desaparecen y los profesores siguen existiendo, con `tutoredClass: null`

## ADDED Requirements

### Requirement: Asignar, cambiar, mover y quitar tutores al editar un curso
En `PUT /api/courses/{id}`, el `tutorId` de cada clase del cuerpo MUST interpretarse así: omitido, el tutor de esa clase no cambia (una clase nueva nace sin tutor); `null`, la clase queda sin tutor; un UUID, ese profesor pasa a ser su tutor. Un profesor elegido MUST ser del colegio de la identidad y, si ya tutoriza una clase, esa clase MUST ser de este mismo curso y la edición MUST liberarla (quitándola, cambiando su tutor o dejándola sin tutor); si tutoriza una clase de otro curso, la edición MUST responder `409 PROFESSOR_ALREADY_TUTOR` sin guardar nada. El backend MUST calcular los cambios de tutor en la función pura de la edición, con los profesores pedidos leídos dentro de la transacción con el curso bloqueado, y MUST escribirlos en dos fases (primero dejar sin tutor las clases cuyo tutor cambia y después asignar los nuevos), para que mover un profesor entre clases e intercambiar los tutores de dos clases se guarden en una sola petición sin chocar con el índice único de `classes.tutor_id`. Si dos ediciones de cursos distintos asignan a la vez al mismo profesor, el índice único MUST rechazar la segunda y la API MUST responder `409 PROFESSOR_ALREADY_TUTOR` sin guardar nada de ella, nunca `500`. Si una edición asigna el tutor de una clase a la vez que se crea un profesor con esa clase, MUST prevalecer el último que escribe, como el resto de la edición. Un `tutorId` igual al guardado MUST NOT contar como cambio.

#### Scenario: Asignar un tutor
- **GIVEN** «1º Primaria» con la clase «A» sin tutor y Ana García sin clase
- **WHEN** se envía el `PUT` con `"tutorId": "<id de Ana>"` en «A»
- **THEN** la respuesta es `200` con «A» tutorizada por Ana García, y `GET /api/professors` la muestra con `tutoredClass` «1º Primaria · A»

#### Scenario: Cambiar y quitar el tutor
- **GIVEN** la clase «A» tutorizada por Ana García y Luis Pérez sin clase
- **WHEN** se envía «A» con el `tutorId` de Luis Pérez, o con `"tutorId": null`
- **THEN** «A» tiene a Luis Pérez, o a nadie, y Ana García queda con `tutoredClass: null`

#### Scenario: Mover un profesor entre clases del curso
- **GIVEN** la clase «A» tutorizada por Ana García y la clase «B» sin tutor
- **WHEN** se envía «A» con `"tutorId": null` y «B» con el `tutorId` de Ana García
- **THEN** la respuesta es `200`, «A» no tiene tutor y «B» tiene a Ana García

#### Scenario: Intercambiar los tutores de dos clases
- **GIVEN** la clase «A» tutorizada por Ana García y la clase «B» por Luis Pérez
- **WHEN** se envía «A» con el `tutorId` de Luis Pérez y «B» con el de Ana García
- **THEN** la respuesta es `200` con los tutores intercambiados

#### Scenario: Tutor en una clase nueva
- **WHEN** se añade la clase «C» sin `id` y con el `tutorId` de un profesor sin clase
- **THEN** la nueva «C» tiene a ese profesor como tutor

#### Scenario: Profesor de otro curso
- **GIVEN** que Ana García tutoriza una clase de «2º Primaria»
- **WHEN** se edita «1º Primaria» cambiando su nombre y con el `tutorId` de Ana García en «A»
- **THEN** la respuesta es `409 PROFESSOR_ALREADY_TUTOR`, «1º Primaria» conserva su nombre, sus clases y sus tutores, y «2º Primaria» no cambia

#### Scenario: Profesor de una clase del curso que no se libera
- **GIVEN** la clase «A» tutorizada por Ana García y la clase «B» sin tutor
- **WHEN** se envía «B» con el `tutorId` de Ana García y «A» sin `tutorId`
- **THEN** la respuesta es `409 PROFESSOR_ALREADY_TUTOR` y nada cambia

#### Scenario: Ediciones simultáneas de dos cursos con el mismo profesor
- **GIVEN** Ana García sin clase
- **WHEN** se envían a la vez un `PUT` de «1º Primaria» y otro de «2º Primaria» con el `tutorId` de Ana García en una de sus clases
- **THEN** una respuesta es `200` y la otra `409 PROFESSOR_ALREADY_TUTOR`, ninguna es `500`, y Ana García tutoriza una sola clase

#### Scenario: Mismo tutor que el guardado
- **GIVEN** la clase «A» tutorizada por Ana García
- **WHEN** se envía «A» con el `tutorId` de Ana García
- **THEN** la respuesta es `200`, el tutor no cambia y el evento no cuenta ese tutor como cambiado

### Requirement: Elegir el tutor de cada clase en la edición del curso
Con el curso y la lista de profesores (`GET /api/professors`, pedida una sola vez, también con `StrictMode`) cargados, cada fila del formulario de edición, también las nuevas, MUST tener un desplegable con la etiqueta visible «Tutor» y el nombre accesible «Tutor de la clase N», que empieza con el tutor guardado de esa clase o «Sin tutor». Sus opciones MUST ser «Sin tutor», los profesores sin clase y los profesores que tutorizan clases de este mismo curso (estos con su clase: «Ana García · clase A»); los profesores que tutorizan clases de otro curso MUST NOT ofrecerse. El tutor elegido MUST contar como cambio del formulario y MUST enviarse como `tutorId` de cada clase en el `PUT` (`null` para «Sin tutor»). Elegir el mismo profesor en dos filas MUST marcar la segunda con «Este profesor ya es el tutor de otra clase del curso» al enviar, sin enviar nada, y MUST NOT cambiar la otra fila. Sin profesores en el colegio, el desplegable MUST ofrecer solo «Sin tutor» y un texto con un enlace a «Crear profesor» (`/profesores/nuevo`). Si la lista de profesores no se puede cargar, MUST mostrarse el tutor de solo lectura (ver «Tutor de las clases en las páginas de cursos») con el aviso «No se han podido cargar los profesores; puedes guardar el resto sin cambiar los tutores» y «Reintentar», que vuelve a pedirla y, si carga, muestra los desplegables conservando lo escrito; mientras tanto el `PUT` MUST NOT incluir `tutorId`. Un `400` con `classes[<i>].tutorId` MUST marcar la fila con su texto («Ese profesor ya no existe. Elige otro» para `NOT_FOUND`). Un `409 PROFESSOR_ALREADY_TUTOR` MUST mostrar con `role="alert"` «Uno de los profesores elegidos ya es tutor en otro curso. Se ha actualizado la lista de profesores», volver a pedir los profesores, marcar las filas cuyo profesor elegido ya no está entre las opciones con «Ese profesor ya es tutor en otro curso. Elige otro», llevar el foco a la primera de ellas y conservar lo demás escrito.

#### Scenario: Opciones del desplegable
- **GIVEN** el curso «1º Primaria» con «A» tutorizada por Ana García y «B» sin tutor; Luis Pérez sin clase y Eva Gil tutora de una clase de «2º Primaria»
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** el desplegable de «A» empieza en Ana García y el de «B» en «Sin tutor»
- **AND** los dos ofrecen «Sin tutor», «Ana García · clase A» y «Luis Pérez», y no ofrecen a Eva Gil

#### Scenario: Asignar desde la edición
- **WHEN** se elige a Luis Pérez en «B» y se pulsa «Guardar»
- **THEN** se envía un solo `PUT` con `tutorId` en cada clase (el de Ana García en «A» y el de Luis Pérez en «B») y la aplicación navega a `/cursos`

#### Scenario: Intercambiar desde la edición
- **WHEN** se elige a Luis Pérez en «A» y a Ana García en «B» y se pulsa «Guardar»
- **THEN** se envía un solo `PUT` con los dos tutores intercambiados

#### Scenario: Mismo profesor en dos filas
- **WHEN** se elige a Ana García también en «B», sin cambiar «A», y se pulsa «Guardar»
- **THEN** no se envía nada, la fila «B» muestra «Este profesor ya es el tutor de otra clase del curso» con el foco, y «A» sigue con Ana García

#### Scenario: Colegio sin profesores
- **GIVEN** un colegio sin profesores
- **WHEN** se abre la edición de un curso
- **THEN** cada desplegable solo ofrece «Sin tutor» y un texto enlaza a «Crear profesor»

#### Scenario: Profesores no disponibles
- **GIVEN** que `GET /api/professors` falla
- **WHEN** se abre la edición del curso
- **THEN** se ve el tutor de solo lectura con el aviso y «Reintentar», y guardar un cambio del nombre envía las clases sin `tutorId`
- **AND** al pulsar «Reintentar» con la lista ya disponible aparecen los desplegables y lo escrito se conserva

#### Scenario: Profesor que ya es tutor en otro curso al guardar
- **GIVEN** que entre abrir el formulario y guardar, Luis Pérez pasa a tutorizar una clase de otro curso
- **WHEN** se elige a Luis Pérez en «B» y se pulsa «Guardar», y la API responde `409 PROFESSOR_ALREADY_TUTOR`
- **THEN** se ve el aviso con `role="alert"`, se vuelve a pedir la lista de profesores, la fila «B» muestra «Ese profesor ya es tutor en otro curso. Elige otro» con el foco, y el nombre y las demás filas conservan lo escrito

#### Scenario: Accesibilidad y textos
- **WHEN** se revisa la edición con desplegables, con errores, sin profesores y con los profesores no disponibles
- **THEN** no hay violaciones WCAG 2.1 AA (`axe`), cada desplegable tiene su nombre por fila y todos los textos están en `es.json` y `en.json`; a 360 px no hay desplazamiento horizontal

### Requirement: Tutores desde la edición de extremo a extremo
El E2E MUST cubrir, contra el backend real: asignar el tutor de una clase desde la edición y verlo en «Tutores» de `/cursos` y en `/profesores`; intercambiar los tutores de dos clases en un solo guardado; un profesor que la API asigna a una clase de otro curso entre abrir el formulario y guardar, que da el aviso y marca la fila; y la edición a 360 px sin desplazamiento horizontal.

#### Scenario: Asignar, intercambiar y conflicto
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** la spec de los tutores desde la edición pasa con esos casos, junto con todas las demás
