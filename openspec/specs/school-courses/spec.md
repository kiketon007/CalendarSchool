# school-courses Specification

## Purpose
Define los cursos de un colegio y sus clases: el contrato de `POST` y `GET /api/courses`, de `GET` y `PUT /api/courses/{id}`, de `GET /api/courses/{id}/impact` y de `DELETE /api/courses/{id}`, la creación atómica de un curso con sus clases, su edición (nombre y clases, que conservan su `id` al renombrarse, en una transacción con el curso bloqueado y sin pisar a otra persona que haya quitado una clase: `409 COURSE_CHANGED`), su borrado real con sus clases por cascada, tras un diálogo que dice qué se pierde (clases y, cuando existan, alumnos) y con el curso bloqueado en la transacción, las reglas de los nombres y su unicidad (curso en el colegio, clase en el curso, también con envíos simultáneos), el listado ordenado con números en orden natural, con su fecha de creación, en una tabla o en tarjetas según el ancho y con una búsqueda por nombre en el navegador, el acceso de `ADMIN` y `MEMBER`, los eventos de log, las páginas `/cursos` (con el diálogo de borrado), `/cursos/nuevo` y `/cursos/:id/editar`, el enlace «Cursos» de la navegación, la accesibilidad, el diseño adaptable, los textos en i18n y su E2E. El tutor de las clases es opcional y todavía no se asigna.
## Requirements
### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`), `GET /api/courses` (`listCourses`), `GET /api/courses/{id}` (`getCourse`), `PUT /api/courses/{id}` (`updateCourse`), `GET /api/courses/{id}/impact` (`getCourseDeletionImpact`) y `DELETE /api/courses/{id}` (`deleteCourse`), todos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID y `name`), `Course` (`id`, `name`, `createdAt` en ISO 8601 y `classes`), `SchoolClass` (`id`, `name`, `tutor`, que es `null` mientras no existan profesores), `CourseImpact` (`classCount` y `studentCount`, enteros no negativos) y sus respuestas. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET /api/courses`, `200`, `401`, `500` y `503`; `GET /api/courses/{id}` y `GET /api/courses/{id}/impact`, `200`, `401`, `404`, `500` y `503`; `PUT /api/courses/{id}`, `200`, `400`, `401`, `404`, `409` (`COURSE_ALREADY_EXISTS` o `COURSE_CHANGED`), `500` y `503`; `DELETE /api/courses/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse`, `listCourses`, `getCourse`, `updateCourse`, `getCourseDeletionImpact` y `deleteCourse`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas; el `201` y los `200` de lectura y edición devuelven cada curso con `createdAt` y sus clases con `tutor: null`, y los del impacto y del borrado, un `CourseImpact`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las seis operaciones y los esquemas, también `createdAt`, el `id` opcional de `UpdateCourseRequest` y `CourseImpact`

### Requirement: Crear un curso con sus clases
`POST /api/courses` MUST crear, en una única transacción, un curso del colegio de la identidad con todas sus clases, y responder `201` con `success: true` y en `data.course` el `id`, el `name` (recortado y con los espacios repetidos colapsados), el `createdAt` que guardó la base de datos (ISO 8601) y las `classes` en el orden recibido, cada una con `id`, `name` y `tutor: null`. Si falla cualquier escritura, MUST NOT quedar ni el curso ni ninguna de sus clases. MUST ignorar las propiedades desconocidas del cuerpo, también un `tutorId` o un `schoolId`. Los identificadores MUST ser UUIDv7 generados por la aplicación.

#### Scenario: Curso con dos clases
- **GIVEN** un usuario autenticado de un colegio sin cursos
- **WHEN** envía `{ "name": "1º Primaria", "classes": [{ "name": "A" }, { "name": "B" }] }`
- **THEN** la respuesta es `201` con el curso «1º Primaria», su `createdAt` y las clases «A» y «B» con `tutor: null`
- **AND** la base de datos tiene un curso del colegio de la identidad, con ese mismo `created_at`, y dos clases suyas

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
El nombre del curso MUST ser único dentro del colegio, comparado tras recortar, colapsar los espacios y pasar a minúsculas; la unicidad MUST garantizarla un índice único de la base de datos sobre el colegio y el nombre normalizado. Un nombre ya usado por otro curso del colegio MUST responder `409 COURSE_ALREADY_EXISTS` sin crear ni cambiar nada, también al editar. Al editar, el propio curso MUST NOT contar: cambiar solo mayúsculas o espacios de su nombre MUST guardarse. Otro colegio MUST poder tener un curso con el mismo nombre. Dos peticiones simultáneas con el mismo nombre MUST crear un único curso.

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

