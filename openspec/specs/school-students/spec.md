# school-students Specification

## Purpose
TBD - created by archiving change us14-crear-alumno. Update Purpose after archive.
## Requirements
### Requirement: Contrato de los alumnos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/students` (`createStudent`) y `GET /api/students` (`listStudents`), con seguridad Bearer, y los esquemas `CreateStudentRequest` (`firstName`, `lastName`, `courseId` y `cafeteria` obligatorios; `classId`, `scholarship`, `foodType` y `observations` opcionales y nulables), `Student` (`id`, `firstName`, `lastName`, `course` y `class`, cada uno `{ id, name }` o `null`, `cafeteria`, `scholarship` booleano o `null`, `foodType` y `observations` texto o `null`) y `StudentSummary` (lo mismo sin `foodType` ni `observations`). `POST` MUST declarar `201`, `400`, `401`, `500` y `503`; `GET`, `200`, `401`, `500` y `503`. Las descripciones de `foodType` y `observations` MUST indicar que son datos sensibles que no aparecen en el listado. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createStudent` y `listStudents`
- **THEN** las dos exigen Bearer y declaran las respuestas indicadas, y `StudentSummary` no tiene `foodType` ni `observations`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones y los tres esquemas

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
`POST` y `GET /api/students` MUST exigir una sesión válida (`401` sin ella) y MUST estar abiertos a `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad: un alumno se crea en el colegio de quien lo crea y el listado solo trae los alumnos de su colegio.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** crea un alumno y pide el listado
- **THEN** recibe `201` y `200`, y el alumno es de su colegio

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los dos sin token
- **THEN** la respuesta es `401`

#### Scenario: Aislamiento
- **GIVEN** alumnos en dos colegios
- **WHEN** un usuario del primero pide el listado
- **THEN** solo ve los de su colegio

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
`/alumnos` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir la lista una sola vez (también con `StrictMode`) y mostrar un `role="status"` mientras carga. Desde 768 px MUST mostrar una tabla con las columnas «Nombre» («Apellidos, Nombre» en un `th scope="row"`), «Curso y clase» y «Comedor»; por debajo, tarjetas con el nombre como `h2`. «Curso y clase» MUST decir «1º Primaria A», «1º Primaria · Sin clase» o «Sin curso»; «Comedor», «Sí · Con beca», «Sí» o «No». MUST respetar el orden del servidor, mostrar siempre «Crear alumno» (hacia `/alumnos/nuevo`), «Todavía no hay alumnos» con «Crear alumno» si no hay ninguno y un `role="alert"` con «Reintentar» si falla. MUST leer el aviso `{ studentCreated: <texto no vacío> }` del estado de la navegación con una guarda de tipo y mostrar «Alumno «{nombre}» creado» como texto plano en un `role="status"`. MUST NOT mostrar el tipo de comida ni las observaciones.

#### Scenario: Tabla y tarjetas
- **GIVEN** «Juan García» en «1º Primaria» A con comedor y beca, y «Ana Álvarez» sin curso ni comedor
- **WHEN** se abre `/alumnos` a 1280 px y a 360 px
- **THEN** la tabla y las tarjetas muestran «Álvarez, Ana | Sin curso | No» y «García, Juan | 1º Primaria A | Sí · Con beca»

#### Scenario: Vacío y error
- **WHEN** no hay alumnos, o la lista responde `503`
- **THEN** se ve «Todavía no hay alumnos» con «Crear alumno», o el error con «Reintentar» que vuelve a pedirla

#### Scenario: Aviso de llegada
- **WHEN** se llega con `{ studentCreated: "<b>Juan</b> García" }`
- **THEN** se ve «Alumno «<b>Juan</b> García» creado» como texto, sin interpretar el HTML

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

