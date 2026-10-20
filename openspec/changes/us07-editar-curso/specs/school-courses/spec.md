## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`), `GET /api/courses` (`listCourses`), `GET /api/courses/{id}` (`getCourse`) y `PUT /api/courses/{id}` (`updateCourse`), todos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID y `name`), `Course` (`id`, `name`, `createdAt` en ISO 8601 y `classes`), `SchoolClass` (`id`, `name`, `tutor`, que es `null` mientras no existan profesores) y sus respuestas. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET /api/courses`, `200`, `401`, `500` y `503`; `GET /api/courses/{id}`, `200`, `401`, `404`, `500` y `503`; `PUT /api/courses/{id}`, `200`, `400`, `401`, `404`, `409` (`COURSE_ALREADY_EXISTS` o `COURSE_CHANGED`), `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse`, `listCourses`, `getCourse` y `updateCourse`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas, y el `201` y los `200` devuelven cada curso con `createdAt` y sus clases con `tutor: null`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los esquemas, también `createdAt` y el `id` opcional de `UpdateCourseRequest`

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

### Requirement: Acceso a los cursos
`POST /api/courses`, `GET /api/courses`, `GET /api/courses/{id}` y `PUT /api/courses/{id}` MUST exigir una sesión válida (`requireAuthentication`) y MUST admitir los roles `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad de la petición. Sin token o con una sesión no válida MUST responder `401 INVALID_SESSION`; con la base de datos caída, `503 DATABASE_UNAVAILABLE`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** crea un curso, lista los cursos, lee uno y lo edita
- **THEN** recibe `201`, `200`, `200` y `200`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de las cuatro operaciones sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y `WWW-Authenticate: Bearer`

#### Scenario: Base de datos no disponible
- **GIVEN** que la base de datos no responde
- **WHEN** se crea, se lista, se lee o se edita un curso
- **THEN** la respuesta es `503` con `DATABASE_UNAVAILABLE`

### Requirement: Eventos de log de los cursos
El backend MUST registrar `COURSE_CREATED` con `school_id`, `actor_id`, `course_id` y `class_count` tras crear un curso, y `COURSE_CREATION_REJECTED` con `school_id`, `actor_id` y `reason: "duplicate"` cuando el nombre ya existe. Tras editar un curso MUST registrar `COURSE_UPDATED` con `school_id`, `actor_id`, `course_id`, `classes_added`, `classes_removed` y `classes_renamed`, y al rechazar una edición, `COURSE_UPDATE_REJECTED` con `school_id`, `actor_id`, `course_id` y `reason` igual a `"duplicate"` (nombre ya usado) o `"changed"` (curso cambiado por otra persona). Los eventos MUST NOT incluir los nombres del curso ni de las clases.

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

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, desde 768 px de ancho MUST mostrar una tabla con las columnas Curso, Clases, Tutores, Creado y Acciones y una fila por curso, con el nombre del curso como cabecera de su fila; por debajo de 768 px MUST mostrar una tarjeta por curso con el nombre como `h2` y los mismos datos, y MUST NOT pintar las dos estructuras a la vez. Cada curso MUST mostrar sus clases como «N clases: A, B» («1 clase: A» en singular), «Sin tutor» mientras ninguna clase tenga tutor y la fecha de creación con el formato del idioma activo (`Intl.DateTimeFormat(idioma, { dateStyle: 'medium' })`), en el orden que da el servidor. Cada fila y cada tarjeta MUST tener un enlace «Editar» a `/cursos/<id>/editar`, visible para los dos roles, cuyo nombre accesible incluya el nombre del curso («Editar 1º Primaria»). Sin cursos, MUST mostrar «Todavía no hay cursos». El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`, y si llega desde la edición, «Curso «{nombre}» actualizado». Los nombres MUST pintarse como texto plano. La página MUST NOT mostrar acciones, columnas ni botones de funcionalidades que aún no existen (borrar, alumnos, horario).

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B») y una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tabla con las columnas Curso, Clases, Tutores, Creado y Acciones, y la fila «1º Primaria» con «2 clases: A, B», «Sin tutor», su fecha y el enlace «Editar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tarjeta por curso con su nombre como `h2`, los mismos datos y el enlace «Editar», y ninguna tabla

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
- **THEN** no hay botones de borrar ni ver horario, ni columna de alumnos

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
Las páginas `/cursos`, `/cursos/nuevo` y `/cursos/<id>/editar` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, el campo de cada clase y su botón «Quitar clase» con un nombre accesible que identifique la fila, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla del listado MUST tener nombre (el título de la página), cabeceras de columna y el nombre del curso como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. Cada enlace «Editar» MUST indicar en su nombre accesible el curso al que lleva. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos MUST venir de `es.json` y `en.json`, también el número de clases con su plural y el indicador de resultados de la búsqueda.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, vacío, sin resultados de búsqueda y con el aviso; el formulario de creación vacío y con errores; y la edición cargada, con errores, con el curso no disponible y con el curso cambiado
- **THEN** no hay violaciones

#### Scenario: Tabla con cabeceras
- **GIVEN** el listado en tabla
- **THEN** la tabla se llama como el título de la página, tiene cabeceras de columna y cada nombre de curso es la cabecera de su fila

#### Scenario: Fila identificable
- **GIVEN** un formulario con las clases «A» y «B»
- **THEN** el botón para quitar la segunda tiene un nombre como «Quitar la clase 2»

#### Scenario: Enlace de edición identificable
- **GIVEN** el listado con «1º Primaria» y «2º Primaria»
- **THEN** sus enlaces se llaman «Editar 1º Primaria» y «Editar 2º Primaria»

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/cursos`, `/cursos/nuevo` y `/cursos/<id>/editar`
- **THEN** no hay desplazamiento horizontal

### Requirement: Cursos de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado vacío, crea «1º Primaria» con las clases «A» y «B» desde «Cursos» y lo ve en el listado con «2 clases: A, B», «Sin tutor» y su fecha; que crear otra vez el mismo nombre muestra el error en el campo; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Cursos» en la navegación, crea un curso y lo edita; que la búsqueda filtra sin distinguir acentos, muestra el estado sin resultados y se limpia; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; que un administrador edita un curso desde «Editar» (cambia el nombre, renombra una clase, añade una y quita otra) y ve el aviso y los cambios en el listado; que renombrar a un nombre ya usado muestra el error en el campo; y que si otra persona quita una clase entre la carga y el guardado (por la API) se ve el aviso de curso cambiado y «Recargar» muestra lo guardado.

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el curso, lo ve en el listado con sus clases, «Sin tutor» y la fecha, y recibe el error al repetir el nombre

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Cursos», no ve «Usuarios», crea un curso y lo edita

#### Scenario: Búsqueda
- **WHEN** se ejecuta el E2E de la búsqueda con tres cursos
- **THEN** «educacion» encuentra «Educación Infantil», «XYZ» muestra el estado sin resultados y «Limpiar búsqueda» vuelve a mostrar los tres

#### Scenario: Tabla y tarjetas
- **WHEN** se ejecuta el E2E a 1280 px y a 360 px
- **THEN** a 1280 px el listado es una tabla y a 360 px son tarjetas, sin desplazamiento horizontal

#### Scenario: Edición
- **WHEN** se ejecuta el E2E de la edición
- **THEN** el administrador guarda los cambios y los ve en el listado con «Curso «…» actualizado», el nombre repetido muestra el error en el campo y el curso cambiado muestra el aviso con «Recargar»