#### Scenario: Renombrar a un nombre ya usado
- **GIVEN** que el colegio tiene «6º Primaria» y «5º Primaria»
- **WHEN** se edita «5º Primaria» con el nombre «6º primaria»
- **THEN** la respuesta es `409 COURSE_ALREADY_EXISTS` y «5º Primaria» no cambia, tampoco sus clases

#### Scenario: Cambiar solo las mayúsculas del propio curso
- **GIVEN** el curso «1º primaria»
- **WHEN** se edita con el nombre «1º Primaria»
- **THEN** la respuesta es `200` y el curso se llama «1º Primaria»

### Requirement: Listado de cursos con GET /api/courses
`GET /api/courses` MUST responder `200` con `success: true` y en `data.courses` los cursos del colegio de la identidad, y solo esos, cada uno con `id`, `name`, `createdAt` (ISO 8601) y `classes` (`id`, `name`, `tutor: null`). Los cursos y, dentro de cada uno, las clases MUST ordenarse por nombre con la comparación del castellano y numérica (`localeCompare('es', { numeric: true })`). Sin cursos, `data.courses` MUST ser un array vacío. La respuesta MUST llevar `Cache-Control: no-store`. No admite parámetros de búsqueda ni de paginación.

#### Scenario: Cursos del colegio ordenados
- **GIVEN** un colegio con «10º Curso», «2º Primaria» y «1º Primaria» (clases «B» y «A»), y otro colegio con sus propios cursos
- **WHEN** un usuario del primer colegio pide `GET /api/courses`
- **THEN** recibe «1º Primaria» (clases «A» y «B»), «2º Primaria» y «10º Curso», cada uno con su `createdAt`, y ninguno del otro colegio

#### Scenario: Colegio sin cursos
- **WHEN** un usuario de un colegio sin cursos pide `GET /api/courses`
- **THEN** la respuesta es `200` con `courses: []`

