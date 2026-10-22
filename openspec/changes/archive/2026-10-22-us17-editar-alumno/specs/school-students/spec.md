## MODIFIED Requirements

### Requirement: Contrato de los alumnos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/students` (`createStudent`), `GET /api/students` (`listStudents`), `GET /api/students/{id}` (`getStudent`) y `PUT /api/students/{id}` (`updateStudent`), con seguridad Bearer, y los esquemas `CreateStudentRequest` (`firstName`, `lastName`, `courseId` y `cafeteria` obligatorios; `classId`, `scholarship`, `foodType` y `observations` opcionales y nulables), `UpdateStudentRequest` (los mismos campos y reglas, como estado final del alumno), `Student` (`id`, `firstName`, `lastName`, `course` y `class`, cada uno `{ id, name }` o `null`, `cafeteria`, `scholarship` booleano o `null`, `foodType` y `observations` texto o `null`) y `StudentSummary` (lo mismo sin `foodType` ni `observations`). `POST` MUST declarar `201`, `400`, `401`, `500` y `503`; `GET /api/students`, `200`, `401`, `500` y `503`; `GET /api/students/{id}`, `200` (`{ student: Student }`), `401`, `404`, `500` y `503`; `PUT /api/students/{id}`, `200` (`{ student: Student }`), `400`, `401`, `404`, `500` y `503`. El parámetro `id` MUST ser un UUID. Las descripciones de `foodType` y `observations` MUST indicar que son datos sensibles que no aparecen en el listado. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createStudent`, `listStudents`, `getStudent` y `updateStudent`
- **THEN** las cuatro exigen Bearer y declaran las respuestas indicadas, y `StudentSummary` no tiene `foodType` ni `observations`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los cuatro esquemas

