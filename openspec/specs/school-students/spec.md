# school-students Specification

## Purpose
TBD - created by archiving change us14-crear-alumno. Update Purpose after archive.
## Requirements
### Requirement: Contrato de los alumnos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/students` (`createStudent`), `GET /api/students` (`listStudents`), `GET /api/students/{id}` (`getStudent`) y `PUT /api/students/{id}` (`updateStudent`), con seguridad Bearer, y los esquemas `CreateStudentRequest` (`firstName`, `lastName`, `courseId` y `cafeteria` obligatorios; `classId`, `scholarship`, `foodType` y `observations` opcionales y nulables), `UpdateStudentRequest` (los mismos campos y reglas, como estado final del alumno), `Student` (`id`, `firstName`, `lastName`, `course` y `class`, cada uno `{ id, name }` o `null`, `cafeteria`, `scholarship` booleano o `null`, `foodType` y `observations` texto o `null`) y `StudentSummary` (lo mismo sin `foodType` ni `observations`). `POST` MUST declarar `201`, `400`, `401`, `500` y `503`; `GET /api/students`, `200`, `401`, `500` y `503`; `GET /api/students/{id}`, `200` (`{ student: Student }`), `401`, `404`, `500` y `503`; `PUT /api/students/{id}`, `200` (`{ student: Student }`), `400`, `401`, `404`, `500` y `503`. El parámetro `id` MUST ser un UUID. Las descripciones de `foodType` y `observations` MUST indicar que son datos sensibles que no aparecen en el listado. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createStudent`, `listStudents`, `getStudent` y `updateStudent`
- **THEN** las cuatro exigen Bearer y declaran las respuestas indicadas, y `StudentSummary` no tiene `foodType` ni `observations`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los cuatro esquemas

### Requirement: Tabla de alumnos
La migración `add_students` MUST crear la tabla `students` con `id` (UUID), `school_id` (clave ajena a `schools`, sin cascada, como `courses` y `professors`), `course_id` (nulo, clave ajena a `courses`, `ON DELETE SET NULL`), `class_id` (nulo, clave ajena a `classes`, `ON DELETE SET NULL`), `first_name` y `last_name` (`VARCHAR(100)`), `cafeteria` (`BOOLEAN NOT NULL`), `scholarship` (`BOOLEAN` nulo), `food_type` (`VARCHAR(255)` nulo), `observations` (`TEXT` nulo), `created_at` y `updated_at`, con índices por `school_id`, `course_id` y `class_id`. MUST impedir con restricciones `CHECK` una beca o un tipo de comida sin comedor y un alumno de comedor sin respuesta de beca. MUST NOT tener columnas de estado, borrado lógico ni email.

#### Scenario: Restricción del comedor
- **WHEN** se inserta directamente un alumno con `cafeteria = false` y `scholarship = true`, o con `cafeteria = true` y `scholarship` nulo
- **THEN** la base de datos rechaza la fila

### Requirement: Crear un alumno con POST /api/students
`POST /api/students` MUST crear, en una única transacción, un alumno del colegio de la identidad y responder `201` con `success: true` y en `data.student` el `id` (UUIDv7 generado por la aplicación), `firstName` y `lastName` (recortados y con los espacios repetidos colapsados), `course` y `class` con su `id` y su nombre (`class: null` sin clase), `cafeteria`, `scholarship` (`null` sin comedor), `foodType` y `observations` (recortados, o `null` si faltan o quedan vacíos). MUST ignorar las propiedades desconocidas del cuerpo, también un `schoolId`. Si falla cualquier escritura, MUST NOT crearse el alumno.

#### Scenario: Alumno completo
- **GIVEN** la clase «A» de «1º Primaria» en el colegio de la identidad
- **WHEN** se envía `{ "firstName": " Juan ", "lastName": "García", "courseId": "<1º Primaria>", "classId": "<A>", "cafeteria": true, "scholarship": true, "foodType": "Vegetariana", "observations": "Necesita apoyo" }`
- **THEN** la respuesta es `201` con «Juan», «García», `course` «1º Primaria», `class` «A», `cafeteria: true`, `scholarship: true`, «Vegetariana» y «Necesita apoyo»

