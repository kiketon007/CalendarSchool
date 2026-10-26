# school-subjects Specification

## Purpose
TBD - created by archiving change us-subject-asignaturas. Update Purpose after archive.
## Requirements
### Requirement: Contrato de las asignaturas en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/subjects` (`createSubject`) y `GET /api/subjects` (`listSubjects`), con seguridad Bearer, y los esquemas `SubjectType` (`CORE`, `ELECTIVE`, `CUSTOM`), `SubjectStatus` (`ACTIVE`, `INACTIVE`), `SubjectColor` (`blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`), `CreateSubjectRequest` (`name`, `type`, `status`, `color` y `courses` obligatorios; `code` y `description` opcionales y admitiendo `null`; `courses` como lista de `{ courseId, sessionsPerWeek }`; sin más propiedades), `SubjectCourse` (`id`, `name`, `sessionsPerWeek`) y `Subject` (`id`, `name`, `code` como texto o `null`, `type`, `status`, `description` como texto o `null`, `color`, `courses` como lista de `SubjectCourse` y `createdAt`). `POST` MUST declarar `201` (`{ subject: Subject }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET`, `200` (`{ subjects: Subject[] }`), `401`, `500` y `503`. La descripción de `POST` MUST decir que es solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createSubject` y `listSubjects`
- **THEN** las dos exigen Bearer y declaran las respuestas indicadas, y `createSubject` declara `403` y `409`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones y los esquemas `CreateSubjectRequest`, `Subject`, `SubjectCourse` y `SubjectColor`

### Requirement: Tablas de las asignaturas
La migración `add_subjects` MUST crear los enums `SubjectType`, `SubjectStatus` y `SubjectColor` (con las claves del contrato), la tabla `subjects` (`id` UUID, `school_id` clave ajena a `schools` sin cascada, `name` y `normalized_name` `VARCHAR(100)`, `code` y `normalized_code` `VARCHAR(10)` nulos, `type`, `status`, `description` `VARCHAR(500)` nula, `color`, `created_at`, `updated_at`, con índices únicos `(school_id, normalized_name)` y `(school_id, normalized_code)`) y la tabla `subject_courses` (`subject_id` clave ajena a `subjects` con `ON DELETE CASCADE`, `course_id` clave ajena a `courses` con `ON DELETE CASCADE`, `sessions_per_week` `SMALLINT`, `created_at`, `updated_at`, clave primaria `(subject_id, course_id)`, índice en `course_id` y un `CHECK` escrito a mano llamado `subject_courses_sessions_per_week_check` que exige `sessions_per_week BETWEEN 1 AND 5`). MUST NOT añadir borrado lógico, `created_by` ni `updated_by`, ni tocar las columnas de las tablas existentes.

#### Scenario: Restricción de las sesiones
- **WHEN** se inserta directamente en la base de datos una fila de `subject_courses` con `sessions_per_week` igual a 0 y otra igual a 6
- **THEN** la base de datos rechaza las dos por la restricción `subject_courses_sessions_per_week_check`

#### Scenario: Varias asignaturas sin código
- **WHEN** se insertan directamente dos asignaturas del mismo colegio con `normalized_code` a `NULL`
- **THEN** la base de datos acepta las dos

#### Scenario: La asignatura sobrevive a sus cursos
- **GIVEN** una asignatura con un solo curso
- **WHEN** se borra ese curso
- **THEN** la asignatura sigue existiendo y no tiene filas en `subject_courses`

### Requirement: Crear una asignatura con POST /api/subjects
`POST /api/subjects` MUST crear en el colegio de la identidad la asignatura y sus filas de `subject_courses` en una única transacción, y responder `201` con la asignatura tal como quedó (sus cursos en orden natural del nombre del curso) y `Cache-Control: no-store`. Si falla cualquier escritura, MUST NOT quedar nada. Dos altas simultáneas con el mismo nombre MUST terminar con un `201` y un `409 SUBJECT_ALREADY_EXISTS`, y con el mismo código, con un `201` y un `409 SUBJECT_CODE_ALREADY_EXISTS`.

