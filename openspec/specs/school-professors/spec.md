# school-professors Specification

## Purpose
Define los profesores de un colegio: el contrato de `POST` y `GET /api/professors`, el alta de un profesor (un registro del colegio, no una cuenta) con un cargo y la clase que tutoriza, ambos opcionales, la asignación de la clase con un `UPDATE` condicionado en la misma transacción (`classes.tutor_id` único y `ON DELETE SET NULL`), el listado ordenado por apellidos y nombre, la observabilidad sin nombres y las páginas `/profesores` y `/profesores/nuevo` con el enlace «Profesores» de la cabecera.
## Requirements
### Requirement: Contrato de los profesores en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/professors` (`createProfessor`), `GET /api/professors` (`listProfessors`), `GET /api/professors/{id}` (`getProfessor`) y `PUT /api/professors/{id}` (`updateProfessor`), todos con seguridad Bearer, con los esquemas `CreateProfessorRequest` (`firstName`, `lastName`, `position` y `classId` opcionales), `UpdateProfessorRequest` (`firstName` y `lastName` obligatorios; `position` y `classId` opcionales, que admiten `null`), `Professor` (`id`, `firstName`, `lastName`, `position` que es `DIRECTOR`, `JEFE_ESTUDIOS` o `null`, `subjects`, que es un array vacío mientras no se asignen asignaturas, y `tutoredClass`, que es `null` o `{ id, name, courseId, courseName }`) y la respuesta de la edición `{ professor, replacedTutor }`, donde `replacedTutor` es `null` o `{ id, firstName, lastName }`. `POST` MUST declarar `201`, `400`, `401`, `409` (`CLASS_ALREADY_HAS_TUTOR`), `500` y `503`; `GET /api/professors`, `200`, `401`, `500` y `503`; `GET /api/professors/{id}`, `200`, `401`, `404`, `500` y `503`; `PUT /api/professors/{id}`, `200`, `400`, `401`, `404`, `409` (`PROFESSOR_ALREADY_TUTOR`), `500` y `503`. El enum `FieldErrorCode` MUST incluir `NOT_FOUND` y el enum `ErrorCode` MUST incluir `CLASS_ALREADY_HAS_TUTOR`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createProfessor`, `listProfessors`, `getProfessor` y `updateProfessor`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas, y cada profesor devuelto lleva `subjects: []` y `tutoredClass`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los esquemas

### Requirement: Crear un profesor con POST /api/professors
`POST /api/professors` MUST crear, en una única transacción, un profesor del colegio de la identidad y, si el cuerpo trae `classId`, asignarle esa clase como tutoría, y responder `201` con `success: true` y en `data.professor` el `id` (UUIDv7 generado por la aplicación), `firstName` y `lastName` (recortados y con los espacios repetidos colapsados), `position` (o `null`), `subjects: []` y `tutoredClass` (la clase asignada con su curso, o `null`). Si falla cualquier escritura, MUST NOT quedar ni el profesor ni la asignación. MUST ignorar las propiedades desconocidas del cuerpo, también un `subjectIds`, un `schoolId` o un `email`. MUST NOT exigir unicidad: puede haber varios profesores con el mismo nombre y apellido.

#### Scenario: Profesor sin cargo ni clase
- **GIVEN** un usuario autenticado de un colegio
- **WHEN** envía `{ "firstName": "  José   María ", "lastName": "García López" }`
- **THEN** la respuesta es `201` con «José María», «García López», `position: null`, `subjects: []` y `tutoredClass: null`
- **AND** la base de datos tiene un profesor del colegio de la identidad

#### Scenario: Profesor con cargo y clase
- **GIVEN** la clase «A» de «1º Primaria» sin tutor
- **WHEN** se envía el profesor con `position: "JEFE_ESTUDIOS"` y el `classId` de esa clase
- **THEN** la respuesta es `201` con el cargo y `tutoredClass` con el nombre de la clase y del curso, y la clase tiene a ese profesor como tutor

#### Scenario: Homónimos
- **GIVEN** un profesor «José García López»
- **WHEN** se crea otro con el mismo nombre y apellido
- **THEN** la respuesta es `201` y existen dos profesores

#### Scenario: Atomicidad
- **GIVEN** que la asignación de la clase falla
- **WHEN** se procesa la petición
- **THEN** no queda el profesor en la base de datos

#### Scenario: Colegio de la identidad
- **WHEN** el cuerpo incluye un `schoolId` de otro colegio o un `subjectIds`
- **THEN** se ignoran: el profesor se crea en el colegio de la identidad y con `subjects: []`