#### Scenario: Alumno sin clase y sin comedor
- **WHEN** se envía un alumno con `courseId`, sin `classId` y con `cafeteria: false`
- **THEN** la respuesta es `201` con `class: null`, `scholarship: null`, `foodType: null` y `observations: null`

#### Scenario: Atomicidad
- **GIVEN** que la escritura del alumno falla
- **WHEN** se procesa el alta
- **THEN** la respuesta es un error y no queda ningún alumno nuevo

### Requirement: Reglas de los campos del alumno
`firstName` y `lastName` MUST seguir las reglas de la persona del registro (obligatorios, de 1 a 100 caracteres tras recortar y colapsar espacios, letras con acentos, espacios, guiones, apóstrofos y `·`), sin unicidad. `courseId` MUST ser un UUID obligatorio y `classId`, si viene y no es `null`, un UUID. `cafeteria` MUST ser un booleano obligatorio. `foodType` MUST tener como máximo 255 caracteres y `observations` como máximo 5000, ambos tras recortar los extremos (`observations` conserva los saltos de línea interiores); vacíos equivalen a `null`. Los errores MUST devolverse en el orden `firstName`, `lastName`, `courseId`, `classId`, `cafeteria`, `scholarship`, `foodType`, `observations`. Backend y frontend MUST recorrer la misma tabla `test-fixtures/student-fields.json`.

#### Scenario: Campos inválidos
- **WHEN** se envía `{ "firstName": "", "lastName": "<b>G</b>", "courseId": "abc", "cafeteria": "sí", "observations": "<5001 caracteres>" }`
- **THEN** la respuesta es `400 VALIDATION_ERROR` con, en este orden, `firstName: REQUIRED`, `lastName: INVALID_CHARACTERS`, `courseId: INVALID_FORMAT`, `cafeteria: INVALID_FORMAT` y `observations: INVALID_LENGTH`

#### Scenario: Curso y comedor obligatorios
- **WHEN** se envía un alumno sin `courseId` ni `cafeteria`
- **THEN** la respuesta es `400` con `courseId: REQUIRED` y `cafeteria: REQUIRED`

#### Scenario: Límites
- **WHEN** se envían `foodType` de 255 caracteres y `observations` de 5000
- **THEN** el alumno se crea, y con 256 y 5001 la respuesta es `400` con `INVALID_LENGTH` en cada campo

### Requirement: Comedor, beca y tipo de comida
Con `cafeteria: true`, `scholarship` MUST ser un booleano obligatorio (`REQUIRED` si falta o es `null`) y `foodType` es opcional. Con `cafeteria: false`, `scholarship` y `foodType` MUST faltar o ser `null`; si traen un valor, la respuesta MUST ser `400` con `NOT_ALLOWED` en ese campo. La beca es siempre de comedor.

#### Scenario: Beca sin comedor
- **WHEN** se envía `cafeteria: false` con `scholarship: false` y `foodType: "Sin gluten"`
- **THEN** la respuesta es `400` con `scholarship: NOT_ALLOWED` y `foodType: NOT_ALLOWED`, y no se crea nada

#### Scenario: Comedor sin respuesta de beca
- **WHEN** se envía `cafeteria: true` sin `scholarship`
- **THEN** la respuesta es `400` con `scholarship: REQUIRED`

### Requirement: Curso y clase del alumno
El curso MUST existir en el colegio de la identidad y la clase, si se indica, MUST ser de ese curso. Un curso inexistente o de otro colegio MUST responder `400` con `courseId: NOT_FOUND`; una clase inexistente, de otro curso o de otro colegio, `400` con `classId: NOT_FOUND`, sin distinguir los casos. La comprobación MUST hacerse dentro de la transacción del alta con la fila del curso bloqueada en modo compartido, de modo que un borrado o una edición simultáneos del mismo curso no dejen al alumno con un curso o una clase inexistentes ni con una clase de otro curso.

