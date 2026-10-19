## ADDED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`) y `GET /api/courses` (`listCourses`), ambos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `Course` (`id`, `name`, `classes`), `SchoolClass` (`id`, `name`, `tutor`, que es `null` mientras no existan profesores) y sus respuestas. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET`, `200`, `401`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse` y `listCourses`
- **THEN** ambas exigen Bearer y declaran las respuestas indicadas, y el `201` y el `200` devuelven las clases con `tutor: null`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones y los esquemas

### Requirement: Crear un curso con sus clases
`POST /api/courses` MUST crear, en una única transacción, un curso del colegio de la identidad con todas sus clases, y responder `201` con `success: true` y en `data.course` el `id`, el `name` (recortado y con los espacios repetidos colapsados) y las `classes` en el orden recibido, cada una con `id`, `name` y `tutor: null`. Si falla cualquier escritura, MUST NOT quedar ni el curso ni ninguna de sus clases. MUST ignorar las propiedades desconocidas del cuerpo, también un `tutorId` o un `schoolId`. Los identificadores MUST ser UUIDv7 generados por la aplicación.

#### Scenario: Curso con dos clases
- **GIVEN** un usuario autenticado de un colegio sin cursos
- **WHEN** envía `{ "name": "1º Primaria", "classes": [{ "name": "A" }, { "name": "B" }] }`
- **THEN** la respuesta es `201` con el curso «1º Primaria» y las clases «A» y «B» con `tutor: null`
- **AND** la base de datos tiene un curso del colegio de la identidad y dos clases suyas

#### Scenario: Espacios normalizados
- **WHEN** se crea el curso «  1º   Primaria  » con la clase « A »
- **THEN** se guardan y devuelven «1º Primaria» y «A»

#### Scenario: Atomicidad
- **GIVEN** que la escritura de una de las clases falla
- **WHEN** se procesa la petición
- **THEN** no queda ni el curso ni ninguna clase en la base de datos

#### Scenario: Colegio de la identidad
- **WHEN** el cuerpo incluye un `schoolId` de otro colegio o un `tutorId`
- **THEN** se ignoran: el curso se crea en el colegio de la identidad y sus clases no tienen tutor

### Requirement: Reglas de los nombres del curso y de sus clases
El nombre del curso MUST ser obligatorio y tener de 1 a 100 caracteres tras recortar los espacios, con letras (también acentuadas y ñ), dígitos, `º`, `ª`, `-`, `/` y espacios. El curso MUST tener de 1 a 12 clases. El nombre de cada clase MUST ser obligatorio y tener de 1 a 10 caracteres tras recortar, con letras, dígitos, `º`, `ª`, `-` y espacios, y MUST ser único dentro del curso sin distinguir mayúsculas ni espacios sobrantes. Una petición no válida MUST responder `400 VALIDATION_ERROR` con un elemento `{ field, code }` en `details` por cada campo inválido (`name`, `classes` o `classes[<i>].name`) y los códigos `REQUIRED`, `INVALID_LENGTH`, `INVALID_CHARACTERS` o `DUPLICATE` (este último en la segunda y siguientes apariciones de un nombre), sin crear nada. Las mismas reglas MUST aplicarse en el frontend antes de enviar, recorriendo la misma tabla de ejemplos `test-fixtures/course-fields.json` que el backend.

#### Scenario: Sin nombre de curso
- **WHEN** se envía un curso sin `name` o con solo espacios
- **THEN** la respuesta es `400` con `{ field: "name", code: "REQUIRED" }`

#### Scenario: Sin clases o con demasiadas
- **WHEN** se envía `classes: []` o 13 clases
- **THEN** la respuesta es `400` con `{ field: "classes", code: "INVALID_LENGTH" }`

#### Scenario: Clase no válida
- **WHEN** la segunda clase está vacía, tiene 11 caracteres o contiene `<`
- **THEN** la respuesta es `400` con `classes[1].name` y `REQUIRED`, `INVALID_LENGTH` o `INVALID_CHARACTERS`

#### Scenario: Clase repetida en el curso
- **WHEN** se envían las clases «A» y « a »
- **THEN** la respuesta es `400` con `{ field: "classes[1].name", code: "DUPLICATE" }` y no se crea nada

#### Scenario: Caracteres especiales permitidos
- **WHEN** se crean «1º Primaria», «Infantil 3 años», «6ª Primaria» y «2º ESO-A/B», y una clase «1ªA»
- **THEN** se aceptan