### Requirement: Acceso a los cursos
`POST /api/courses`, `GET /api/courses`, `GET /api/courses/{id}`, `PUT /api/courses/{id}`, `GET /api/courses/{id}/impact` y `DELETE /api/courses/{id}` MUST exigir una sesión válida (`requireAuthentication`) y MUST admitir los roles `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad de la petición. Sin token o con una sesión no válida MUST responder `401 INVALID_SESSION`; con la base de datos caída, `503 DATABASE_UNAVAILABLE`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** crea un curso, lista los cursos, lee uno, lo edita, pide el impacto de borrarlo y lo borra
- **THEN** recibe `201`, `200`, `200`, `200`, `200` y `200`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de las seis operaciones sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y `WWW-Authenticate: Bearer`

#### Scenario: Base de datos no disponible
- **GIVEN** que la base de datos no responde
- **WHEN** se crea, se lista, se lee, se edita, se pide el impacto o se borra un curso
- **THEN** la respuesta es `503` con `DATABASE_UNAVAILABLE`

### Requirement: Eventos de log de los cursos
El backend MUST registrar `COURSE_CREATED` con `school_id`, `actor_id`, `course_id` y `class_count` tras crear un curso, y `COURSE_CREATION_REJECTED` con `school_id`, `actor_id` y `reason: "duplicate"` cuando el nombre ya existe. Tras editar un curso MUST registrar `COURSE_UPDATED` con `school_id`, `actor_id`, `course_id`, `classes_added`, `classes_removed` y `classes_renamed`, y al rechazar una edición, `COURSE_UPDATE_REJECTED` con `school_id`, `actor_id`, `course_id` y `reason` igual a `"duplicate"` (nombre ya usado) o `"changed"` (curso cambiado por otra persona). Tras borrar un curso MUST registrar `COURSE_DELETED` con `school_id`, `actor_id`, `course_id`, `class_count` y `student_count` (lo que se borró de verdad). Pedir el impacto MUST NOT registrar nada. Los eventos MUST NOT incluir los nombres del curso ni de las clases.

#### Scenario: Curso creado
- **WHEN** se crea un curso con dos clases
- **THEN** el log tiene `COURSE_CREATED` con `class_count: 2` y sin los nombres

#### Scenario: Curso duplicado
- **WHEN** se rechaza un curso por nombre repetido
- **THEN** el log tiene `COURSE_CREATION_REJECTED` con `reason: "duplicate"`

#### Scenario: Curso editado
- **WHEN** se edita un curso quitando una clase, añadiendo otra y renombrando una tercera
- **THEN** el log tiene `COURSE_UPDATED` con `classes_added: 1`, `classes_removed: 1` y `classes_renamed: 1`, sin los nombres

#### Scenario: Edición rechazada
- **WHEN** se rechaza una edición por nombre repetido o por curso cambiado
- **THEN** el log tiene `COURSE_UPDATE_REJECTED` con `reason: "duplicate"` o `reason: "changed"`

#### Scenario: Curso borrado
- **WHEN** se borra un curso con tres clases
- **THEN** el log tiene `COURSE_DELETED` con `class_count: 3` y `student_count: 0`, sin los nombres
- **AND** un borrado que responde `404` no deja `COURSE_DELETED`

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, desde 768 px de ancho MUST mostrar una tabla con las columnas Curso, Clases, Tutores, Creado y Acciones y una fila por curso, con el nombre del curso como cabecera de su fila; por debajo de 768 px MUST mostrar una tarjeta por curso con el nombre como `h2` y los mismos datos, y MUST NOT pintar las dos estructuras a la vez. Cada curso MUST mostrar sus clases como «N clases: A, B» («1 clase: A» en singular), «Sin tutor» mientras ninguna clase tenga tutor y la fecha de creación con el formato del idioma activo (`Intl.DateTimeFormat(idioma, { dateStyle: 'medium' })`), en el orden que da el servidor. Cada fila y cada tarjeta MUST tener un enlace «Editar» a `/cursos/<id>/editar` y un botón «Borrar» que abre el diálogo de borrado, visibles para los dos roles, cuyos nombres accesibles incluyan el nombre del curso («Editar 1º Primaria», «Borrar 1º Primaria»). Sin cursos, MUST mostrar «Todavía no hay cursos». El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`, y si llega desde la edición, «Curso «{nombre}» actualizado»; tras borrar un curso, «Curso «{nombre}» eliminado». Los nombres MUST pintarse como texto plano. La página MUST NOT mostrar acciones, columnas ni botones de funcionalidades que aún no existen (alumnos, horario).

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B») y una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tabla con las columnas Curso, Clases, Tutores, Creado y Acciones, y la fila «1º Primaria» con «2 clases: A, B», «Sin tutor», su fecha, el enlace «Editar» y el botón «Borrar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tarjeta por curso con su nombre como `h2`, los mismos datos, el enlace «Editar» y el botón «Borrar», y ninguna tabla

#### Scenario: Una clase
- **GIVEN** el curso «2º Primaria» con la clase «A»
- **THEN** se muestra «1 clase: A»

#### Scenario: Fecha según el idioma
- **GIVEN** un curso creado el 19 de octubre de 2026
- **WHEN** el idioma es el castellano o el inglés
- **THEN** la fecha se muestra con el formato de ese idioma

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

#### Scenario: Aviso tras editar
- **WHEN** se llega a `/cursos` tras editar un curso y llamarlo «1º Primaria Tarde»
- **THEN** se ve «Curso «1º Primaria Tarde» actualizado» y el listado muestra el nombre nuevo

#### Scenario: Enlace de edición
- **WHEN** un `MEMBER` pulsa «Editar 1º Primaria»
- **THEN** llega a `/cursos/<id>/editar` de ese curso