#### Scenario: Clase de otro curso
- **GIVEN** «1º Primaria» y «2º Primaria» con sus clases «A»
- **WHEN** se envía el `courseId` de 1º con el `classId` de la «A» de 2º
- **THEN** la respuesta es `400` con `classId: NOT_FOUND`

#### Scenario: Curso de otro colegio
- **WHEN** se envía el `courseId` de un curso de otro colegio
- **THEN** la respuesta es `400` con `courseId: NOT_FOUND` y no se crea nada

#### Scenario: Alta mientras se borra el curso
- **WHEN** se envían a la vez el alta de un alumno en un curso y el `DELETE` de ese curso
- **THEN** ninguna respuesta es `500`; si el alta se procesa después responde `400` con `courseId: NOT_FOUND`, y si se procesa antes el alumno queda sin curso ni clase tras el borrado

### Requirement: Listado de alumnos con GET /api/students
`GET /api/students` MUST responder `200` con `success: true` y en `data.students` todos los alumnos del colegio de la identidad con la forma `StudentSummary`, ordenados por apellidos y después por nombre según el español (sin distinguir mayúsculas ni acentos). MUST NOT devolver `foodType` ni `observations`. Sin alumnos, MUST devolver una lista vacía.

#### Scenario: Listado ordenado
- **GIVEN** los alumnos «Juan García», «Ana Álvarez» y «Eva García»
- **WHEN** se pide `GET /api/students`
- **THEN** el orden es Álvarez Ana, García Eva, García Juan, y ningún elemento tiene `foodType` ni `observations`

#### Scenario: Alumno sin curso
- **GIVEN** un alumno cuyo curso se borró
- **THEN** aparece en el listado con `course: null` y `class: null`

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

### Requirement: Datos sensibles de los alumnos
El tipo de comida y las observaciones MUST tratarse como datos sensibles (pueden contener datos de salud de menores): MUST NOT aparecer en ningún log ni en `GET /api/students`, y MUST mostrarse siempre como texto plano. El formulario MUST mostrar bajo esos campos la ayuda «Anota solo lo necesario para atender al alumno. No aparece en el listado.», ligada a ellos.

#### Scenario: Nada en los logs
- **WHEN** se crea un alumno con «Alérgico a frutos secos» y unas observaciones
- **THEN** ningún evento del log contiene esos textos, el nombre ni los apellidos