#### Scenario: Inglés en todos los cursos
- **GIVEN** un colegio con los cursos de 1º a 6º de Primaria
- **WHEN** un `ADMIN` crea «Inglés» con código «ING», tipo `CORE`, estado `ACTIVE`, color `blue` y los seis cursos con 3 sesiones
- **THEN** la respuesta es `201` con esos datos, los seis cursos en orden con `sessionsPerWeek: 3` y `Cache-Control: no-store`

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la inserción en `subject_courses`
- **WHEN** se crea una asignatura con dos cursos
- **THEN** la respuesta es un error y no existe ni la asignatura ni ninguna fila de `subject_courses`

#### Scenario: Dos altas con el mismo nombre o código
- **WHEN** se piden a la vez dos altas de «Inglés», y después dos altas de asignaturas distintas con el código «ING»
- **THEN** en cada pareja una responde `201` y la otra `409` con `SUBJECT_ALREADY_EXISTS` o `SUBJECT_CODE_ALREADY_EXISTS`

### Requirement: Reglas de los campos de una asignatura
El nombre MUST ser obligatorio, de 1 a 100 caracteres tras recortar los extremos y colapsar los espacios repetidos, con las mismas reglas de caracteres que el nombre de un curso, y único en el colegio sin distinguir mayúsculas ni espacios sobrantes. El código MUST ser opcional: ausente, `null`, vacío o solo con espacios se guarda `null`; si no, tras recortar MUST tener de 1 a 10 caracteres, solo letras (también acentuadas y ñ), dígitos, `-` y `/`, sin espacios, y ser único en el colegio sin distinguir mayúsculas; se devuelve tal como se escribió. `type` MUST ser `CORE`, `ELECTIVE` o `CUSTOM`; `status`, `ACTIVE` o `INACTIVE`; `color`, una de las 12 claves de `SubjectColor`. La descripción MUST ser opcional, de hasta 500 caracteres tras recortar, y vacía se guarda `null`. Asignaturas de colegios distintos MAY compartir nombre y código. Los errores MUST indicarse en `name` (`REQUIRED`, `INVALID_LENGTH`, `INVALID_CHARACTERS`), `code` (`INVALID_LENGTH`, `INVALID_CHARACTERS`), `type`, `status` y `color` (`REQUIRED` o `INVALID_FORMAT`) y `description` (`INVALID_LENGTH`), en ese orden y seguidos de los de `courses`. Las reglas MUST estar en la tabla compartida `test-fixtures/subject-fields.json`, que recorren el backend y el frontend.

#### Scenario: Asignatura sin código ni descripción
- **WHEN** se crea «Programación», tipo `CUSTOM`, con `code: "  "` y sin descripción
- **THEN** la respuesta es `201` con `code: null` y `description: null`

#### Scenario: Campos inválidos
- **WHEN** se crea una asignatura sin nombre, con un código de 11 caracteres, con el código «IN G», con `type: "OTHER"`, con `color: "magenta"` o con una descripción de 501 caracteres
- **THEN** la respuesta es `400` con `REQUIRED` en `name`, `INVALID_LENGTH` o `INVALID_CHARACTERS` en `code`, `INVALID_FORMAT` en `type` o `color`, o `INVALID_LENGTH` en `description`, y no se crea nada

#### Scenario: Colegio de la identidad
- **WHEN** el cuerpo incluye un `schoolId` de otro colegio, un `id` o un `color` válido junto a propiedades desconocidas
- **THEN** las propiedades desconocidas se ignoran y la asignatura se crea en el colegio de la identidad