#### Scenario: Sin acciones futuras
- **WHEN** se abre `/cursos` con cursos
- **THEN** no hay botones de ver horario ni columna de alumnos

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
La navegación de las páginas autenticadas MUST mostrarse a los roles `ADMIN` y `MEMBER` con el enlace «Cursos» a `/cursos`, marcado con `aria-current="page"` en esa ruta, en `/cursos/nuevo` y en `/cursos/<id>/editar`; el enlace «Usuarios» MUST seguir mostrándose solo a `ADMIN`. La tarjeta «Gestión de horarios» de la pantalla de bienvenida MUST seguir sin ruta («Próximamente»).

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve «Cursos» en la navegación y no ve «Usuarios»

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve «Cursos» y «Usuarios», y al pulsar «Cursos» llega a `/cursos`

#### Scenario: Enlace activo en la edición
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** «Cursos» tiene `aria-current="page"`

#### Scenario: Bienvenida sin cambios
- **WHEN** se abre `/onboarding`
- **THEN** la tarjeta «Gestión de horarios» sigue mostrando «Próximamente» y no es un enlace

### Requirement: Accesibilidad, responsive e i18n de los cursos
Las páginas `/cursos`, `/cursos/nuevo` y `/cursos/<id>/editar` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, el campo de cada clase y su botón «Quitar clase» con un nombre accesible que identifique la fila, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla del listado MUST tener nombre (el título de la página), cabeceras de columna y el nombre del curso como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. Cada enlace «Editar» y cada botón «Borrar» MUST indicar en su nombre accesible el curso al que se refiere. El diálogo de borrado MUST tener nombre (su título), atrapar el foco mientras está abierto y cerrarse con Escape. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos MUST venir de `es.json` y `en.json`, también el número de clases y de alumnos con su plural y el indicador de resultados de la búsqueda.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, vacío, sin resultados de búsqueda y con el aviso; el formulario de creación vacío y con errores; la edición cargada, con errores, con el curso no disponible y con el curso cambiado; y el diálogo de borrado cargando, con el impacto, con error y con el error al borrar
- **THEN** no hay violaciones

#### Scenario: Tabla con cabeceras
- **GIVEN** el listado en tabla
- **THEN** la tabla se llama como el título de la página, tiene cabeceras de columna y cada nombre de curso es la cabecera de su fila

#### Scenario: Fila identificable
- **GIVEN** un formulario con las clases «A» y «B»
- **THEN** el botón para quitar la segunda tiene un nombre como «Quitar la clase 2»