### Requirement: Reglas de los campos del profesor
El nombre y el apellido MUST ser obligatorios y tener de 1 a 100 caracteres tras recortar los espacios, con las mismas reglas que el nombre y el apellido del registro (letras con acentos, dígitos, `·`, espacios, apóstrofo y guion). El cargo, si viene, MUST ser `DIRECTOR` o `JEFE_ESTUDIOS`. `classId`, si viene, MUST ser un UUID. Una petición no válida MUST responder `400 VALIDATION_ERROR` con un elemento `{ field, code }` en `details` por cada campo inválido (`firstName`, `lastName`, `position` o `classId`) y los códigos `REQUIRED`, `INVALID_LENGTH`, `INVALID_CHARACTERS` o `INVALID_FORMAT`, sin crear nada. Las mismas reglas MUST aplicarse en el frontend antes de enviar, recorriendo la misma tabla de ejemplos `test-fixtures/professor-fields.json` que el backend.

#### Scenario: Sin nombre o sin apellido
- **WHEN** se envía un profesor sin `firstName` o con solo espacios
- **THEN** la respuesta es `400` con `{ field: "firstName", code: "REQUIRED" }`

#### Scenario: Nombre demasiado largo o con caracteres no permitidos
- **WHEN** el apellido tiene 101 caracteres o contiene `<`
- **THEN** la respuesta es `400` con `{ field: "lastName", code: "INVALID_LENGTH" }` o `INVALID_CHARACTERS`

#### Scenario: Caracteres especiales permitidos
- **WHEN** se crean «José María», «D'Angelo Müller» y «García-López»
- **THEN** se aceptan

#### Scenario: Cargo no válido o clase mal formada
- **WHEN** el cargo es `PRESIDENTE` o el `classId` es `abc`
- **THEN** la respuesta es `400` con `{ field: "position", code: "INVALID_FORMAT" }` o `{ field: "classId", code: "INVALID_FORMAT" }`

#### Scenario: Validación compartida
- **WHEN** se ejecutan los tests de validación del backend y del frontend
- **THEN** ambos recorren `test-fixtures/professor-fields.json` y dan el mismo resultado para cada ejemplo

### Requirement: Clase que tutoriza el profesor
Si el cuerpo trae `classId`, la clase MUST pertenecer a un curso del colegio de la identidad y no tener tutor. La asignación MUST hacerse como un `UPDATE` condicionado a que la clase siga sin tutor, dentro de la misma transacción del alta, sin bloqueos. Una clase inexistente o de otro colegio MUST responder `400 VALIDATION_ERROR` con `{ field: "classId", code: "NOT_FOUND" }`, sin distinguir los dos casos. Una clase que ya tiene tutor MUST responder `409 CLASS_ALREADY_HAS_TUTOR` sin crear nada. Un profesor MUST tutorizar como mucho una clase, garantizado por un índice único de la base de datos sobre `classes.tutor_id`. Dos peticiones simultáneas con la misma clase MUST dar un `201` y un `409`.

#### Scenario: Clase que ya tiene tutor
- **GIVEN** la clase «A» con un tutor
- **WHEN** se crea otro profesor con el `classId` de esa clase
- **THEN** la respuesta es `409` con `error.code` igual a `CLASS_ALREADY_HAS_TUTOR`, no se crea el profesor y la clase conserva a su tutor

#### Scenario: Clase de otro colegio o inexistente
- **WHEN** se envía el `classId` de una clase de otro colegio o un UUID que no existe
- **THEN** la respuesta es `400` con `{ field: "classId", code: "NOT_FOUND" }` y no se crea nada

#### Scenario: Altas simultáneas con la misma clase
- **WHEN** se envían a la vez dos altas con el `classId` de la misma clase sin tutor
- **THEN** una responde `201` y la otra `409`, y existe un único profesor nuevo

#### Scenario: Una clase por profesor
- **GIVEN** un profesor que ya tutoriza una clase
- **WHEN** se intenta asignar a la base de datos la misma persona como tutor de otra clase
- **THEN** el índice único `classes_tutor_id_key` lo rechaza

### Requirement: Listado de profesores con GET /api/professors
`GET /api/professors` MUST responder `200` con `success: true` y en `data.professors` los profesores del colegio de la identidad, y solo esos, cada uno con `id`, `firstName`, `lastName`, `position`, `subjects: []` y `tutoredClass`. MUST ordenarlos por apellido y después por nombre con la comparación del castellano y numérica. Sin profesores, `data.professors` MUST ser un array vacío. La respuesta MUST llevar `Cache-Control: no-store`. No admite parámetros de búsqueda ni de paginación.

#### Scenario: Profesores del colegio ordenados
- **GIVEN** un colegio con «Pérez, Luis», «García, Ana» y «García, Álvaro», y otro colegio con sus propios profesores
- **WHEN** un usuario del primer colegio pide `GET /api/professors`
- **THEN** recibe «García, Álvaro», «García, Ana» y «Pérez, Luis», cada uno con su `tutoredClass`, y ninguno del otro colegio