### Requirement: Cursos en los que se imparte una asignatura
`courses` MUST tener entre 1 y 100 elementos (`REQUIRED` en `courses` si está vacío o falta, `INVALID_LENGTH` si supera 100). Cada `courseId` MUST ser un UUID (`INVALID_FORMAT`) sin repetirse (`DUPLICATE` en `courses[<i>].courseId` desde el segundo) y del colegio de la identidad: uno de otro colegio o que no existe MUST dar `400` con `NOT_FOUND` en `courses[<i>].courseId` y MUST NOT crear nada. Cada `sessionsPerWeek` MUST ser un entero de 1 a 5 (`REQUIRED`, `INVALID_FORMAT` si no es entero, `OUT_OF_RANGE` si está fuera del intervalo). Los cursos MUST bloquearse con `FOR SHARE` en orden de `id` antes de insertar, de modo que el borrado de un curso o la edición de un calendario a la vez terminen sin error de servidor ni interbloqueo.

#### Scenario: Cursos parciales
- **WHEN** se crea «Programación» con 4º (2 sesiones), 5º (3) y 6º (4)
- **THEN** la respuesta es `201` y `courses` trae los tres cursos con esas sesiones

#### Scenario: Sin cursos o con sesiones fuera de rango
- **WHEN** se crea una asignatura con `courses: []`, o con un curso de 0 sesiones y otro de 6, o con el mismo curso dos veces
- **THEN** la respuesta es `400` con `REQUIRED` en `courses`, `OUT_OF_RANGE` en cada `courses[<i>].sessionsPerWeek` o `DUPLICATE` en el segundo `courses[<i>].courseId`

#### Scenario: Curso de otro colegio o borrado
- **WHEN** se crea una asignatura con un curso de otro colegio o con el de un curso borrado
- **THEN** la respuesta es `400` con `NOT_FOUND` en `courses[<i>].courseId` y no se crea nada

#### Scenario: Alta a la vez que el borrado de su curso
- **WHEN** se crea una asignatura con un curso a la vez que se borra ese curso, varias veces
- **THEN** el alta responde `201` (y la asignatura queda sin ese curso) o `400` con `NOT_FOUND`, el borrado `200`, y nunca hay un `500` ni un interbloqueo

#### Scenario: Alta a la vez que un calendario mueve su curso
- **WHEN** se crea una asignatura con un curso a la vez que se edita un calendario que se lleva ese curso, varias veces
- **THEN** las dos operaciones terminan sin error

### Requirement: Listado de asignaturas con GET /api/subjects
`GET /api/subjects` MUST devolver las asignaturas del colegio de la identidad ordenadas por nombre con `compareText`, cada una con sus cursos en orden natural del nombre del curso, y `Cache-Control: no-store`. Una asignatura cuyos cursos se borraron MUST devolverse con `courses: []`. MUST NOT admitir paginación ni filtros (cualquier parámetro se ignora).

#### Scenario: Listado ordenado
- **GIVEN** las asignaturas «Programación» e «Inglés» y una asignatura de otro colegio
- **WHEN** se piden las asignaturas
- **THEN** la respuesta trae «Inglés» y «Programación» en ese orden, con sus cursos, y no trae la del otro colegio

### Requirement: Acceso a las asignaturas
`GET /api/subjects` MUST exigir sesión (`401` sin ella) y estar abierto a `ADMIN` y `MEMBER`. `POST /api/subjects` MUST exigir sesión y el rol `ADMIN` (`requireRole`): un `MEMBER` MUST recibir `403 FORBIDDEN` sin que se valide el cuerpo ni se cree nada, con el evento `AUTHORIZATION_DENIED`. El colegio MUST salir siempre de la identidad.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** pide el listado y luego intenta crear una asignatura con un cuerpo inválido
- **THEN** recibe `200` y `403 FORBIDDEN`, y no se crea nada

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los dos sin token
- **THEN** la respuesta es `401`

### Requirement: La API de los cursos no cambia
Las respuestas y los cuerpos de `/api/courses` MUST NOT cambiar por esta historia. Borrar un curso MUST borrar sus filas de `subject_courses` sin tocar las asignaturas, y la respuesta del borrado MUST NOT cambiar.

#### Scenario: Curso con asignaturas
- **GIVEN** un curso en el que se imparte una asignatura
- **WHEN** se pide `GET /api/courses` y después se borra el curso
- **THEN** el curso se devuelve con las mismas propiedades que antes de esta historia, el borrado responde como antes y la asignatura sigue existiendo