### Requirement: Eventos de log de los alumnos
Un alta correcta MUST registrar `STUDENT_CREATED` con `school_id`, `actor_id`, `student_id`, `has_class` y `cafeteria`. Un alta rechazada por el curso o la clase MUST registrar `STUDENT_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`course_not_found` o `class_not_found`). Un error de validación del cuerpo no MUST registrar evento de rechazo.

#### Scenario: Evento del alta
- **WHEN** se crea un alumno con clase y comedor
- **THEN** se registra `STUDENT_CREATED` con `has_class: true` y `cafeteria: true` y sin datos personales

#### Scenario: Evento del rechazo
- **WHEN** el alta falla porque la clase no es del curso
- **THEN** se registra `STUDENT_CREATION_REJECTED` con `reason: "class_not_found"`

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

### Requirement: Página de creación de un alumno
`/alumnos/nuevo` MUST colgar de `AuthenticatedLayout` sin restricción de rol y pedir los cursos (`GET /api/courses`) una sola vez. El formulario (`StudentForm`) MUST tener «Nombre», «Apellidos», «Curso» (desplegable obligatorio con los cursos en el orden del servidor), «Clase» («Sin clase» y las clases del curso elegido; desactivado sin curso; vuelve a «Sin clase» al cambiar el curso), «¿Come en el comedor?» (dos opciones «Sí» y «No» en un grupo con leyenda, sin ninguna marcada al empezar), y solo con «Sí», «Beca de comedor» (casilla, desmarcada al empezar) y «Tipo de comida»; y «Observaciones» con un contador de caracteres. Al pasar a «No», la beca y el tipo de comida MUST descartarse y no enviarse. MUST validar al salir de cada campo y al enviar, con los errores bajo su campo (`aria-invalid`, `aria-describedby`), llevar el foco al primer campo inválido y no enviar nada con errores. MUST enviar un único `POST` aunque se pulse dos veces y mostrar «Guardando…». Con el `201` MUST navegar a `/alumnos` con `replace` y el aviso. Un `400` MUST marcar sus campos; `courseId` o `classId` `NOT_FOUND` MUST volver a pedir los cursos, marcar su desplegable («Ese curso ya no existe. Elige otro» o «Esa clase ya no existe. Elige otra»), darle el foco y conservar lo demás. Cualquier otro fallo MUST mostrar «No se pudo crear el alumno. Inténtalo de nuevo» con `role="alert"` y conservar lo escrito. Si los cursos no cargan, «Curso» y «Clase» MUST desactivarse con un aviso y «Reintentar», y el formulario no MUST poder enviarse; sin cursos en el colegio, un texto con enlace a «Crear curso».

#### Scenario: Clases según el curso
- **GIVEN** «1º Primaria» con «A» y «B» y «2º Primaria» con «A»
- **WHEN** se elige «1º Primaria», la clase «B» y después «2º Primaria»
- **THEN** la clase vuelve a «Sin clase» y solo ofrece la «A» de 2º

#### Scenario: Comedor
- **WHEN** se elige «Sí», se marca la beca y se escribe «Vegetariana», y después se elige «No» y se guarda
- **THEN** la beca y el tipo de comida desaparecen y el `POST` lleva `cafeteria: false` sin `scholarship` ni `foodType`

#### Scenario: Validación antes de enviar
- **WHEN** se pulsa «Guardar» con todo vacío
- **THEN** se ven los errores de nombre, apellidos, curso y comedor, el foco está en «Nombre» y no se envía nada

#### Scenario: Curso borrado antes de guardar
- **GIVEN** que el `POST` responde `400` con `courseId: NOT_FOUND`
- **THEN** los cursos se vuelven a pedir, «Curso» muestra «Ese curso ya no existe. Elige otro» con el foco y el nombre escrito se conserva

### Requirement: Enlace a los alumnos en la navegación
La cabecera MUST mostrar «Alumnos» hacia `/alumnos` a los dos roles, entre «Profesores» y «Usuarios», con `aria-current="page"` en `/alumnos` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la cabecera muestra «Cursos», «Profesores» y «Alumnos», y «Alumnos» lleva `aria-current` en `/alumnos/nuevo`

### Requirement: Accesibilidad, responsive e i18n de los alumnos
Las páginas de alumnos MUST tener etiquetas visibles, errores ligados a su campo, el contador y la ayuda ligados por `aria-describedby`, el comedor en un `fieldset` con `legend`, ninguna violación de las reglas WCAG 2.1 AA que comprueba `axe-core` (listado vacío y con datos, formulario vacío, con errores y con comedor «Sí»), ningún desplazamiento horizontal a 360 px y todos sus textos en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se ejecuta `axe-core` en cada uno de esos estados
- **THEN** no hay violaciones

### Requirement: Alumnos de extremo a extremo
Los tests E2E MUST cubrir: crear un alumno con clase, comedor y beca y verlo en el listado; crear uno sin clase y sin comedor; la validación antes de enviar; el curso que otra persona borra antes de guardar; un `MEMBER` que crea un alumno; el listado y el formulario a 360 px sin desplazamiento horizontal; y borrar un curso con alumnos (el diálogo los cuenta, el aviso dice que quedan sin curso y `/alumnos` los muestra «Sin curso»).

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de alumnos de `students.cy.ts` y el de borrar un curso con alumnos

### Requirement: Total y paginación del listado de alumnos
Con alumnos en el colegio, `/alumnos` MUST mostrar encima del listado el total («N alumnos», «1 alumno» en singular) y MUST paginar de 20 en 20 en el navegador con el componente de paginación de los profesores («Anterior», «Página X de N» en una región `aria-live="polite"` y «Siguiente»), que no se pinta con una sola página. La tabla y las tarjetas MUST mostrar la misma página. Una página fuera de rango MUST acotarse a la última. Al cambiar de página, la vista MUST desplazarse al total sin mover el foco. MUST NOT hacer peticiones nuevas al paginar.

#### Scenario: Más de una página
- **GIVEN** 45 alumnos
- **WHEN** se abre `/alumnos` a 1280 px o a 360 px
- **THEN** se ven «45 alumnos», los 20 primeros por apellidos y nombre y «Página 1 de 3»
- **AND** en la página 3 se ven 5 alumnos

#### Scenario: Una sola página
- **GIVEN** 3 alumnos
- **THEN** se ve «3 alumnos» y no hay paginación

### Requirement: Búsqueda de alumnos por nombre o apellidos
Con alumnos en el colegio, `/alumnos` MUST mostrar un campo de búsqueda (`type="search"`) con la etiqueta visible «Buscar por nombre o apellidos» y un máximo de 100 caracteres. Al escribir, desde el primer carácter y sin peticiones, MUST mostrar solo los alumnos en cuyo nombre o apellidos aparece **cada** palabra del texto, en cualquier orden y como parte de una palabra, sin distinguir mayúsculas, acentos (la «ñ» busca como «n») ni espacios sobrantes: la misma regla que la búsqueda de profesores. El texto MUST NOT guardarse en la URL ni en almacenamiento.

#### Scenario: Palabras en cualquier orden
- **GIVEN** «García López, Juan», «García, Ana» y «Muñoz, José»
- **WHEN** se escribe «juan garcia»
- **THEN** se ve solo «García López, Juan»
- **AND** «JOSE munoz» encuentra a «Muñoz, José»

#### Scenario: Sin rastro en la URL
- **WHEN** se escribe en la búsqueda
- **THEN** la URL no cambia y no se hace ninguna petición a `GET /api/students`

### Requirement: Filtros del listado de alumnos
Con alumnos en el colegio, `/alumnos` MUST ofrecer, junto a la búsqueda, cuatro desplegables con etiqueta visible, opcionales y combinables con ella (un alumno se muestra solo si cumple todos):
- **Curso:** «Todos los cursos», los cursos que tienen algún alumno cargado, en orden natural en castellano («2º» antes que «10º»), y «Sin curso» si algún alumno no tiene curso.
- **Clase:** desactivado, con una ayuda ligada por `aria-describedby`, mientras no se elija un curso concreto; con uno, «Todas las clases», las clases de ese curso que tienen algún alumno, en orden natural, y «Sin clase» si algún alumno de ese curso no tiene clase. Cambiar de curso MUST volver a «Todas las clases».
- **Comedor:** «Todos», «Come en el comedor» y «No come en el comedor».
- **Beca:** desactivado, con una ayuda ligada, salvo con «Come en el comedor»; entonces «Todos», «Con beca» y «Sin beca». Dejar «Come en el comedor» MUST volver a «Todos».
Cambiar cualquier filtro o el texto de búsqueda MUST volver a la página 1. Mientras haya algún filtro o texto, el total MUST decir «Mostrando N de M alumnos» en un `role="status"`; sin coincidencias, MUST mostrar «No hay alumnos que coincidan con los filtros» y «Limpiar filtros», que quita todos los filtros y el texto, vuelve a la página 1 y lleva el foco al campo de búsqueda; sin listado ni paginación. Sin alumnos en el colegio, MUST mostrar el vacío de siempre sin barra de filtros. MUST NOT filtrar ni mostrar el tipo de comida ni las observaciones.

#### Scenario: Curso y clase
- **GIVEN** alumnos en «1º Primaria» A, en «1º Primaria» sin clase, en «2º Primaria» B y uno sin curso
- **WHEN** se abre `/alumnos`
- **THEN** «Curso» ofrece «Todos los cursos», «1º Primaria», «2º Primaria» y «Sin curso», y «Clase» está desactivado con su ayuda
- **AND** al elegir «1º Primaria», «Clase» ofrece «Todas las clases», «A» y «Sin clase»; al elegir «A» se ven solo los de 1º A
- **AND** al cambiar a «2º Primaria», «Clase» vuelve a «Todas las clases»
- **AND** «Sin curso» muestra solo el alumno sin curso

#### Scenario: Comedor y beca
- **GIVEN** alumnos con comedor y beca, con comedor sin beca y sin comedor
- **WHEN** se elige «Come en el comedor»
- **THEN** se ven solo los inscritos y «Beca» se activa; «Con beca» y «Sin beca» filtran entre ellos
- **AND** al elegir «No come en el comedor» se ven solo los no inscritos y «Beca» vuelve a «Todos» y se desactiva

#### Scenario: Combinados y vuelta a la página 1
- **GIVEN** que se está en la página 2
- **WHEN** se escribe «juan», se elige «1º Primaria» y «Come en el comedor»
- **THEN** se ven solo los alumnos que cumplen las tres condiciones, desde la página 1, y «Mostrando N de M alumnos»

#### Scenario: Sin coincidencias
- **WHEN** los filtros no dejan ningún alumno
- **THEN** se ve «No hay alumnos que coincidan con los filtros» con «Limpiar filtros», sin tabla ni paginación
- **AND** al pulsar «Limpiar filtros» vuelven todos los alumnos en la página 1, los desplegables a su primera opción, la búsqueda vacía y con el foco

### Requirement: Filtros del listado de alumnos en la URL
`/alumnos` MUST leer y escribir en la URL los filtros y la página, con estos parámetros: `curso` (el `id` de un curso o `sin-curso`), `clase` (el `id` de una clase o `sin-clase`; solo cuenta con un `curso` concreto), `comedor` (`si` o `no`), `beca` (`si` o `no`; solo cuenta con `comedor=si`) y `pagina` (entero mayor que 1; la primera página no se escribe). Los parámetros sin valor o con el valor por defecto MUST NOT escribirse. Cada cambio MUST sustituir la entrada del historial (`replace`). Un valor desconocido o que ya no corresponde a ningún alumno cargado (un curso borrado, una clase de otro curso, un curso de otro colegio, `pagina=abc`) MUST tratarse como si no estuviera, sin error; una página mayor que la última MUST mostrarse como la última. El texto de búsqueda MUST NOT escribirse en la URL. Los parámetros MUST NOT enviarse a la API.

#### Scenario: Recargar conserva los filtros
- **GIVEN** que se ha elegido «1º Primaria», «Come en el comedor» y la página 2
- **THEN** la URL es `/alumnos?curso=<id>&comedor=si&pagina=2`
- **AND** al recargar la página se ven los mismos filtros y la misma página

#### Scenario: Valores obsoletos
- **WHEN** se abre `/alumnos?curso=<id de un curso que ya no existe o de otro colegio>&comedor=quizas&pagina=99`
- **THEN** se ve el listado sin filtro de curso ni de comedor, en la última página, sin mensaje de error

#### Scenario: Beca sin comedor
- **WHEN** se abre `/alumnos?beca=si`
- **THEN** «Beca» está desactivado en «Todos» y no filtra

### Requirement: Alumnos filtrados de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con alumnos creados por la API: la búsqueda por nombre y apellidos sin acentos; el filtro por curso y clase (con «Sin clase»); comedor y beca; sin coincidencias y «Limpiar filtros»; la paginación con más de 20 alumnos; que recargar una URL con filtros y página los conserva y que la búsqueda no aparece en la URL; y la barra de filtros a 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido de filtros
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de filtros de `students.cy.ts`

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