### Requirement: Acceso a los alumnos
`POST` y `GET /api/students`, y `GET` y `PUT /api/students/{id}`, MUST exigir una sesión válida (`401` sin ella) y MUST estar abiertos a `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad: un alumno se crea en el colegio de quien lo crea, el listado solo trae los alumnos de su colegio y un alumno de otro colegio MUST responder `404 NOT_FOUND` al leerlo o editarlo, igual que uno inexistente, sin modificarse.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** crea un alumno, pide el listado, lo lee y lo edita
- **THEN** recibe `201`, `200`, `200` y `200`, y el alumno es de su colegio

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los cuatro sin token
- **THEN** la respuesta es `401`

#### Scenario: Aislamiento
- **GIVEN** alumnos en dos colegios
- **WHEN** un usuario del primero pide el listado, y lee y edita un alumno del segundo por su `id`
- **THEN** el listado solo trae los de su colegio, y la lectura y la edición responden `404` sin cambiar el alumno del segundo

### Requirement: Página de listado de alumnos
`/alumnos` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir la lista una sola vez (también con `StrictMode`) y mostrar un `role="status"` mientras carga. Desde 768 px MUST mostrar una tabla con las columnas «Nombre» («Apellidos, Nombre» en un `th scope="row"`), «Curso y clase», «Comedor» y «Acciones»; por debajo, tarjetas con el nombre como `h2`. «Curso y clase» MUST decir «1º Primaria A», «1º Primaria · Sin clase» o «Sin curso»; «Comedor», «Sí · Con beca», «Sí» o «No». Cada fila y cada tarjeta MUST llevar un enlace «Editar» hacia `/alumnos/<id>/editar` con el nombre accesible «Editar {Apellidos, Nombre}» y, en el estado de la navegación, la búsqueda actual de la URL del listado (`{ listSearch: "?curso=…&pagina=…" }`, o `""` sin parámetros). MUST respetar el orden del servidor, mostrar siempre «Crear alumno» (hacia `/alumnos/nuevo`), «Todavía no hay alumnos» con «Crear alumno» si no hay ninguno y un `role="alert"` con «Reintentar» si falla. MUST leer del estado de la navegación, con una guarda de tipo, el aviso `{ studentCreated: <texto no vacío> }` o `{ studentUpdated: <texto no vacío> }` y mostrar «Alumno «{nombre}» creado» o «Alumno «{nombre}» actualizado» como texto plano en un `role="status"`, que se conserva al cambiar los filtros o la página. MUST NOT mostrar el tipo de comida ni las observaciones.

#### Scenario: Tabla y tarjetas
- **GIVEN** «Juan García» en «1º Primaria» A con comedor y beca, y «Ana Álvarez» sin curso ni comedor
- **WHEN** se abre `/alumnos` a 1280 px y a 360 px
- **THEN** la tabla y las tarjetas muestran «Álvarez, Ana | Sin curso | No» y «García, Juan | 1º Primaria A | Sí · Con beca», cada uno con su enlace «Editar»

#### Scenario: Editar con los filtros
- **GIVEN** `/alumnos?comedor=si&pagina=2`
- **WHEN** se pulsa «Editar» en «García, Juan»
- **THEN** se navega a `/alumnos/<id de Juan>/editar` con `{ listSearch: "?comedor=si&pagina=2" }` en el estado

#### Scenario: Vacío y error
- **WHEN** no hay alumnos, o la lista responde `503`
- **THEN** se ve «Todavía no hay alumnos» con «Crear alumno», o el error con «Reintentar» que vuelve a pedirla

#### Scenario: Aviso de llegada
- **WHEN** se llega con `{ studentCreated: "<b>Juan</b> García" }` o con `{ studentUpdated: "<b>Juan</b> García" }`
- **THEN** se ve «Alumno «<b>Juan</b> García» creado» o «… actualizado» como texto, sin interpretar el HTML
- **AND** un estado con otra forma (`{ studentUpdated: 3 }`) no muestra aviso

## ADDED Requirements

### Requirement: Leer un alumno con GET /api/students/{id}
`GET /api/students/{id}` MUST responder `200` con `success: true` y en `data.student` el alumno del colegio de la identidad con la forma `Student`, incluidos `foodType` y `observations`, y la cabecera `Cache-Control: no-store`. Un `id` que no es UUID, inexistente o de otro colegio MUST responder `404 NOT_FOUND`, sin distinguir los casos.

#### Scenario: Alumno con datos sensibles
- **GIVEN** «Juan García» en «1º Primaria» A con comedor, beca, «Vegetariana» y unas observaciones
- **WHEN** se pide `GET /api/students/<id>`
- **THEN** la respuesta es `200` con todos sus datos, también «Vegetariana» y las observaciones, y `Cache-Control: no-store`

#### Scenario: Alumno sin curso
- **GIVEN** un alumno cuyo curso se borró
- **WHEN** se pide por su `id`
- **THEN** la respuesta es `200` con `course: null` y `class: null`

#### Scenario: Identificador no válido
- **WHEN** se pide `GET /api/students/abc`
- **THEN** la respuesta es `404 NOT_FOUND`

### Requirement: Editar un alumno con PUT /api/students/{id}
`PUT /api/students/{id}` MUST recibir el **estado final** del alumno con las mismas reglas de campos, de comedor y de curso y clase que el alta («Reglas de los campos del alumno», «Comedor, beca y tipo de comida», «Curso y clase del alumno»), validado con la misma tabla `test-fixtures/student-fields.json`: lo que falta o es `null` (`classId`, `foodType`, `observations`) queda vacío. Con un cuerpo válido MUST actualizar el alumno en una única transacción y responder `200` con `success: true`, `data.student` con la forma `Student` y `Cache-Control: no-store`. MUST ignorar las propiedades desconocidas del cuerpo, también `id` y `schoolId`. Un `id` que no es UUID, inexistente o de otro colegio MUST responder `404 NOT_FOUND`; los errores de validación, `400 VALIDATION_ERROR` en el orden del alta. Gana el último guardado: MUST NOT haber control de versión. Si falla cualquier escritura, el alumno MUST NOT cambiar.

#### Scenario: Cambiar nombre y comedor
- **GIVEN** «Juan García» con comedor, beca y «Vegetariana»
- **WHEN** se envía `{ "firstName": "Juanito", "lastName": "García", "courseId": "<su curso>", "classId": "<su clase>", "cafeteria": false }`
- **THEN** la respuesta es `200` con «Juanito», `cafeteria: false`, `scholarship: null` y `foodType: null`, y la base de datos lo refleja

#### Scenario: Estado final
- **GIVEN** un alumno con clase «A» y observaciones
- **WHEN** se envía su estado sin `classId` ni `observations`
- **THEN** el alumno queda sin clase y con `observations: null`

#### Scenario: Validación
- **WHEN** se envía `{ "firstName": "", "lastName": "García", "courseId": "<curso>", "cafeteria": false, "scholarship": true }`
- **THEN** la respuesta es `400` con `firstName: REQUIRED` y `scholarship: NOT_ALLOWED`, y el alumno no cambia

#### Scenario: Último guardado gana
- **WHEN** se envían dos `PUT` seguidos del mismo alumno con nombres distintos
- **THEN** los dos responden `200` y queda el nombre del segundo

#### Scenario: Atomicidad
- **GIVEN** que la escritura del alumno falla
- **WHEN** se procesa la edición
- **THEN** la respuesta es un error y el alumno conserva todos sus datos

### Requirement: Curso y clase al editar un alumno
La edición MUST bloquear, dentro de la transacción y en este orden, la fila del curso elegido en modo compartido (`FOR SHARE`, el mismo bloqueo del alta) y la del alumno (`FOR UPDATE`), ambas filtrando por el colegio, y comprobar que el curso es del colegio y que la clase, si se indica, es de ese curso. Un curso inexistente o de otro colegio MUST responder `400` con `courseId: NOT_FOUND`; una clase inexistente, de otro curso o de otro colegio, `400` con `classId: NOT_FOUND`, sin cambiar el alumno. Con esos bloqueos, un borrado o una edición simultáneos del curso (que lo toman `FOR UPDATE`) esperan a que termine la edición, así que ninguna carrera MUST dejar un `500` ni un alumno con una clase que no es de su curso. Un alumno sin curso MUST poder reasignarse a cualquier curso del colegio.

#### Scenario: Reasignar un alumno sin curso
- **GIVEN** un alumno cuyo curso se borró
- **WHEN** se envía su estado con el `courseId` de «2º Primaria» y la clase «A» de 2º
- **THEN** la respuesta es `200` y el alumno queda en «2º Primaria» A

#### Scenario: Clase de otro curso
- **WHEN** se envía el `courseId` de 1º con el `classId` de la «A» de 2º
- **THEN** la respuesta es `400` con `classId: NOT_FOUND` y el alumno no cambia

#### Scenario: Edición mientras se borra el curso
- **WHEN** se envían a la vez la edición de un alumno hacia un curso y el `DELETE` de ese curso
- **THEN** ninguna respuesta es `500`; si la edición se procesa después responde `400` con `courseId: NOT_FOUND` y la edición no se aplica, y si se procesa antes el alumno queda sin curso ni clase tras el borrado

### Requirement: Eventos de log de la edición de alumnos
Una edición correcta MUST registrar `STUDENT_UPDATED` con `school_id`, `actor_id`, `student_id`, `changed_fields` (los **nombres** de los campos cuyo valor cambió, en el orden del alta: `firstName`, `lastName`, `courseId`, `classId`, `cafeteria`, `scholarship`, `foodType`, `observations`), `has_class` y `cafeteria`. Una edición rechazada porque el alumno no existe o por el curso o la clase MUST registrar `STUDENT_UPDATE_REJECTED` con `school_id`, `actor_id` y `reason` (`not_found`, `course_not_found` o `class_not_found`). Un error de validación del cuerpo no MUST registrar evento de rechazo. Ningún evento MUST contener nombres, apellidos, tipo de comida ni observaciones.

#### Scenario: Evento de la edición
- **WHEN** se cambian el nombre y las observaciones de un alumno
- **THEN** se registra `STUDENT_UPDATED` con `changed_fields: ["firstName", "observations"]` y sin los valores

#### Scenario: Evento del rechazo
- **WHEN** la edición falla porque el alumno es de otro colegio
- **THEN** se registra `STUDENT_UPDATE_REJECTED` con `reason: "not_found"`

### Requirement: Página de edición de un alumno
`/alumnos/:id/editar` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir el alumno (`GET /api/students/{id}`) y los cursos una sola vez (también con `StrictMode`) y mostrar un `role="status"` mientras carga. Con un `404` MUST mostrar «Este alumno no existe o ya no está disponible» con un enlace a «Alumnos»; con otro fallo al cargar el alumno, un `role="alert"` con «Reintentar». MUST usar el `StudentForm` del alta, con el título «Editar alumno» (sin el nombre en el título del documento), precargado con todos los datos del alumno y con «Guardar» deshabilitado mientras los valores que se enviarían (nombre y apellidos recortados y colapsados, vacíos como `null`, beca y tipo de comida descartados con «No») sean iguales a los cargados. Un alumno sin curso MUST mostrar bajo «Curso», ligado por `aria-describedby`, «Este alumno no tiene curso. Elige uno para guardar.», y el curso MUST seguir siendo obligatorio. MUST enviar un único `PUT` aunque se pulse dos veces y mostrar «Guardando…». Con el `200` MUST navegar con `replace` a `/alumnos` seguido de la búsqueda recibida en `listSearch` y con `{ studentUpdated: «Nombre Apellidos» }` en el estado. Un `400` MUST marcar sus campos como en el alta (también `courseId` o `classId` `NOT_FOUND`, que vuelven a pedir los cursos); un `404` al guardar MUST mostrar «Este alumno no existe o ya no está disponible»; cualquier otro fallo, «No se pudo guardar el alumno. Inténtalo de nuevo» con `role="alert"` y lo escrito conservado. «Cancelar» MUST volver a `/alumnos` con la misma búsqueda sin preguntar ni guardar. Si los cursos no cargan, MUST comportarse como el alta (aviso, «Reintentar» y sin poder enviar).

#### Scenario: Precarga sin cambios
- **GIVEN** «Juan García» en «1º Primaria» A con comedor, beca y «Vegetariana»
- **WHEN** se abre su edición
- **THEN** todos los campos muestran sus valores y «Guardar» está deshabilitado
- **AND** si se añade un espacio al final del nombre, o se cambia y se deshace, «Guardar» sigue deshabilitado

#### Scenario: Guardar y volver con los filtros
- **GIVEN** que se llegó con `{ listSearch: "?comedor=si&pagina=2" }`
- **WHEN** se cambia el nombre a «Juanito» y se guarda
- **THEN** se envía un `PUT` y se navega a `/alumnos?comedor=si&pagina=2` con «Alumno «Juanito García» actualizado»

#### Scenario: Sin búsqueda de vuelta
- **GIVEN** que se abrió la edición por un enlace directo, sin estado de la navegación
- **WHEN** se pulsa «Cancelar» o se guarda
- **THEN** se vuelve a `/alumnos` sin parámetros

#### Scenario: Búsqueda de vuelta no válida
- **GIVEN** un estado con `{ listSearch: "//otro-sitio" }` o con un valor que no es texto
- **WHEN** se vuelve al listado
- **THEN** se navega a `/alumnos` sin parámetros

#### Scenario: Alumno sin curso
- **GIVEN** un alumno sin curso
- **WHEN** se abre su edición y se pulsa «Guardar» tras cambiar el nombre
- **THEN** se ve el aviso bajo «Curso», el error de curso obligatorio con el foco y no se envía nada

#### Scenario: Alumno que ya no existe
- **WHEN** se abre `/alumnos/<id inexistente>/editar`, o el `PUT` responde `404`
- **THEN** se ve «Este alumno no existe o ya no está disponible» con el enlace a «Alumnos»

#### Scenario: Fallo al guardar
- **GIVEN** que el `PUT` responde `503`
- **THEN** se ve «No se pudo guardar el alumno. Inténtalo de nuevo» y lo escrito se conserva

#### Scenario: Accesibilidad
- **WHEN** se ejecuta `axe-core` con el formulario cargado, con errores y con un alumno sin curso, a 1280 px y a 360 px
- **THEN** no hay violaciones ni desplazamiento horizontal, y todos los textos están en `es.json` y `en.json`

### Requirement: Edición de alumnos de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con alumnos creados por la API: editar el nombre desde un listado filtrado y volver a la misma URL con el aviso; cambiar de curso (la clase vuelve a «Sin clase»); pasar el comedor a «No»; reasignar un alumno sin curso; un `id` inexistente; un `MEMBER` que edita; y la edición a 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido de edición
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de edición de `students.cy.ts`