#### Scenario: Acciones identificables
- **GIVEN** el listado con «1º Primaria» y «2º Primaria»
- **THEN** sus enlaces se llaman «Editar 1º Primaria» y «Editar 2º Primaria», y sus botones, «Borrar 1º Primaria» y «Borrar 2º Primaria»

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/cursos` (también con el diálogo de borrado abierto), `/cursos/nuevo` y `/cursos/<id>/editar`
- **THEN** no hay desplazamiento horizontal

### Requirement: Cursos de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado vacío, crea «1º Primaria» con las clases «A» y «B» desde «Cursos» y lo ve en el listado con «2 clases: A, B», «Sin tutor» y su fecha; que crear otra vez el mismo nombre muestra el error en el campo; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Cursos» en la navegación, crea un curso, lo edita y lo borra; que la búsqueda filtra sin distinguir acentos, muestra el estado sin resultados y se limpia; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; que un administrador edita un curso desde «Editar» (cambia el nombre, renombra una clase, añade una y quita otra) y ve el aviso y los cambios en el listado; que renombrar a un nombre ya usado muestra el error en el campo; que si otra persona quita una clase entre la carga y el guardado (por la API) se ve el aviso de curso cambiado y «Recargar» muestra lo guardado; que un administrador borra un curso con varias clases desde el diálogo, que muestra el número de clases, y el curso desaparece también tras recargar; que «Cancelar» no borra nada; y que si otra persona borra el curso (por la API) entre la apertura del diálogo y la confirmación se ve «Ese curso ya no existe».

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el curso, lo ve en el listado con sus clases, «Sin tutor» y la fecha, y recibe el error al repetir el nombre

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Cursos», no ve «Usuarios», crea un curso, lo edita y lo borra

#### Scenario: Búsqueda
- **WHEN** se ejecuta el E2E de la búsqueda con tres cursos
- **THEN** «educacion» encuentra «Educación Infantil», «XYZ» muestra el estado sin resultados y «Limpiar búsqueda» vuelve a mostrar los tres

#### Scenario: Tabla y tarjetas
- **WHEN** se ejecuta el E2E a 1280 px y a 360 px
- **THEN** a 1280 px el listado es una tabla y a 360 px son tarjetas, sin desplazamiento horizontal

#### Scenario: Edición
- **WHEN** se ejecuta el E2E de la edición
- **THEN** el administrador guarda los cambios y los ve en el listado con «Curso «…» actualizado», el nombre repetido muestra el error en el campo y el curso cambiado muestra el aviso con «Recargar»

#### Scenario: Borrado
- **WHEN** se ejecuta el E2E del borrado
- **THEN** el diálogo muestra las clases del curso, «Borrar curso» lo quita del listado con «Curso «…» eliminado» (también tras recargar), «Cancelar» no borra y un curso borrado por otra persona muestra «Ese curso ya no existe»

### Requirement: Búsqueda de cursos en el listado
Si el colegio tiene algún curso, la página `/cursos` MUST mostrar sobre el listado un campo de búsqueda (`type="search"`) con la etiqueta visible «Buscar por nombre». Al escribir, desde el primer carácter, MUST mostrar solo los cursos cuyo nombre contiene el texto, sin distinguir mayúsculas, acentos ni espacios sobrantes (los signos `º` y `ª` sí cuentan), conservando el orden. El filtro MUST hacerse en el navegador, sin peticiones nuevas. Mientras hay texto, un elemento `role="status"` MUST indicar «Mostrando N de M cursos». Sin coincidencias, MUST mostrar «No hay cursos que coincidan con «{texto}»» y un botón «Limpiar búsqueda» que vacía el campo, vuelve a mostrar todos los cursos y devuelve el foco al campo. La búsqueda MUST NOT guardarse en la URL ni en almacenamiento. Sin cursos, el campo MUST NOT mostrarse.

#### Scenario: Filtro sin mayúsculas ni acentos
- **GIVEN** los cursos «1º Primaria», «2º Primaria», «Educación Infantil» y «ESO»
- **WHEN** se escribe «primaria»
- **THEN** se ven solo «1º Primaria» y «2º Primaria», en ese orden, y «Mostrando 2 de 4 cursos»
- **AND** al escribir «educacion» se ve solo «Educación Infantil»

#### Scenario: Signos ordinales
- **GIVEN** los cursos «1º Primaria» y «1ª Primaria»
- **WHEN** se escribe «1º»
- **THEN** se ve «1º Primaria» y no «1ª Primaria»

#### Scenario: Sin coincidencias
- **WHEN** se escribe «XYZ»
- **THEN** se ve «No hay cursos que coincidan con «XYZ»» y «Limpiar búsqueda»
- **AND** al pulsar «Limpiar búsqueda» el campo queda vacío con el foco, vuelven todos los cursos y desaparece el indicador

#### Scenario: Sin peticiones al buscar
- **WHEN** se escribe en el campo de búsqueda
- **THEN** no se hace ninguna petición nueva a `GET /api/courses`

#### Scenario: Colegio sin cursos
- **WHEN** un usuario de un colegio sin cursos abre `/cursos`
- **THEN** no hay campo de búsqueda

### Requirement: Leer un curso con GET /api/courses/{id}
`GET /api/courses/{id}` MUST responder `200` con `success: true` y en `data.course` el curso del colegio de la identidad con ese `id`, con la misma forma que en el listado (`id`, `name`, `createdAt` en ISO 8601 y `classes` con `id`, `name` y `tutor: null`, ordenadas por nombre con `localeCompare('es', { numeric: true })`). Un curso inexistente, de otro colegio o un `id` que no es un UUID MUST responder `404 NOT_FOUND`, con la misma respuesta en los tres casos para no revelar que el curso existe en otro colegio; un `id` que no es un UUID MUST responderse sin consultar la base de datos.

#### Scenario: Curso del colegio
- **GIVEN** el curso «1º Primaria» con las clases «B» y «A» en el colegio de la identidad
- **WHEN** se pide `GET /api/courses/<id>`
- **THEN** la respuesta es `200` con «1º Primaria», su `createdAt` y las clases «A» y «B», cada una con su `id` y `tutor: null`

#### Scenario: Curso de otro colegio o inexistente
- **WHEN** se pide el `id` de un curso de otro colegio, un UUID que no existe o el texto `abc`
- **THEN** la respuesta es `404` con `error.code` igual a `NOT_FOUND` en los tres casos

### Requirement: Editar un curso y sus clases con PUT /api/courses/{id}
`PUT /api/courses/{id}` MUST recibir `{ name, classes: [{ id?, name }] }` y dejar el curso del colegio de la identidad exactamente en ese estado, en una única transacción: cada clase con `id` MUST conservar ese `id` y tomar el nombre recibido; cada clase sin `id` MUST crearse con un UUIDv7 nuevo; cada clase guardada cuyo `id` no aparece MUST borrarse. Dentro de la transacción MUST actualizarse primero el nombre del curso y su `updated_at` (así un nombre ya usado falla sin haber escrito nada más), después borrarse las clases ausentes, renombrarse en dos fases las que cambian de nombre (primero a un nombre temporal que no puede coincidir con un nombre válido y luego al definitivo) y por último crearse las nuevas, de modo que un intercambio de nombres entre clases y la reutilización del nombre de una clase quitada se guarden sin error. Si falla cualquier escritura, MUST NOT quedar ningún cambio. La respuesta MUST ser `200` con `success: true` y en `data.course` el estado final con la forma del listado, con `createdAt` sin cambios. MUST ignorar las propiedades desconocidas del cuerpo, también un `tutorId` o un `schoolId`. Un `PUT` idéntico al estado guardado MUST responder `200` y dejar los mismos datos. Un curso inexistente, de otro colegio o un `id` que no es un UUID MUST responder `404 NOT_FOUND` sin cambiar nada.

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
- **THEN** el curso y todas sus clases quedan como estaban

#### Scenario: Curso de otro colegio
- **WHEN** se envía un `PUT` válido con el `id` de un curso de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y ese curso no cambia

#### Scenario: Propiedades desconocidas
- **WHEN** el cuerpo incluye un `schoolId` de otro colegio o un `tutorId` en una clase
- **THEN** se ignoran: el curso sigue en el colegio de la identidad y sus clases sin tutor

### Requirement: Validación de la edición de un curso
El cuerpo de `PUT /api/courses/{id}` MUST cumplir las reglas de los nombres del curso y de sus clases (de 1 a 12 clases, nombres válidos y únicos dentro del curso) y, además, cada `id` de clase presente MUST ser un UUID (`INVALID_FORMAT` en `classes[<i>].id`) y MUST NOT repetirse en el cuerpo (`DUPLICATE` en `classes[<i>].id`, en la segunda y siguientes apariciones). Una petición no válida MUST responder `400 VALIDATION_ERROR` con un elemento `{ field, code }` por cada campo inválido, sin cambiar nada.

#### Scenario: Id de clase no válido
- **WHEN** la segunda clase se envía con `"id": "abc"`
- **THEN** la respuesta es `400` con `{ field: "classes[1].id", code: "INVALID_FORMAT" }`

#### Scenario: Id de clase repetido
- **WHEN** dos clases se envían con el mismo `id`
- **THEN** la respuesta es `400` con `{ field: "classes[1].id", code: "DUPLICATE" }` y no cambia nada

#### Scenario: Reglas de US05 al editar
- **WHEN** se envía un nombre vacío, `classes: []`, 13 clases o dos clases «A» y «a»
- **THEN** la respuesta es `400` con los mismos campos y códigos que al crear

### Requirement: Curso cambiado por otra persona
Si el cuerpo de `PUT /api/courses/{id}` incluye el `id` de una clase que no pertenece a ese curso (borrada mientras se editaba o de otro curso), la API MUST responder `409 COURSE_CHANGED` y MUST NOT guardar ningún cambio, tampoco el nombre del curso ni las demás clases. Una clase de otro curso MUST NOT modificarse. En cualquier otro caso de ediciones concurrentes MUST prevalecer el último guardado. De dos `PUT` simultáneos sobre el mismo curso, uno que borra una clase y otro que la renombra, MUST terminar uno con `200` y el otro con `409 COURSE_CHANGED`, o los dos con `200` si el que renombra se aplica antes.

#### Scenario: Clase borrada mientras se editaba
- **GIVEN** el curso con las clases «A» y «B», y que «B» se borra con otro `PUT`
- **WHEN** se envía un `PUT` con «B» renombrada usando su `id` antiguo y el nombre del curso cambiado
- **THEN** la respuesta es `409` con `COURSE_CHANGED` y el curso conserva su nombre y sus clases tal como los dejó el primer `PUT`

#### Scenario: Clase de otro curso
- **WHEN** se envía un `PUT` con el `id` de una clase de otro curso del mismo colegio
- **THEN** la respuesta es `409 COURSE_CHANGED` y ninguno de los dos cursos cambia

#### Scenario: Ediciones simultáneas
- **WHEN** se envían a la vez un `PUT` que quita la clase «B» y otro que la renombra
- **THEN** ninguna respuesta es `500` y el estado final coincide con el de la última petición que respondió `200`

### Requirement: Página de edición de un curso
La página `/cursos/:id/editar` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y pedir el curso una sola vez (también con `StrictMode`), con un indicador `role="status"` mientras carga. Con un `404` MUST mostrar «Este curso no existe o ya no está disponible» con un enlace a «Cursos»; con un `503` o un error de red, «No se ha podido cargar el curso» con «Reintentar». Con el curso cargado MUST mostrar el mismo formulario que la creación (nombre del curso y una fila por clase, en el orden del servidor), relleno con los datos actuales, con las mismas reglas compartidas al enviar, los mismos límites de filas (añadir hasta 12, quitar cualquiera salvo la última) y la misma guarda síncrona contra el doble envío. Quitar una fila MUST NOT pedir confirmación ni borrar nada hasta guardar. «Guardar» MUST estar deshabilitado mientras el formulario no tenga cambios reales respecto a lo cargado (comparando los valores recortados y con los espacios colapsados, también el orden y el número de filas) y mientras se envía. Con el `200` MUST navegar a `/cursos` reemplazando la entrada del historial y pasar el nombre para el aviso «Curso «{nombre}» actualizado». Un `400` MUST marcar sus campos; un `409 COURSE_ALREADY_EXISTS`, el nombre del curso con «Ya existe un curso con este nombre. Usa otro» y el foco en él; un `409 COURSE_CHANGED` MUST mostrar con `role="alert"` «Otra persona ha cambiado este curso. Recárgalo para ver la versión actual (se perderán tus cambios)» y un botón «Recargar» que vuelve a pedir el curso y rellena el formulario con lo guardado; un `404`, el mensaje de curso no disponible; un `503`, un `500` o un error de red MUST mostrar «No se pudo guardar el curso. Inténtalo de nuevo» con `role="alert"`, conservando lo escrito. «Cancelar» MUST volver a `/cursos` sin guardar.

#### Scenario: Formulario relleno
- **GIVEN** el curso «1º Primaria» con las clases «A» y «B»
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** el nombre es «1º Primaria», hay dos filas «A» y «B» y «Guardar» está deshabilitado

#### Scenario: Sin cambios reales
- **WHEN** se escribe un espacio al final del nombre, o se cambia una clase y se vuelve a dejar como estaba
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

### Requirement: Impacto de borrar un curso con GET /api/courses/{id}/impact
`GET /api/courses/{id}/impact` MUST responder `200` con `success: true` y en `data.impact` lo que se perdería al borrar el curso del colegio de la identidad: `classCount` (número de clases del curso) y `studentCount` (número de alumnos asignados a sus clases, que MUST ser `0` mientras no existan los alumnos). No MUST cambiar nada. Un curso inexistente, de otro colegio o con un `id` que no es un UUID MUST responder `404 NOT_FOUND`, igual en los tres casos y sin consultar la base de datos con un `id` mal formado. La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Impacto de un curso con clases
- **GIVEN** el curso «1º Primaria» con las clases «A», «B» y «C» en el colegio de la identidad
- **WHEN** se pide `GET /api/courses/<id>/impact`
- **THEN** la respuesta es `200` con `{ "impact": { "classCount": 3, "studentCount": 0 } }` y el curso sigue igual

#### Scenario: Curso ajeno o inexistente
- **WHEN** se pide el impacto de un curso de otro colegio, de un UUID que no existe o de `abc`
- **THEN** la respuesta es `404` con `error.code` igual a `NOT_FOUND` en los tres casos

### Requirement: Borrar un curso con DELETE /api/courses/{id}
`DELETE /api/courses/{id}` MUST borrar el curso del colegio de la identidad y todas sus clases en una única transacción, con la fila del curso bloqueada (`FOR UPDATE`) para que no se cruce con una edición del mismo curso, y responder `200` con `success: true` y en `data.deleted` lo que se borró de verdad (`classCount` y `studentCount`, contados dentro de la misma transacción). El borrado MUST ser real (sin papelera). Si falla cualquier escritura, MUST NOT quedar ningún cambio. Un curso inexistente, de otro colegio, ya borrado o con un `id` que no es un UUID MUST responder `404 NOT_FOUND` sin borrar nada. De dos borrados simultáneos del mismo curso, MUST terminar uno con `200` y el otro con `404`. Una edición (`PUT`) que se procese después de un borrado del mismo curso MUST responder `404`.

#### Scenario: Borrar un curso con sus clases
- **GIVEN** el curso «1º Primaria» con las clases «A», «B» y «C»
- **WHEN** se envía `DELETE /api/courses/<id>`
- **THEN** la respuesta es `200` con `{ "deleted": { "classCount": 3, "studentCount": 0 } }`, y en la base de datos no quedan ni el curso ni sus clases

#### Scenario: Curso de otro colegio
- **WHEN** se envía `DELETE` con el `id` de un curso de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y ese curso y sus clases siguen existiendo

#### Scenario: Atomicidad
- **GIVEN** que una de las escrituras de la transacción falla
- **WHEN** se procesa el borrado
- **THEN** el curso y todas sus clases siguen existiendo

#### Scenario: Borrados simultáneos
- **WHEN** se envían a la vez dos `DELETE` del mismo curso
- **THEN** uno responde `200` y el otro `404`, y el curso ya no existe

#### Scenario: Borrar mientras otra persona edita
- **WHEN** se envían a la vez un `DELETE` y un `PUT` del mismo curso
- **THEN** ninguna respuesta es `500`, y si el `PUT` se procesa después del borrado responde `404`

### Requirement: Diálogo para borrar un curso
En `/cursos`, cada fila de la tabla y cada tarjeta MUST tener, junto a «Editar», un botón «Borrar» (no un enlace) cuyo nombre accesible incluya el curso («Borrar 1º Primaria»), visible para los dos roles. Al pulsarlo MUST abrirse un diálogo modal (siempre montado, con el foco inicial en «Cancelar», sin botón de cierre de cabecera y que se cierra con Escape) que pide el impacto con `GET /api/courses/{id}/impact` y, mientras llega, muestra un indicador `role="status"` con «Borrar curso» deshabilitado. Con el impacto MUST mostrar «¿Borrar «{nombre}»?», «Se borrarán sus {N} clases» (con plural), «Tiene {M} alumnos asignados» solo si `studentCount` es mayor que 0, y «Esta acción no se puede deshacer», con «Cancelar» y «Borrar curso». Si el impacto no se puede leer, MUST mostrar un `role="alert"` con «Reintentar» y mantener «Borrar curso» deshabilitado. Al confirmar MUST enviar un único `DELETE` (guarda síncrona contra la doble pulsación), deshabilitar los dos botones y mostrar «Borrando…». Con el `200` MUST cerrar el diálogo, quitar el curso del listado sin volver a pedir la lista, mostrar «Curso «{nombre}» eliminado» en un `role="status"` (añadiendo que {M} alumnos quedan sin clase solo si el `studentCount` borrado es mayor que 0) y llevar el foco al título de la página. Con un `404` (al pedir el impacto o al borrar) MUST cerrar el diálogo, volver a pedir la lista y mostrar «Ese curso ya no existe». Con un `503`, un `500` o un error de red al borrar MUST mostrar «No se pudo borrar el curso. Inténtalo de nuevo» con `role="alert"` dentro del diálogo, que sigue abierto. «Cancelar» y Escape MUST cerrar el diálogo sin borrar y devolver el foco al botón «Borrar» del curso. No MUST pedirse una segunda confirmación.

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