### Requirement: Eventos de log de las asignaturas
Un alta correcta MUST registrar `SUBJECT_CREATED` con `school_id`, `actor_id`, `subject_id` y `course_count`. Un alta rechazada por el nombre, el código o un curso MUST registrar `SUBJECT_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate_name`, `duplicate_code` o `course_not_found`). Los eventos MUST NOT llevar el nombre, el código ni la descripción de la asignatura, ni el nombre de los cursos.

#### Scenario: Sin nombres en el log
- **WHEN** se crea «Inglés» con código «ING» y después otra vez «Inglés» y otra asignatura con código «ING»
- **THEN** se registran `SUBJECT_CREATED` y dos `SUBJECT_CREATION_REJECTED` con `reason` `duplicate_name` y `duplicate_code`, y el log no contiene «Inglés» ni «ING»

### Requirement: Enlace a las asignaturas en la navegación
La cabecera MUST mostrar «Asignaturas» hacia `/asignaturas` a los dos roles, entre «Calendario» y «Usuarios», con `aria-current="page"` en `/asignaturas` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la cabecera muestra «Cursos», «Profesores», «Alumnos», «Calendario» y «Asignaturas», y no «Usuarios»

### Requirement: Paleta de colores de las asignaturas
El frontend MUST definir, para cada una de las 12 claves de `SubjectColor`, un color de fondo, un color de texto con contraste de al menos 4,5:1 sobre ese fondo y un nombre traducido («Azul», «Añil», «Morado», «Rosa», «Rojo», «Naranja», «Amarillo», «Verde», «Verde azulado», «Cian», «Marrón» y «Gris»). El color propuesto para una asignatura nueva MUST ser el primero de la paleta, en ese orden, que no usa ninguna asignatura del colegio, y el primero de la paleta si ya se usan todos. El color MUST NOT ser la única pista: se muestra siempre con su nombre accesible.

#### Scenario: Contraste
- **WHEN** se calcula el contraste de las 12 parejas de fondo y texto
- **THEN** todas alcanzan al menos 4,5:1

#### Scenario: Color propuesto
- **GIVEN** asignaturas con los colores `blue` e `indigo`
- **WHEN** se abre el formulario de alta
- **THEN** el color seleccionado es `purple` («Morado»)

### Requirement: Página de listado de asignaturas
`/asignaturas` MUST colgar de `AuthenticatedLayout` sin restricción de rol y pedir la lista una sola vez (también con `StrictMode`), con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. Cada asignatura MUST mostrar la muestra de su color con su nombre accesible, su nombre, su código si lo tiene, su tipo («Troncal», «Optativa» o «Propia del centro»), su estado («Activa» o «Inactiva») y el resumen de sus cursos («N cursos · M sesiones a la semana», o «Sin cursos» con un aviso visible en texto). El resumen MUST ser un botón con `aria-expanded` que despliega cada curso con sus sesiones («1º Primaria: 2 sesiones»). MUST ofrecer filtros por tipo y por estado (con «Todos») y una búsqueda por nombre o código con la comparación de la búsqueda de cursos, en el cliente y combinables, y «No hay asignaturas que coincidan» si no queda ninguna. Sin asignaturas MUST mostrar «Todavía no hay asignaturas». El botón «Crear asignatura» MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar las asignaturas». MUST leer del estado de la navegación, con una guarda de tipo, `{ subjectCreated: <texto no vacío> }` y mostrar «Asignatura «X» creada» como texto plano en un `role="status"`.

#### Scenario: Asignatura con cursos
- **GIVEN** «Inglés» de código «ING», troncal, activa, con los seis cursos a 3 sesiones
- **WHEN** se abre `/asignaturas` y se despliegan sus cursos
- **THEN** se ve «ING», «Troncal», «Activa», «6 cursos · 18 sesiones a la semana» y «1º Primaria: 3 sesiones» hasta «6º Primaria: 3 sesiones»

