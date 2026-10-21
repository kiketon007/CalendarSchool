## MODIFIED Requirements

### Requirement: Contrato de los profesores en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/professors` (`createProfessor`), `GET /api/professors` (`listProfessors`), `GET /api/professors/{id}` (`getProfessor`) y `PUT /api/professors/{id}` (`updateProfessor`), todos con seguridad Bearer, con los esquemas `CreateProfessorRequest` (`firstName`, `lastName`, `position` y `classId` opcionales), `UpdateProfessorRequest` (`firstName` y `lastName` obligatorios; `position` y `classId` opcionales, que admiten `null`), `Professor` (`id`, `firstName`, `lastName`, `position` que es `DIRECTOR`, `JEFE_ESTUDIOS` o `null`, `subjects`, que es un array vacío mientras no se asignen asignaturas, y `tutoredClass`, que es `null` o `{ id, name, courseId, courseName }`) y la respuesta de la edición `{ professor, replacedTutor }`, donde `replacedTutor` es `null` o `{ id, firstName, lastName }`. `POST` MUST declarar `201`, `400`, `401`, `409` (`CLASS_ALREADY_HAS_TUTOR`), `500` y `503`; `GET /api/professors`, `200`, `401`, `500` y `503`; `GET /api/professors/{id}`, `200`, `401`, `404`, `500` y `503`; `PUT /api/professors/{id}`, `200`, `400`, `401`, `404`, `409` (`PROFESSOR_ALREADY_TUTOR`), `500` y `503`. El enum `FieldErrorCode` MUST incluir `NOT_FOUND` y el enum `ErrorCode` MUST incluir `CLASS_ALREADY_HAS_TUTOR`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createProfessor`, `listProfessors`, `getProfessor` y `updateProfessor`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas, y cada profesor devuelto lleva `subjects: []` y `tutoredClass`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los esquemas

### Requirement: Acceso a los profesores
`POST /api/professors`, `GET /api/professors`, `GET /api/professors/{id}` y `PUT /api/professors/{id}` MUST exigir una sesión válida (`requireAuthentication`) y MUST admitir los roles `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad de la petición. Sin token o con una sesión no válida MUST responder `401 INVALID_SESSION`; con la base de datos caída, `503 DATABASE_UNAVAILABLE`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** crea un profesor, los lista, lee uno y lo edita
- **THEN** recibe `201`, `200`, `200` y `200`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de las cuatro operaciones sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y `WWW-Authenticate: Bearer`

#### Scenario: Base de datos no disponible
- **GIVEN** que la base de datos no responde
- **WHEN** se crea, se lista, se lee o se edita un profesor
- **THEN** la respuesta es `503` con `DATABASE_UNAVAILABLE`

### Requirement: Página de listado de profesores
La página `/profesores` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con profesores, MUST mostrar encima del listado el total («1 profesor», «N profesores»); desde 768 px MUST mostrar una tabla con las columnas Nombre, Cargo, Tutoría y Acciones y una fila por profesor, con el nombre («Apellido, Nombre») como cabecera de su fila; por debajo de 768 px, una tarjeta por profesor con el nombre como `h2`, los mismos datos y sus acciones, sin pintar las dos estructuras a la vez. El cargo MUST mostrarse como «Director», «Jefe de estudios» o «Sin cargo»; la tutoría, como «Tutor de {curso} {clase}» («Tutor de 1º Primaria A») o «Sin tutoría» con el color secundario del tema. Cada profesor MUST tener un enlace «Editar» a `/profesores/{id}/editar` cuyo nombre accesible es «Editar {Apellido, Nombre}». El listado MUST conservar el orden en que lo devuelve la API. Sin profesores, MUST mostrar «Todavía no hay profesores», sin total, búsqueda ni paginación. El botón «Crear profesor» a `/profesores/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Profesor «{nombre}» creado» en un `role="status"`; si llega desde la edición, «Profesor «{nombre}» actualizado» y, si otro profesor perdió su tutoría, «{nombre} queda sin tutoría». Los nombres MUST pintarse como texto plano y, si son largos, partirse en varias líneas sin truncarse. La página MUST NOT mostrar acciones ni columnas de funcionalidades que aún no existen (asignaturas, borrar) ni recargar la lista por su cuenta.

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «García López, José María», jefe de estudios y tutor de la clase A de «1º Primaria», y una ventana de 1280 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve el total «1 profesor» y una tabla con las columnas Nombre, Cargo, Tutoría y Acciones, y esa fila con «Jefe de estudios», «Tutor de 1º Primaria A» y el enlace «Editar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve una tarjeta por profesor con su nombre como `h2`, los mismos datos y el enlace «Editar», y ninguna tabla

