# school-professors Specification

## Purpose
Define los profesores de un colegio: el contrato de `POST` y `GET /api/professors`, el alta de un profesor (un registro del colegio, no una cuenta) con un cargo y la clase que tutoriza, ambos opcionales, la asignación de la clase con un `UPDATE` condicionado en la misma transacción (`classes.tutor_id` único y `ON DELETE SET NULL`), el listado ordenado por apellidos y nombre, la observabilidad sin nombres y las páginas `/profesores` y `/profesores/nuevo` con el enlace «Profesores» de la cabecera.
## Requirements
### Requirement: Contrato de los profesores en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/professors` (`createProfessor`) y `GET /api/professors` (`listProfessors`), ambos con seguridad Bearer, con los esquemas `CreateProfessorRequest` (`firstName`, `lastName`, `position` y `classId` opcionales), `Professor` (`id`, `firstName`, `lastName`, `position` que es `DIRECTOR`, `JEFE_ESTUDIOS` o `null`, `subjects`, que es un array vacío mientras no se asignen asignaturas, y `tutoredClass`, que es `null` o `{ id, name, courseId, courseName }`) y sus respuestas. `POST` MUST declarar `201`, `400`, `401`, `409` (`CLASS_ALREADY_HAS_TUTOR`), `500` y `503`; `GET`, `200`, `401`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `NOT_FOUND` y el enum `ErrorCode` MUST incluir `CLASS_ALREADY_HAS_TUTOR`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createProfessor` y `listProfessors`
- **THEN** ambas exigen Bearer y declaran las respuestas indicadas, y el `201` y el `200` devuelven cada profesor con `subjects: []` y `tutoredClass`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones y los esquemas

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
`POST /api/professors` y `GET /api/professors` MUST exigir una sesión válida (`requireAuthentication`) y MUST admitir los roles `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad de la petición. Sin token o con una sesión no válida MUST responder `401 INVALID_SESSION`; con la base de datos caída, `503 DATABASE_UNAVAILABLE`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** crea un profesor y los lista
- **THEN** recibe `201` y `200`

#### Scenario: Sin sesión
- **WHEN** se llama a `POST` o a `GET /api/professors` sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y `WWW-Authenticate: Bearer`

#### Scenario: Base de datos no disponible
- **GIVEN** que la base de datos no responde
- **WHEN** se crea o se lista un profesor
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
La página `/profesores` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con profesores, MUST mostrar encima del listado el total («1 profesor», «N profesores»); desde 768 px MUST mostrar una tabla con las columnas Nombre, Cargo y Tutoría y una fila por profesor, con el nombre («Apellido, Nombre») como cabecera de su fila; por debajo de 768 px, una tarjeta por profesor con el nombre como `h2` y los mismos datos, sin pintar las dos estructuras a la vez. El cargo MUST mostrarse como «Director», «Jefe de estudios» o «Sin cargo»; la tutoría, como «Tutor de {curso} {clase}» («Tutor de 1º Primaria A») o «Sin tutoría» con el color secundario del tema. El listado MUST conservar el orden en que lo devuelve la API. Sin profesores, MUST mostrar «Todavía no hay profesores», sin total, búsqueda ni paginación. El botón «Crear profesor» a `/profesores/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Profesor «{nombre}» creado» en un `role="status"`. Los nombres MUST pintarse como texto plano y, si son largos, partirse en varias líneas sin truncarse. La página MUST NOT mostrar acciones ni columnas de funcionalidades que aún no existen (asignaturas, editar, borrar) ni recargar la lista por su cuenta.

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «García López, José María», jefe de estudios y tutor de la clase A de «1º Primaria», y una ventana de 1280 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve el total «1 profesor» y una tabla con las columnas Nombre, Cargo y Tutoría, y esa fila con «Jefe de estudios» y «Tutor de 1º Primaria A»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve una tarjeta por profesor con su nombre como `h2` y los mismos datos, y ninguna tabla

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
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado de profesores vacío; que crea un curso y un profesor con esa clase desde «Profesores» y lo ve en el listado como «Tutor de {curso} {clase}» y como tutor en la columna «Tutores» de `/cursos`; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Profesores» y crea un profesor; que el formulario valida sin enviar nada; que una clase que ya tiene tutor no se puede elegir y, si otra persona se la da a alguien entre la carga y el envío (por la API), se ve el error en el campo; que borrar un curso con tutor deja al profesor en el listado con «Sin tutoría»; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; que, con más de 20 profesores creados por la API, se ven el total, la primera página y la segunda con «Siguiente»; y que la búsqueda encuentra sin acentos y con varias palabras en cualquier orden, muestra el mensaje sin resultados, limpia la búsqueda y reduce a una página un resultado de más de 20.

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

