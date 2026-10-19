## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`) y `GET /api/courses` (`listCourses`), ambos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `Course` (`id`, `name`, `createdAt` en ISO 8601 y `classes`), `SchoolClass` (`id`, `name`, `tutor`, que es `null` mientras no existan profesores) y sus respuestas. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET`, `200`, `401`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse` y `listCourses`
- **THEN** ambas exigen Bearer y declaran las respuestas indicadas, y el `201` y el `200` devuelven cada curso con `createdAt` y sus clases con `tutor: null`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones y los esquemas, también `createdAt`

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

### Requirement: Listado de cursos con GET /api/courses
`GET /api/courses` MUST responder `200` con `success: true` y en `data.courses` los cursos del colegio de la identidad, y solo esos, cada uno con `id`, `name`, `createdAt` (ISO 8601) y `classes` (`id`, `name`, `tutor: null`). Los cursos y, dentro de cada uno, las clases MUST ordenarse por nombre con la comparación del castellano y numérica (`localeCompare('es', { numeric: true })`). Sin cursos, `data.courses` MUST ser un array vacío. La respuesta MUST llevar `Cache-Control: no-store`. No admite parámetros de búsqueda ni de paginación.

#### Scenario: Cursos del colegio ordenados
- **GIVEN** un colegio con «10º Curso», «2º Primaria» y «1º Primaria» (clases «B» y «A»), y otro colegio con sus propios cursos
- **WHEN** un usuario del primer colegio pide `GET /api/courses`
- **THEN** recibe «1º Primaria» (clases «A» y «B»), «2º Primaria» y «10º Curso», cada uno con su `createdAt`, y ninguno del otro colegio

#### Scenario: Colegio sin cursos
- **WHEN** un usuario de un colegio sin cursos pide `GET /api/courses`
- **THEN** la respuesta es `200` con `courses: []`

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, desde 768 px de ancho MUST mostrar una tabla con las columnas Curso, Clases, Tutores y Creado y una fila por curso, con el nombre del curso como cabecera de su fila; por debajo de 768 px MUST mostrar una tarjeta por curso con el nombre como `h2` y los mismos datos, y MUST NOT pintar las dos estructuras a la vez. Cada curso MUST mostrar sus clases como «N clases: A, B» («1 clase: A» en singular), «Sin tutor» mientras ninguna clase tenga tutor y la fecha de creación con el formato del idioma activo (`Intl.DateTimeFormat(idioma, { dateStyle: 'medium' })`), en el orden que da el servidor. Sin cursos, MUST mostrar «Todavía no hay cursos». El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`. Los nombres MUST pintarse como texto plano. La página MUST NOT mostrar acciones, columnas ni botones de funcionalidades que aún no existen (editar, borrar, alumnos, horario).

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B») y una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tabla con las columnas Curso, Clases, Tutores y Creado, y la fila «1º Primaria» con «2 clases: A, B», «Sin tutor» y su fecha

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tarjeta por curso con su nombre como `h2` y los mismos datos, y ninguna tabla

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

#### Scenario: Sin acciones futuras
- **WHEN** se abre `/cursos` con cursos
- **THEN** no hay botones de editar, borrar ni ver horario, ni columna de alumnos

### Requirement: Accesibilidad, responsive e i18n de los cursos
Las páginas `/cursos` y `/cursos/nuevo` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, el campo de cada clase y su botón «Quitar clase» con un nombre accesible que identifique la fila, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla del listado MUST tener nombre (el título de la página), cabeceras de columna y el nombre del curso como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos MUST venir de `es.json` y `en.json`, también el número de clases con su plural y el indicador de resultados de la búsqueda.

#### Scenario: Sin violaciones
- **WHEN** se analizan las dos páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, vacío, sin resultados de búsqueda y con el aviso, y el formulario vacío y con errores
- **THEN** no hay violaciones

#### Scenario: Tabla con cabeceras
- **GIVEN** el listado en tabla
- **THEN** la tabla se llama como el título de la página, tiene cabeceras de columna y cada nombre de curso es la cabecera de su fila

#### Scenario: Fila identificable
- **GIVEN** un formulario con las clases «A» y «B»
- **THEN** el botón para quitar la segunda tiene un nombre como «Quitar la clase 2»

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/cursos` y `/cursos/nuevo`
- **THEN** no hay desplazamiento horizontal

### Requirement: Cursos de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado vacío, crea «1º Primaria» con las clases «A» y «B» desde «Cursos» y lo ve en el listado con «2 clases: A, B», «Sin tutor» y su fecha; que crear otra vez el mismo nombre muestra el error en el campo; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Cursos» en la navegación y crea un curso; que la búsqueda filtra sin distinguir acentos, muestra el estado sin resultados y se limpia; y que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px.

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el curso, lo ve en el listado con sus clases, «Sin tutor» y la fecha, y recibe el error al repetir el nombre

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Cursos», no ve «Usuarios» y crea un curso

#### Scenario: Búsqueda
- **WHEN** se ejecuta el E2E de la búsqueda con tres cursos
- **THEN** «educacion» encuentra «Educación Infantil», «XYZ» muestra el estado sin resultados y «Limpiar búsqueda» vuelve a mostrar los tres

#### Scenario: Tabla y tarjetas
- **WHEN** se ejecuta el E2E a 1280 px y a 360 px
- **THEN** a 1280 px el listado es una tabla y a 360 px son tarjetas, sin desplazamiento horizontal