#### Scenario: Profesor sin cargo ni tutoría
- **GIVEN** un profesor sin cargo y que no tutoriza ninguna clase
- **THEN** se muestra «Sin cargo» y «Sin tutoría»

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin profesores abre `/profesores`
- **THEN** ve «Todavía no hay profesores» y el botón «Crear profesor», sin total, campo de búsqueda ni paginación

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/profesores`
- **THEN** se ve un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/profesores` tras crear «Ana García»
- **THEN** se ve «Profesor «Ana García» creado», el profesor en el listado y la primera página

#### Scenario: Aviso tras editar
- **WHEN** se llega a `/profesores` tras editar a «Ana García» quitándole la clase a «Luis Pérez»
- **THEN** se ve «Profesor «Ana García» actualizado. Luis Pérez queda sin tutoría» en un `role="status"`

### Requirement: Profesores de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado de profesores vacío; que crea un curso y un profesor con esa clase desde «Profesores» y lo ve en el listado como «Tutor de {curso} {clase}» y como tutor en la columna «Tutores» de `/cursos`; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Profesores» y crea un profesor; que el formulario valida sin enviar nada; que una clase que ya tiene tutor no se puede elegir y, si otra persona se la da a alguien entre la carga y el envío (por la API), se ve el error en el campo; que borrar un curso con tutor deja al profesor en el listado con «Sin tutoría»; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; que, con más de 20 profesores creados por la API, se ven el total, la primera página y la segunda con «Siguiente»; que la búsqueda encuentra sin acentos y con varias palabras en cualquier orden, muestra el mensaje sin resultados, limpia la búsqueda y reduce a una página un resultado de más de 20; y que se edita un profesor desde «Editar»: nombre y cargo, cambio a una clase libre, quitar la tutoría y tomar la clase de otro profesor con su aviso, un `id` inexistente y la edición a 360 px.

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el profesor con su clase, lo ve en el listado con su tutoría y en `/cursos`, y la clase deja de ofrecerse en el formulario

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Profesores», no ve «Usuarios» y crea un profesor

#### Scenario: Clase tomada entre medias
- **WHEN** se ejecuta el E2E con la clase asignada por la API tras abrir el formulario
- **THEN** al enviar se ve «Esa clase ya tiene tutor. Elige otra» en el campo y no se crea nada

#### Scenario: Tabla y tarjetas
- **WHEN** se ejecuta el E2E a 1280 px y a 360 px
- **THEN** a 1280 px el listado es una tabla y a 360 px son tarjetas, sin desplazamiento horizontal

#### Scenario: Paginación
- **GIVEN** 25 profesores creados por la API
- **WHEN** se abre `/profesores`
- **THEN** se ven «25 profesores», 20 filas y «Página 1 de 2»; con «Siguiente», 5 filas y «Página 2 de 2»

#### Scenario: Búsqueda
- **GIVEN** profesores creados por la API, entre ellos «García-López, José María»
- **WHEN** se busca «garcia jose», después «zzz» y se pulsa «Limpiar búsqueda»
- **THEN** primero se ve solo ese profesor y «Mostrando 1 de N profesores», después el mensaje sin resultados, y al limpiar vuelven todos con el foco en el campo

#### Scenario: Edición
- **GIVEN** «Ana García», tutora de 1º A, y «Luis Pérez», tutor de 2º A, creados por la API
- **WHEN** se edita a Ana desde «Editar» cambiando el cargo y eligiendo 2º A
- **THEN** se ve el aviso «Al guardar, Luis Pérez dejará de ser tutor de 2º Primaria A», al guardar el listado dice que Luis queda sin tutoría, Ana aparece como «Tutor de 2º Primaria A» y Luis como «Sin tutoría», y 1º A queda sin tutor en `/cursos`

## ADDED Requirements

### Requirement: Leer un profesor con GET /api/professors/{id}
`GET /api/professors/{id}` MUST responder `200` con `{ professor }` (la misma forma que en el listado) para un profesor del colegio de la identidad. Un `id` que no es un UUID, un profesor inexistente y uno de otro colegio MUST responder el mismo `404 NOT_FOUND`, sin revelar cuál es el caso. La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Profesor del colegio
- **WHEN** se pide un profesor del colegio que tutoriza 1º A
- **THEN** la respuesta es `200` con sus datos, `subjects: []` y `tutoredClass` con la clase y su curso