#### Scenario: Validación compartida
- **WHEN** se ejecutan los tests de validación del backend y del frontend
- **THEN** ambos recorren `test-fixtures/course-fields.json` y dan el mismo resultado para cada ejemplo

### Requirement: Curso único en el colegio
El nombre del curso MUST ser único dentro del colegio, comparado tras recortar, colapsar los espacios y pasar a minúsculas; la unicidad MUST garantizarla un índice único de la base de datos sobre el colegio y el nombre normalizado. Un nombre ya usado MUST responder `409 COURSE_ALREADY_EXISTS` sin crear nada. Otro colegio MUST poder tener un curso con el mismo nombre. Dos peticiones simultáneas con el mismo nombre MUST crear un único curso.

#### Scenario: Nombre ya usado en el colegio
- **GIVEN** que el colegio tiene «1º Primaria»
- **WHEN** se crea «1º primaria»
- **THEN** la respuesta es `409` con `error.code` igual a `COURSE_ALREADY_EXISTS` y el colegio sigue teniendo un curso

#### Scenario: Mismo nombre en otro colegio
- **GIVEN** que otro colegio tiene «1º Primaria»
- **WHEN** se crea «1º Primaria»
- **THEN** la respuesta es `201`

#### Scenario: Envíos simultáneos
- **WHEN** se envían a la vez dos peticiones idénticas para crear «1º Primaria»
- **THEN** una responde `201` y la otra `409`, y existe un solo curso

### Requirement: Listado de cursos con GET /api/courses
`GET /api/courses` MUST responder `200` con `success: true` y en `data.courses` los cursos del colegio de la identidad, y solo esos, cada uno con `id`, `name` y `classes` (`id`, `name`, `tutor: null`). Los cursos y, dentro de cada uno, las clases MUST ordenarse por nombre con la comparación del castellano y numérica (`localeCompare('es', { numeric: true })`). Sin cursos, `data.courses` MUST ser un array vacío. La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Cursos del colegio ordenados
- **GIVEN** un colegio con «10º Curso», «2º Primaria» y «1º Primaria» (clases «B» y «A»), y otro colegio con sus propios cursos
- **WHEN** un usuario del primer colegio pide `GET /api/courses`
- **THEN** recibe «1º Primaria» (clases «A» y «B»), «2º Primaria» y «10º Curso», y ninguno del otro colegio

#### Scenario: Colegio sin cursos
- **WHEN** un usuario de un colegio sin cursos pide `GET /api/courses`
- **THEN** la respuesta es `200` con `courses: []`

### Requirement: Acceso a los cursos
`POST /api/courses` y `GET /api/courses` MUST exigir una sesión válida (`requireAuthentication`) y MUST admitir los roles `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad de la petición. Sin token o con una sesión no válida MUST responder `401 INVALID_SESSION`; con la base de datos caída, `503 DATABASE_UNAVAILABLE`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** crea un curso y lista los cursos
- **THEN** recibe `201` y `200`

#### Scenario: Sin sesión
- **WHEN** se llama a `POST /api/courses` o a `GET /api/courses` sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y `WWW-Authenticate: Bearer`

#### Scenario: Base de datos no disponible
- **GIVEN** que la base de datos no responde
- **WHEN** se crea o se lista un curso
- **THEN** la respuesta es `503` con `DATABASE_UNAVAILABLE`

### Requirement: Eventos de log de los cursos
El backend MUST registrar `COURSE_CREATED` con `school_id`, `actor_id`, `course_id` y `class_count` tras crear un curso, y `COURSE_CREATION_REJECTED` con `school_id`, `actor_id` y `reason: "duplicate"` cuando el nombre ya existe. Los eventos MUST NOT incluir los nombres del curso ni de las clases.

#### Scenario: Curso creado
- **WHEN** se crea un curso con dos clases
- **THEN** el log tiene `COURSE_CREATED` con `class_count: 2` y sin los nombres

#### Scenario: Curso duplicado
- **WHEN** se rechaza un curso por nombre repetido
- **THEN** el log tiene `COURSE_CREATION_REJECTED` con `reason: "duplicate"`

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, MUST mostrar cada curso con el `h2` de su nombre y sus clases con el tutor o «Sin tutor». Sin cursos, MUST mostrar «Todavía no hay cursos». El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`. Los nombres MUST pintarse como texto plano.

#### Scenario: Listado con cursos
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B»)
- **WHEN** un usuario abre `/cursos`
- **THEN** ve «1º Primaria» con «A — Sin tutor» y «B — Sin tutor»

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin cursos abre `/cursos`
- **THEN** ve «Todavía no hay cursos» y el botón «Crear curso»

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/cursos`
- **THEN** se ve un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/cursos` tras crear «1º Primaria»
- **THEN** se ve «Curso «1º Primaria» creado» y el curso en el listado