#### Scenario: Colegio sin profesores
- **WHEN** un usuario de un colegio sin profesores pide `GET /api/professors`
- **THEN** la respuesta es `200` con `professors: []`

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

### Requirement: Eventos de log de los profesores
El backend MUST registrar `PROFESSOR_CREATED` con `school_id`, `actor_id`, `professor_id`, `has_class` y `position` tras crear un profesor, y `PROFESSOR_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` igual a `"class_has_tutor"` o `"class_not_found"` cuando se rechaza por la clase. Los eventos MUST NOT incluir el nombre ni el apellido.

#### Scenario: Profesor creado
- **WHEN** se crea un profesor con una clase
- **THEN** el log tiene `PROFESSOR_CREATED` con `has_class: true` y sin el nombre

#### Scenario: Alta rechazada
- **WHEN** se rechaza un alta porque la clase ya tiene tutor
- **THEN** el log tiene `PROFESSOR_CREATION_REJECTED` con `reason: "class_has_tutor"`

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

### Requirement: Página de creación de un profesor
La página `/profesores/nuevo` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y mostrar un formulario con nombre, apellido, cargo («Sin cargo», «Director» y «Jefe de estudios») y clase («Sin clase» y las clases sin tutor agrupadas por curso, obtenidas de `GET /api/courses`). MUST validar con las reglas compartidas al enviar, mostrando cada error bajo su campo y con el foco en el primero, sin enviar nada si hay errores. MUST tener una guarda síncrona contra el doble envío y deshabilitar «Guardar» mientras se envía. Con el `201` MUST navegar a `/profesores` reemplazando la entrada del historial y pasar el nombre para el aviso. Un `400` MUST marcar sus campos (también `classId`); un `409 CLASS_ALREADY_HAS_TUTOR`, el campo de la clase con «Esa clase ya tiene tutor. Elige otra»; un `503`, un `500` o un error de red MUST mostrar «No se pudo crear el profesor. Inténtalo de nuevo» con `role="alert"`, conservando lo escrito. Si no hay clases sin tutor, el campo de la clase MUST decirlo. Si la lista de cursos no se puede cargar, el formulario MUST seguir sirviendo sin clase. «Cancelar» MUST volver a `/profesores`.

#### Scenario: Crear un profesor con clase
- **WHEN** un usuario rellena «Ana», «García», elige «1º Primaria · A» y pulsa «Guardar»
- **THEN** se envía una sola petición y la aplicación navega a `/profesores` con el aviso

#### Scenario: Obligatorios
- **WHEN** pulsa «Guardar» sin nombre ni apellido
- **THEN** ve el error bajo cada campo, el foco está en el nombre y no se envía nada

#### Scenario: Solo clases sin tutor
- **GIVEN** los cursos «1º Primaria» con la clase «A» (con tutor) y «B» (sin tutor)
- **THEN** el desplegable de la clase ofrece «Sin clase» y «1º Primaria · B», y no «1º Primaria · A»

#### Scenario: Sin clases libres
- **GIVEN** que todas las clases tienen tutor, o que no hay cursos
- **THEN** el campo de la clase indica que no hay clases sin tutor y el formulario se puede enviar sin clase

#### Scenario: Doble pulsación
- **WHEN** el usuario pulsa «Guardar» dos veces seguidas
- **THEN** se envía una única petición

#### Scenario: Clase que ya tiene tutor
- **GIVEN** que la API responde `409 CLASS_ALREADY_HAS_TUTOR`
- **THEN** el campo de la clase muestra «Esa clase ya tiene tutor. Elige otra» y el formulario conserva lo escrito

#### Scenario: Error del servidor
- **GIVEN** que la API responde `503`
- **THEN** se ve «No se pudo crear el profesor. Inténtalo de nuevo» con `role="alert"`, sin mensajes técnicos, y se puede reenviar

### Requirement: Enlace a los profesores en la navegación
La navegación de las páginas autenticadas MUST mostrar a los roles `ADMIN` y `MEMBER` el enlace «Profesores» a `/profesores`, marcado con `aria-current="page"` en esa ruta y en `/profesores/nuevo`, junto a «Cursos» y antes de «Usuarios», que sigue mostrándose solo a `ADMIN`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve «Cursos» y «Profesores» en la navegación y no ve «Usuarios»

#### Scenario: Enlace activo
- **WHEN** se abre `/profesores/nuevo`
- **THEN** «Profesores» tiene `aria-current="page"`