#### Scenario: Filtros y búsqueda
- **GIVEN** «Inglés» (troncal, activa), «Programación» (propia del centro, activa) y «Francés» (optativa, inactiva)
- **WHEN** se filtra por «Troncal», luego por «Inactiva», luego se busca «prog» y por último se combina «Troncal» con «Inactiva»
- **THEN** se ve solo «Inglés», solo «Francés», solo «Programación» y «No hay asignaturas que coincidan»

#### Scenario: Asignatura sin cursos
- **GIVEN** «Inglés» con solo «1º Primaria», que se ha borrado
- **WHEN** se abre `/asignaturas`
- **THEN** «Inglés» se ve con «Sin cursos»

#### Scenario: Según el rol
- **WHEN** un `MEMBER` abre `/asignaturas`
- **THEN** ve las asignaturas, no ve «Crear asignatura» y ve «Solo los administradores pueden crear y modificar las asignaturas»

### Requirement: Página de creación de una asignatura
`/asignaturas/nueva` MUST colgar de `RequireRole` con el rol `ADMIN` (un `MEMBER` va a `/onboarding`). El formulario (`SubjectForm`) MUST tener nombre, código, tipo, estado (preseleccionado en «Activa»), descripción, color (un grupo de radios con la muestra y el nombre de cada color, con el color propuesto seleccionado) y «Cursos en los que se imparte»: una casilla por curso del colegio y, en cada curso marcado, un número de sesiones de 1 a 5 que vale 2 al marcarlo, con la etiqueta accesible «Sesiones a la semana en {curso}». Sin cursos en el colegio MUST mostrar «Primero crea los cursos» con un enlace a `/cursos` y MUST NOT permitir guardar. MUST validar con las mismas reglas que el backend antes de enviar, con el error bajo su campo y el foco en el primero inválido, MUST enviar una sola vez aunque se pulse dos veces y MUST mostrar los errores del servidor en sus campos. Con el `201` MUST navegar a `/asignaturas` con `replace` y `{ subjectCreated: nombre }`. Un `409` MUST marcar el nombre o el código, según el error, con el foco; un `400` con `courses[<i>].courseId` `NOT_FOUND` MUST volver a pedir los cursos conservando lo escrito.

#### Scenario: Formulario de partida
- **WHEN** un `ADMIN` abre `/asignaturas/nueva` y marca «1º Primaria»
- **THEN** el estado es «Activa», hay un color propuesto seleccionado y las sesiones de «1º Primaria» valen 2

#### Scenario: Validación antes de enviar
- **WHEN** se intenta guardar sin nombre o sin ningún curso marcado
- **THEN** el error sale bajo su campo («Marca al menos un curso» en los cursos), el foco va al primero y no se envía nada

#### Scenario: Colegio sin cursos
- **GIVEN** un colegio sin cursos
- **WHEN** se abre `/asignaturas/nueva`
- **THEN** se ve «Primero crea los cursos» con un enlace a «Cursos» y no se puede guardar

#### Scenario: Código repetido
- **GIVEN** «Inglés» con código «ING»
- **WHEN** se guarda «Inglés 2» con código «ing»
- **THEN** el error sale bajo el código, con el foco, y se conserva lo escrito

### Requirement: Accesibilidad, responsive e i18n de las asignaturas
Las páginas de asignaturas MUST cumplir WCAG 2.1 AA: cada número de sesiones con su etiqueta accesible, los errores ligados por `aria-describedby`, el desplegable de cursos con `aria-expanded`, el color anunciado por su nombre, sin violaciones de `axe` (listado, formulario con y sin errores) y sin desplazamiento horizontal a 360 px. Los textos, los tipos, los estados y los nombres de los colores MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado y el formulario con errores
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

### Requirement: Asignaturas de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Inglés» con todos los cursos y «Programación» con cursos parciales y sin código, y verlas en el listado; los filtros y la búsqueda; el nombre y el código repetidos; borrar un curso y ver la asignatura con «Sin cursos»; un `MEMBER` que ve las asignaturas sin «Crear asignatura» y no puede abrir el alta; y el formulario a 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `subjects.cy.ts`