### Requirement: Página de creación de un curso
La página `/cursos/nuevo` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y mostrar un formulario con el nombre del curso y una lista de clases que empieza con una fila. MUST permitir añadir filas hasta 12 y quitar cualquiera salvo la última. MUST validar con las reglas compartidas al enviar, mostrando cada error bajo su campo o su fila, sin enviar nada si hay errores. MUST tener una guarda síncrona contra el doble envío y deshabilitar «Guardar» mientras se envía. Con el `201` MUST navegar a `/cursos` reemplazando la entrada del historial y pasar el nombre del curso para el aviso. Un `400` MUST marcar sus campos; un `409`, el nombre del curso con «Ya existe un curso con este nombre. Usa otro»; un `503`, un `500` o un error de red MUST mostrar «No se pudo crear el curso. Inténtalo de nuevo» con `role="alert"`, conservando lo escrito. «Cancelar» MUST volver a `/cursos`.

#### Scenario: Crear un curso
- **WHEN** un usuario rellena «1º Primaria», añade la clase «B» a la fila «A» y pulsa «Guardar»
- **THEN** se envía una sola petición y la aplicación navega a `/cursos` con el aviso

#### Scenario: Nombre obligatorio
- **WHEN** pulsa «Guardar» sin nombre
- **THEN** ve «El nombre del curso es obligatorio» bajo el campo y no se envía nada

#### Scenario: Última fila y máximo
- **GIVEN** el formulario con una sola clase
- **THEN** esa fila no ofrece «Quitar clase»
- **AND** con 12 clases, «Añadir clase» está deshabilitado

#### Scenario: Clase repetida
- **WHEN** las clases son «A» y «a»
- **THEN** la segunda muestra «Ya existe una clase con este nombre en el curso» y no se envía nada

#### Scenario: Doble pulsación
- **WHEN** el usuario pulsa «Guardar» dos veces seguidas
- **THEN** se envía una única petición

#### Scenario: Curso que ya existe
- **GIVEN** que la API responde `409 COURSE_ALREADY_EXISTS`
- **THEN** el nombre del curso muestra «Ya existe un curso con este nombre. Usa otro» y el formulario conserva lo escrito

#### Scenario: Error del servidor
- **GIVEN** que la API responde `503`
- **THEN** se ve «No se pudo crear el curso. Inténtalo de nuevo» con `role="alert"`, sin mensajes técnicos, y se puede reenviar

### Requirement: Enlace a los cursos en la navegación
La navegación de las páginas autenticadas MUST mostrarse a los roles `ADMIN` y `MEMBER` con el enlace «Cursos» a `/cursos`, marcado con `aria-current="page"` en esa ruta y en `/cursos/nuevo`; el enlace «Usuarios» MUST seguir mostrándose solo a `ADMIN`. La tarjeta «Gestión de horarios» de la pantalla de bienvenida MUST seguir sin ruta («Próximamente»).

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve «Cursos» en la navegación y no ve «Usuarios»

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve «Cursos» y «Usuarios», y al pulsar «Cursos» llega a `/cursos`

#### Scenario: Bienvenida sin cambios
- **WHEN** se abre `/onboarding`
- **THEN** la tarjeta «Gestión de horarios» sigue mostrando «Próximamente» y no es un enlace

### Requirement: Accesibilidad, responsive e i18n de los cursos
Las páginas `/cursos` y `/cursos/nuevo` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, el campo de cada clase y su botón «Quitar clase» con un nombre accesible que identifique la fila, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos MUST venir de `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan las dos páginas con `axe` (WCAG 2.1 A y AA), con cursos, vacía, con errores y con el aviso
- **THEN** no hay violaciones

#### Scenario: Fila identificable
- **GIVEN** un formulario con las clases «A» y «B»
- **THEN** el botón para quitar la segunda tiene un nombre como «Quitar la clase 2»

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/cursos` y `/cursos/nuevo`
- **THEN** no hay desplazamiento horizontal

### Requirement: Cursos de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado vacío, crea «1º Primaria» con las clases «A» y «B» desde «Cursos» y lo ve en el listado con «Sin tutor»; que crear otra vez el mismo nombre muestra el error en el campo; y que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Cursos» en la navegación y crea un curso.

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el curso, lo ve en el listado con sus clases «Sin tutor» y recibe el error al repetir el nombre

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Cursos», no ve «Usuarios» y crea un curso