#### Scenario: Otro colegio, inexistente o mal formado
- **WHEN** se pide un profesor de otro colegio, un UUID que no existe o `abc`
- **THEN** la respuesta es `404 NOT_FOUND` en los tres casos

### Requirement: Editar un profesor con PUT /api/professors/{id}
`PUT /api/professors/{id}` MUST recibir el estado final `{ firstName, lastName, position?, classId? }` y guardarlo en una única transacción. `firstName` y `lastName` MUST seguir las reglas de la creación (`professor-fields.json`); `position` MUST ser `DIRECTOR`, `JEFE_ESTUDIOS` o `null` (ausente se trata como `null`); `classId` MUST ser un UUID o `null`, y ausente MUST significar «no tocar la tutoría». Los errores de validación MUST responder `400 VALIDATION_ERROR` por campo en el orden `firstName`, `lastName`, `position`, `classId`. Un profesor de otro colegio, inexistente o con un `id` que no es UUID MUST responder `404 NOT_FOUND` sin cambiar nada. Gana el último guardado: MUST NOT haber control de versión. La respuesta MUST ser `200` con `{ professor, replacedTutor }`, leída dentro de la misma transacción.

#### Scenario: Nombre y cargo
- **WHEN** se envía `{ firstName: "Ana María", lastName: "García", position: "DIRECTOR" }` sin `classId`
- **THEN** la respuesta es `200`, el profesor tiene esos datos, su tutoría no cambia y `replacedTutor` es `null`

#### Scenario: Validación
- **WHEN** se envía un nombre vacío y un cargo desconocido
- **THEN** la respuesta es `400` con `firstName: REQUIRED` y `position: INVALID_FORMAT`, y nada cambia

#### Scenario: Profesor de otro colegio
- **WHEN** se edita un profesor de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y el profesor no cambia

#### Scenario: Atomicidad
- **GIVEN** que la asignación de la clase falla a mitad (un disparador temporal en la prueba)
- **WHEN** se edita el nombre y la clase a la vez
- **THEN** no cambia ni el profesor ni ninguna clase

### Requirement: Mover la tutoría al editar un profesor
Al editar, si `classId` cambia, el backend MUST liberar la clase que el profesor tutorizaba (`tutor_id` a `NULL`) y asignarle la nueva en la misma transacción, con la fila del profesor bloqueada. La clase nueva MUST existir en el colegio (si no, `400` con `classId: NOT_FOUND`, también si es de otro colegio, y nada cambia). Si la clase nueva tenía **otro** tutor, ese profesor MUST perderla y la respuesta MUST nombrarlo en `replacedTutor`. `classId: null` MUST dejar al profesor sin tutoría. Elegir la clase que ya tutoriza MUST NOT cambiar nada de la tutoría. Dos ediciones simultáneas que toman la misma clase MUST terminar con un solo tutor y sin `500`; una violación de `classes_tutor_id_key` por una carrera con otra escritura MUST responder `409 PROFESSOR_ALREADY_TUTOR` sin cambiar nada. Al crear un profesor MUST seguir ofreciéndose y aceptándose solo clases libres.

#### Scenario: A una clase libre
- **GIVEN** Ana tutoriza 1º A y 1º B está libre
- **WHEN** se edita a Ana con `classId` de 1º B
- **THEN** Ana tutoriza 1º B, 1º A queda sin tutor y `replacedTutor` es `null`

#### Scenario: Quitar la tutoría
- **WHEN** se edita a Ana con `classId: null`
- **THEN** Ana queda sin tutoría y 1º A sin tutor

#### Scenario: Tomar la clase de otro profesor
- **GIVEN** Luis tutoriza 2º A
- **WHEN** se edita a Ana con `classId` de 2º A
- **THEN** Ana tutoriza 2º A, su clase anterior queda libre, Luis queda sin tutoría y `replacedTutor` es Luis

#### Scenario: Clase de otro colegio
- **WHEN** se edita a Ana con una clase de otro colegio
- **THEN** la respuesta es `400` con `classId: NOT_FOUND` y nada cambia

#### Scenario: Ediciones simultáneas
- **WHEN** dos ediciones de profesores distintos piden a la vez la misma clase
- **THEN** las dos responden sin `500` y la clase tiene un único tutor, el del último guardado