### Requirement: Accesibilidad, responsive e i18n de los profesores
Las páginas `/profesores` y `/profesores/nuevo` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla del listado MUST tener nombre (el título de la página), cabeceras de columna y el nombre del profesor como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. La paginación MUST ser una `nav` con nombre y botones con texto visible, y el cambio de página MUST anunciarse sin perder el foco. El campo de búsqueda MUST tener etiqueta visible y su resultado MUST anunciarse. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos (también el total con su plural, la tutoría, la paginación y la búsqueda) MUST venir de `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, con paginación, con búsqueda, sin resultados, vacío, con error y con el aviso, y el formulario vacío, con errores y sin clases libres
- **THEN** no hay violaciones

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/profesores` (también con paginación, búsqueda y nombres largos) y `/profesores/nuevo`
- **THEN** no hay desplazamiento horizontal

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

### Requirement: Paginación del listado de profesores
Cuando la lista que se muestra (todos los profesores o, con búsqueda, los que coinciden) tiene más de 20, la página `/profesores` MUST mostrar 20 por página, en el orden de la API, y debajo del listado una navegación (`nav` con el nombre «Paginación de profesores») con el botón «Anterior», el indicador «Página X de N» y el botón «Siguiente». «Anterior» MUST estar deshabilitado en la primera página y «Siguiente» en la última. El indicador MUST anunciarse al cambiar de página (`aria-live="polite"`); el foco MUST quedarse en el botón pulsado o, si queda deshabilitado, pasar al otro botón; la vista MUST volver al principio del listado. La paginación MUST hacerse en el navegador, sin parámetros en `GET /api/professors`, y la página actual MUST vivir solo en el estado de la página (ni en la URL ni en almacenamiento): al abrir `/profesores` se empieza en la primera, y cada cambio del texto de búsqueda MUST volver a la primera. Con 20 o menos, MUST NOT mostrarse la navegación. La paginación MUST aplicarse igual a la tabla y a las tarjetas.

#### Scenario: Primera página
- **GIVEN** 45 profesores
- **WHEN** un usuario abre `/profesores`
- **THEN** ve los 20 primeros, «45 profesores», «Página 1 de 3» y «Anterior» deshabilitado

#### Scenario: Página siguiente
- **GIVEN** la primera página de 45 profesores
- **WHEN** pulsa «Siguiente»
- **THEN** ve del 21 al 40, «Página 2 de 3» se anuncia y el foco sigue en «Siguiente»

#### Scenario: Última página
- **GIVEN** la página 2 de 3
- **WHEN** pulsa «Siguiente»
- **THEN** ve los 5 últimos, «Página 3 de 3», «Siguiente» deshabilitado y el foco en «Anterior»

#### Scenario: Volver atrás
- **GIVEN** la página 3 de 3
- **WHEN** pulsa «Anterior»
- **THEN** ve del 21 al 40 y «Página 2 de 3»

#### Scenario: Veinte o menos
- **GIVEN** 20 profesores
- **WHEN** un usuario abre `/profesores`
- **THEN** ve los 20 y ninguna navegación de paginación

#### Scenario: Tarjetas paginadas
- **GIVEN** 45 profesores y una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve 20 tarjetas y la navegación de paginación, sin desplazamiento horizontal

#### Scenario: Búsqueda con más de 20 resultados
- **GIVEN** 45 profesores, 25 de ellos de apellido «Martín», y la página 2
- **WHEN** escribe «martin»
- **THEN** vuelve a la página 1, ve los 20 primeros «Martín», «Mostrando 25 de 45 profesores» y «Página 1 de 2»

### Requirement: Búsqueda de profesores por nombre y apellidos
Con profesores, la página `/profesores` MUST mostrar encima del listado un campo `type="search"` con la etiqueta visible «Buscar por nombre o apellidos», que admita como mucho 100 caracteres. Al escribir, sin retraso ni petición al servidor, MUST mostrar solo los profesores en cuyo nombre o apellidos aparecen **todas** las palabras del texto, en cualquier orden y como parte de una palabra, sin distinguir mayúsculas, acentos (la `ñ` busca como `n`) ni espacios sobrantes; los guiones y apóstrofos MUST tratarse como texto normal. MUST conservar el orden de la API. Un texto vacío o solo con espacios MUST NOT filtrar. Mientras hay texto, la línea del total MUST ser un `role="status"` con «Mostrando N de M profesores»; sin texto, «M profesores» sin `role="status"`. Sin coincidencias, MUST mostrar «No hay profesores que coincidan con «X»» (el texto como texto plano) y un botón «Limpiar búsqueda» que vacía el campo, muestra todos y devuelve el foco al campo, sin paginación. MUST NOT buscar por cargo, tutoría ni asignaturas. El texto MUST vivir solo en el estado de la página (ni en la URL ni en almacenamiento).

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