### Requirement: Eventos de log de la edición de profesores
El backend MUST registrar `PROFESSOR_UPDATED` con `school_id`, `actor_id`, `professor_id`, `changed_fields` (de `firstName`, `lastName`, `position`, `class`), `tutor_changed` y `replaced_tutor` (booleano) tras guardar una edición con cambios, y `PROFESSOR_UPDATE_REJECTED` con `school_id`, `actor_id` y `reason` igual a `"not_found"` o `"class_not_found"` cuando se rechaza. Una edición sin cambios MUST NOT registrar `PROFESSOR_UPDATED`. Los eventos MUST NOT incluir nombres.

#### Scenario: Edición con desplazamiento
- **WHEN** Ana toma la clase de Luis
- **THEN** el log tiene `PROFESSOR_UPDATED` con `changed_fields: ["class"]`, `tutor_changed: true`, `replaced_tutor: true` y sin nombres

#### Scenario: Edición rechazada
- **WHEN** se edita un profesor inexistente
- **THEN** el log tiene `PROFESSOR_UPDATE_REJECTED` con `reason: "not_found"`

### Requirement: Página de edición de un profesor
La página `/profesores/:id/editar` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y usar el mismo formulario que la creación, con los valores actuales precargados. MUST pedir el profesor y los cursos una sola vez (también con `StrictMode`), mostrar un indicador mientras carga, «Este profesor no existe o ya no está disponible» con un enlace a «Profesores» ante un `404` (al cargar y al guardar) y un aviso con «Reintentar» si el profesor no se puede cargar. El desplegable de la clase MUST ofrecer «Sin clase» y todas las clases del colegio agrupadas por curso: las libres y la propia con su nombre, y las de otro tutor como «{clase} · tutor: {nombre}». Al elegir una clase de otro tutor, MUST aparecer bajo el campo, ligado por `aria-describedby`, «Al guardar, {nombre} dejará de ser tutor de {curso} {clase}». Si los cursos no se pueden cargar, el campo de la clase MUST desactivarse con una explicación, el formulario MUST seguir sirviendo y la tutoría MUST NOT enviarse. «Guardar» MUST estar deshabilitado mientras no haya cambios reales (nombres limpios, cargo o clase) y durante el envío, con una guarda síncrona contra el doble envío. «Cancelar» MUST volver a `/profesores` sin preguntar. Con el `200` MUST navegar a `/profesores` reemplazando la entrada del historial y pasar el nombre y el del tutor desplazado para el aviso. Un `400` MUST marcar sus campos con el foco en el primero; un `409`, un `503`, un `500` o un error de red MUST mostrar «No se pudo guardar el profesor. Inténtalo de nuevo» con `role="alert"`, conservando lo escrito. La navegación MUST marcar «Profesores» como activo en esta ruta.

#### Scenario: Precarga
- **WHEN** se abre la edición de «García, Ana», directora y tutora de 1º A
- **THEN** el formulario muestra «Ana», «García», «Director» y «1º Primaria · A», y «Guardar» está deshabilitado

#### Scenario: Sin cambios reales
- **WHEN** se añade un espacio al final del nombre, o se cambia el cargo y se vuelve al original
- **THEN** «Guardar» sigue deshabilitado

#### Scenario: Clase de otro tutor
- **GIVEN** Luis tutoriza 2º A
- **WHEN** se elige «A · tutor: Luis Pérez» en «2º Primaria»
- **THEN** aparece «Al guardar, Luis Pérez dejará de ser tutor de 2º Primaria A» ligado al campo

#### Scenario: Guardar
- **WHEN** se cambia el nombre y se pulsa «Guardar»
- **THEN** se envía una sola petición y la aplicación vuelve a `/profesores` con «Profesor «…» actualizado»

#### Scenario: Profesor que ya no existe
- **WHEN** se abre la edición de un id inexistente, o se guarda cuando el profesor ya no existe
- **THEN** se ve «Este profesor no existe o ya no está disponible» con un enlace a «Profesores»

#### Scenario: Cursos no disponibles
- **GIVEN** que `GET /api/courses` falla
- **THEN** el campo de la clase está desactivado con una explicación y al guardar el cuerpo no lleva `classId`

#### Scenario: Error del servidor
- **GIVEN** que la API responde `503`
- **THEN** se ve «No se pudo guardar el profesor. Inténtalo de nuevo» con `role="alert"` y se conserva lo escrito

#### Scenario: Accesibilidad y móvil
- **WHEN** se analiza la página con `axe` (cargando, precargada, con errores, con el aviso de desplazamiento, no disponible) y se abre a 360 px
- **THEN** no hay violaciones ni desplazamiento horizontal
