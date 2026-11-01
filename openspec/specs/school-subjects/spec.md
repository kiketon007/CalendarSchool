# school-subjects Specification

## Purpose
TBD - created by archiving change us-subject-asignaturas. Update Purpose after archive.
## Requirements
### Requirement: Contrato de las asignaturas en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/subjects` (`createSubject`), `GET /api/subjects` (`listSubjects`), `GET /api/subjects/{id}` (`getSubject`), `PUT /api/subjects/{id}` (`updateSubject`) y `DELETE /api/subjects/{id}` (`deleteSubject`), con seguridad Bearer, y los esquemas `SubjectType` (`CORE`, `ELECTIVE`, `CUSTOM`), `SubjectStatus` (`ACTIVE`, `INACTIVE`), `SubjectColor` (`blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`), `CreateSubjectRequest` (`name`, `type`, `status`, `color` y `courses` obligatorios; `code` y `description` opcionales y admitiendo `null`; `courses` como lista de `{ courseId, sessionsPerWeek }`; sin más propiedades), `UpdateSubjectRequest` (la misma forma), `SubjectCourse` (`id`, `name`, `sessionsPerWeek` y `constraintCount`, el número de reglas de reparto de la asignatura en ese curso, entero no negativo; solo en las respuestas, nunca en las peticiones), `Subject` (`id`, `name`, `code` como texto o `null`, `type`, `status`, `description` como texto o `null`, `color`, `courses` como lista de `SubjectCourse` y `createdAt`) y `DeleteSubjectResponse` (`{ deleted: { id } }`). `POST` MUST declarar `201` (`{ subject: Subject }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/subjects`, `200` (`{ subjects: Subject[] }`), `401`, `500` y `503`; `GET /api/subjects/{id}`, `200` (`{ subject: Subject }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ subject: Subject }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`; `DELETE`, sin cuerpo, `200` (`DeleteSubjectResponse`), `401`, `403`, `404`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `SubjectNotFound` en `components.responses`. Las descripciones de `POST`, `PUT` y `DELETE` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createSubject`, `listSubjects`, `getSubject`, `updateSubject` y `deleteSubject`
- **THEN** las cinco exigen Bearer y declaran las respuestas indicadas, `createSubject`, `updateSubject` y `deleteSubject` declaran `403`, y `getSubject`, `updateSubject` y `deleteSubject` declaran `404` con `SubjectNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los esquemas `CreateSubjectRequest`, `UpdateSubjectRequest`, `Subject`, `SubjectCourse` (con `constraintCount`), `SubjectColor` y `DeleteSubjectResponse`

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
`GET /api/subjects` y `GET /api/subjects/{id}` MUST exigir sesión (`401` sin ella) y estar abiertos a `ADMIN` y `MEMBER`. `POST /api/subjects`, `PUT /api/subjects/{id}` y `DELETE /api/subjects/{id}` MUST exigir sesión y el rol `ADMIN` (`requireRole`): un `MEMBER` MUST recibir `403 FORBIDDEN` antes de que se lea el `id` o se valide el cuerpo, sin crear, cambiar ni borrar nada (también con un `id` inexistente o que no es UUID), con el evento `AUTHORIZATION_DENIED`. El colegio MUST salir siempre de la identidad.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** pide el listado, pide una asignatura y luego intenta crear una con un cuerpo inválido, editar otra y borrar otra
- **THEN** recibe `200`, `200`, `403 FORBIDDEN`, `403 FORBIDDEN` y `403 FORBIDDEN`, y no se crea, cambia ni borra nada

#### Scenario: Miembro con un id que no existe
- **GIVEN** un usuario `MEMBER`
- **WHEN** envía `PUT` o `DELETE /api/subjects/{id}` con un `id` inexistente o que no es UUID
- **THEN** recibe `403 FORBIDDEN`, no `404` ni `400`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los cinco sin token
- **THEN** la respuesta es `401`

### Requirement: La API de los cursos no cambia
Las respuestas y los cuerpos de `/api/courses` MUST NOT cambiar por esta historia. Borrar un curso MUST borrar sus filas de `subject_courses` sin tocar las asignaturas, y la respuesta del borrado MUST NOT cambiar.

#### Scenario: Curso con asignaturas
- **GIVEN** un curso en el que se imparte una asignatura
- **WHEN** se pide `GET /api/courses` y después se borra el curso
- **THEN** el curso se devuelve con las mismas propiedades que antes de esta historia, el borrado responde como antes y la asignatura sigue existiendo

### Requirement: Eventos de log de las asignaturas
Un alta correcta MUST registrar `SUBJECT_CREATED` con `school_id`, `actor_id`, `subject_id` y `course_count`. Un alta rechazada por el nombre, el código o un curso MUST registrar `SUBJECT_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate_name`, `duplicate_code` o `course_not_found`). Una edición correcta MUST registrar `SUBJECT_UPDATED` con `school_id`, `actor_id`, `subject_id`, `changed_fields` (lista con `name`, `code`, `type`, `status`, `description`, `color` y `courses` según lo que cambió; vacía si nada cambió), `courses_added`, `courses_removed` y `courses_changed` (cursos que siguen con otras sesiones). Una edición rechazada MUST registrar `SUBJECT_UPDATE_REJECTED` con `school_id`, `actor_id`, `subject_id` y `reason` (`not_found`, `duplicate_name`, `duplicate_code` o `course_not_found`). Un borrado correcto MUST registrar `SUBJECT_DELETED` con `school_id`, `actor_id` y `subject_id`; un `404` al borrar MUST NOT registrar nada. Un `400` de validación MUST NOT registrar ningún evento. Los eventos MUST NOT llevar el nombre, el código ni la descripción de la asignatura, ni el nombre de los cursos.

#### Scenario: Sin nombres en el log
- **WHEN** se crea «Inglés» con código «ING» y después otra vez «Inglés» y otra asignatura con código «ING»
- **THEN** se registran `SUBJECT_CREATED` y dos `SUBJECT_CREATION_REJECTED` con `reason` `duplicate_name` y `duplicate_code`, y el log no contiene «Inglés» ni «ING»

#### Scenario: Edición en el log
- **GIVEN** «Inglés» activa con 1º (3 sesiones) y 2º (3 sesiones)
- **WHEN** se inactiva, 1º pasa a 2 sesiones, se quita 2º y se añade 3º
- **THEN** se registra `SUBJECT_UPDATED` con `changed_fields: ["status", "courses"]`, `courses_added: 1`, `courses_removed: 1` y `courses_changed: 1`, y el log no contiene ningún nombre ni código

#### Scenario: Edición rechazada
- **WHEN** se edita una asignatura con el nombre de otra, con el código de otra y con un curso borrado
- **THEN** se registran tres `SUBJECT_UPDATE_REJECTED` con `reason` `duplicate_name`, `duplicate_code` y `course_not_found`

#### Scenario: Borrado en el log
- **GIVEN** «Inglés» con código «ING» y dos cursos
- **WHEN** se borra y después se intenta borrar otra vez
- **THEN** se registra un único `SUBJECT_DELETED` con los identificadores, el segundo intento no deja evento y el log no contiene «Inglés» ni «ING»

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
`/asignaturas` MUST colgar de `AuthenticatedLayout` sin restricción de rol y pedir la lista una sola vez (también con `StrictMode`), con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. Cada asignatura MUST mostrar la muestra de su color con su nombre accesible, su nombre, su código si lo tiene, su tipo («Troncal», «Optativa» o «Propia del centro»), su estado («Activa» o «Inactiva») y el resumen de sus cursos («N cursos · M sesiones a la semana», o «Sin cursos» con un aviso visible en texto). El resumen MUST ser un botón con `aria-expanded` que despliega cada curso con sus sesiones («1º Primaria: 2 sesiones»). MUST ofrecer filtros por tipo y por estado (con «Todos») y una búsqueda por nombre o código con la comparación de la búsqueda de cursos, en el cliente y combinables, y «No hay asignaturas que coincidan» si no queda ninguna. Sin asignaturas MUST mostrar «Todavía no hay asignaturas». El botón «Crear asignatura» y, en cada asignatura, el enlace «Editar» (`aria-label` «Editar {nombre}», hacia `/asignaturas/{id}/editar`) y el botón «Borrar» (`outline-danger`, `aria-label` «Borrar {nombre}») MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar las asignaturas». MUST leer del estado de la navegación, con una guarda de tipo, `{ subjectCreated: <texto no vacío> }` o `{ subjectUpdated: <texto no vacío> }` y mostrar «Asignatura «X» creada» o «Asignatura «X» actualizada» como texto plano en un `role="status"`.

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
- **THEN** ve las asignaturas, no ve «Crear asignatura», ningún «Editar» ni ningún «Borrar» y ve «Solo los administradores pueden crear y modificar las asignaturas»

#### Scenario: Enlace de edición y botón de borrado
- **WHEN** un `ADMIN` abre `/asignaturas` con «Inglés»
- **THEN** su tarjeta tiene el enlace «Editar Inglés» hacia `/asignaturas/<id>/editar` y el botón «Borrar Inglés»

#### Scenario: Aviso de edición
- **GIVEN** la navegación llega con `{ subjectUpdated: "Inglés avanzado" }`
- **WHEN** se pinta `/asignaturas`
- **THEN** se muestra «Asignatura «Inglés avanzado» actualizada» en un `role="status"`; con cualquier otra forma del estado no se muestra nada

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
Las páginas de asignaturas MUST cumplir WCAG 2.1 AA: cada número de sesiones con su etiqueta accesible, los errores ligados por `aria-describedby`, el desplegable de cursos con `aria-expanded`, el color anunciado por su nombre, el enlace «Editar» y el botón «Borrar» con su nombre accesible, el aviso de asignatura sin cursos de la edición ligado por `aria-describedby`, el diálogo de borrado con su título como nombre accesible, sin violaciones de `axe` (listado, formulario de alta y de edición, con y sin errores, y diálogo de borrado) y sin desplazamiento horizontal a 360 px. Los textos, los tipos, los estados y los nombres de los colores MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado, el formulario con errores, el formulario de edición y el diálogo de borrado abierto
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

### Requirement: Asignaturas de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Inglés» con todos los cursos y «Programación» con cursos parciales y sin código, y verlas en el listado; los filtros y la búsqueda; el nombre y el código repetidos; borrar un curso y ver la asignatura con «Sin cursos»; un `MEMBER` que ve las asignaturas sin «Crear asignatura», «Editar» ni «Borrar» y no puede abrir el alta ni la edición; el formulario a 360 px sin desplazamiento horizontal; la edición («Guardar» deshabilitado sin cambios, renombrar y ver el aviso, inactivar y verla con el filtro «Inactiva», cambiar las sesiones de un curso, añadir uno y quitar otro, el nombre y el código de otra asignatura, la asignatura sin cursos que exige marcar uno, la asignatura que ya no existe y la edición a 360 px); y el borrado: cancelar, borrar una asignatura con cursos (el aviso, el foco en el título y que los cursos siguen existiendo), que el nombre y el código quedan libres, borrar una asignatura que se está editando en otra pestaña y abrir después su edición, borrar la última y el diálogo a 360 px.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `subjects.cy.ts`, también los de edición y de borrado

### Requirement: Leer una asignatura con GET /api/subjects/{id}
`GET /api/subjects/{id}` MUST devolver `200` con `{ subject: Subject }` (sus cursos en orden natural del nombre del curso) y `Cache-Control: no-store` si la asignatura es del colegio de la identidad. Un `id` que no es UUID, una asignatura inexistente o de otro colegio MUST responder `404 NOT_FOUND`, sin distinguir el caso.

#### Scenario: Asignatura del colegio
- **GIVEN** «Inglés» con código «ING» y los cursos «2º Primaria» y «1º Primaria»
- **WHEN** se pide por su `id`
- **THEN** la respuesta es `200` con sus datos, `courses` con «1º Primaria» y «2º Primaria» en ese orden y `no-store`

#### Scenario: Asignatura que no está
- **WHEN** se pide un `id` que no es UUID, uno inexistente o el de una asignatura de otro colegio
- **THEN** la respuesta es `404` con `error.code` igual a `NOT_FOUND` en los tres casos

### Requirement: Editar una asignatura con PUT /api/subjects/{id}
`PUT /api/subjects/{id}` MUST recibir el estado final de la asignatura con la forma y las reglas del alta (nombre, código, tipo, estado, descripción, color y cursos, validados por el mismo parser y en el mismo orden de errores), y MUST responder `200` con `{ subject: Subject }` tal como queda guardada (sus cursos en orden natural) y `Cache-Control: no-store`. El orden de validación MUST ser: rol, `id` (no UUID es `404`), cuerpo (`400`), existencia de la asignatura (`404`), cursos (`400`), y nombre y código (`409`). Pasar al nombre de otra asignatura del colegio MUST responder `409 SUBJECT_ALREADY_EXISTS` y al código de otra, `409 SUBJECT_CODE_ALREADY_EXISTS`; cambiar solo mayúsculas o espacios del propio nombre o del propio código MUST ser válido. Un código vacío MUST dejarlo en `null`. El estado MUST poder pasar de `ACTIVE` a `INACTIVE` y al revés sin más efectos. Un `PUT` idéntico a lo guardado MUST responder `200` sin error. Gana el último guardado: no hay control de versión.

#### Scenario: Renombrar, recodificar e inactivar
- **GIVEN** «Inglés» con código «ING», activa y color `blue`
- **WHEN** se envía el nombre «Inglés avanzado», el código «ing», el estado `INACTIVE` y el color `green`
- **THEN** la respuesta es `200` con esos valores, y al pedirla de nuevo devuelve lo mismo

#### Scenario: Quitar el código
- **GIVEN** «Inglés» con código «ING»
- **WHEN** se envía con `code: ""`
- **THEN** la respuesta es `200` con `code: null`, y otra asignatura puede usar después el código «ING»

#### Scenario: Nombre o código de otra asignatura
- **GIVEN** «Inglés» («ING») y «Programación» («PRG») en el mismo colegio
- **WHEN** se renombra «Inglés» a «programación », y después se le pone el código «prg»
- **THEN** las respuestas son `409 SUBJECT_ALREADY_EXISTS` y `409 SUBJECT_CODE_ALREADY_EXISTS`, e «Inglés» no cambia

#### Scenario: Cuerpo inválido
- **WHEN** se envía un nombre vacío, un código con espacios, `color: "magenta"`, `courses: []` o unas sesiones de 6
- **THEN** la respuesta es `400 VALIDATION_ERROR` con los mismos códigos y campos que en el alta, y la asignatura no cambia

#### Scenario: Asignatura que no está
- **WHEN** se envía un cuerpo válido a un `id` que no es UUID, inexistente o de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y no cambia ninguna asignatura

#### Scenario: Ediciones simultáneas
- **WHEN** dos `PUT` de la misma asignatura con cursos y sesiones distintos llegan a la vez, varias rondas
- **THEN** los dos responden `200` y la asignatura queda exactamente con los campos y los cursos de uno de ellos, nunca una mezcla

#### Scenario: Dos ediciones hacia el mismo nombre o código
- **WHEN** dos asignaturas distintas se editan a la vez para llamarse igual, y después para tener el mismo código
- **THEN** en cada pareja una responde `200` y la otra `409` con `SUBJECT_ALREADY_EXISTS` o `SUBJECT_CODE_ALREADY_EXISTS`

### Requirement: Cursos al editar una asignatura
Al editar, las filas de `subject_courses` de la asignatura MUST quedar como dice `courses` **aplicando solo las diferencias**: las de los cursos que no están se borran (y sus reglas de reparto caen por la cascada), las de los cursos que siguen con otras sesiones se actualizan, y las de los cursos nuevos se insertan. Las de los cursos que siguen con las mismas sesiones MUST NOT escribirse: conservan su `created_at` y sus reglas. `courses` MUST seguir las reglas del alta (entre 1 y 100, sin repetidos, sesiones de 1 a 5), así que una asignatura que se quedó sin cursos no se puede guardar sin marcar alguno. Un curso de otro colegio o inexistente MUST responder `400` con `NOT_FOUND` en `courses[<i>].courseId` sin cambiar nada. La edición MUST hacerse en una transacción que bloquea primero la fila de la asignatura (`FOR UPDATE`, filtrada por colegio) y después, con `FOR SHARE` y en orden de `id`, la unión de los cursos pedidos y de los que tiene hoy, antes de tocar `subject_courses`; si algo falla, la asignatura MUST conservar todos sus campos y sus cursos.

#### Scenario: Cambiar sesiones, añadir y quitar
- **GIVEN** «Inglés» con 1º (3 sesiones) y 2º (3 sesiones)
- **WHEN** se edita con 1º (2 sesiones) y 3º (2 sesiones)
- **THEN** «Inglés» tiene 1º con 2 sesiones y 3º con 2 sesiones, y ya no tiene 2º

#### Scenario: Asignatura sin cursos
- **GIVEN** «Inglés» sin cursos porque se borró el único que tenía
- **WHEN** se edita solo el nombre con `courses: []`, y después con «2º Primaria»
- **THEN** la primera respuesta es `400` con `REQUIRED` en `courses` y la segunda `200` con «2º Primaria»

#### Scenario: Curso que ya no existe
- **WHEN** se edita con un curso borrado y otro de otro colegio
- **THEN** la respuesta es `400` con `NOT_FOUND` en sus `courses[<i>].courseId` y nada cambia

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la inserción en `subject_courses`
- **WHEN** se edita «Inglés» cambiando el nombre, el color y los cursos
- **THEN** la petición falla y «Inglés» conserva su nombre, su color y sus cursos

#### Scenario: Edición contra borrado de un curso, un alta y un calendario
- **WHEN** se edita una asignatura a la vez que se borra uno de sus cursos (pedido o actual), a la vez que se crea otra asignatura con cursos en común, a la vez que se edita otra asignatura con cursos en común, o a la vez que se edita un calendario que se lleva uno de sus cursos, varias rondas
- **THEN** la edición responde `200` o `400` y el resto termina sin error, nunca con `500` ni interbloqueo

#### Scenario: Guardar sin tocar los cursos conserva las reglas
- **GIVEN** «Inglés» con 1º (4 sesiones), un máximo de 2 al día y bloques de 2 en 1º
- **WHEN** se edita «Inglés» cambiando solo su nombre, y después cambiando sus sesiones en 1º a 5
- **THEN** las dos veces conserva sus 2 reglas en 1º y la fila de 1º conserva su `created_at`

#### Scenario: Quitar un curso borra sus reglas
- **GIVEN** «Inglés» con 2 reglas en 1º y 1 en 2º
- **WHEN** se edita quitando 1º
- **THEN** no queda ninguna regla de «Inglés» en 1º y sigue la de 2º

### Requirement: Página de edición de una asignatura
`/asignaturas/:id/editar` MUST colgar de `RequireRole` con el rol `ADMIN` (un `MEMBER` va a `/onboarding`). MUST pedir la asignatura y los cursos una sola vez cada uno (también con `StrictMode`), MUST NOT montar el formulario hasta tener las dos respuestas, y MUST mostrar un `role="status"` mientras carga, «Esta asignatura no existe o ya no está disponible» con un enlace a «Asignaturas» ante un `404` (al cargar y al guardar), un `role="alert"` con «Reintentar» si falla la carga de la asignatura, o el formulario. `SubjectForm` MUST recibir los valores iniciales (todos los campos de la asignatura, su color seleccionado y sus cursos marcados con sus sesiones, leídos solo al montar) y `requireChanges`: «Guardar» MUST estar deshabilitado mientras lo que se enviaría (nombre limpio, código y descripción recortados con vacío igual a `null`, tipo, estado, color y el conjunto de cursos con sus sesiones) sea igual a lo cargado, también tras deshacer un cambio. Al volver a marcar un curso que la asignatura ya tenía, sus sesiones MUST ser las originales; un curso nuevo MUST empezar en 2. Si la asignatura no tiene cursos, MUST mostrar bajo los cursos «Esta asignatura no tiene cursos: marca al menos uno para guardarla», ligado por `aria-describedby`. La validación, el foco, la guarda contra el doble envío y los errores del servidor MUST funcionar como en el alta. Con el `200` MUST navegar a `/asignaturas` con `replace` y `{ subjectUpdated: nombre del servidor }`; un `409` MUST marcar el nombre o el código, según el error, con el foco; un `400` con `courses[<i>].courseId` `NOT_FOUND` MUST volver a pedir los cursos conservando lo escrito; un `403` MUST mostrar «Solo los administradores pueden modificar asignaturas»; cualquier otro fallo MUST mostrar un aviso general conservando lo escrito. «Cancelar» MUST volver a `/asignaturas`.

#### Scenario: Precarga sin cambios
- **GIVEN** «Inglés» con código «ING», color `blue` y 1º (3 sesiones)
- **WHEN** un `ADMIN` abre su edición
- **THEN** ve todos sus campos, «Azul» seleccionado y «1º Primaria» marcado con 3 sesiones, y «Guardar» está deshabilitado

#### Scenario: Solo con cambios reales
- **WHEN** añade un espacio al final del nombre, borra y vuelve a escribir la descripción, o cambia unas sesiones y las devuelve a su valor
- **THEN** «Guardar» sigue deshabilitado; al cambiar de verdad las sesiones, se habilita

#### Scenario: Volver a marcar un curso
- **GIVEN** «Inglés» con «1º Primaria» a 3 sesiones
- **WHEN** desmarca «1º Primaria» y lo vuelve a marcar, y marca «2º Primaria», que no tenía
- **THEN** «1º Primaria» vuelve a tener 3 sesiones, «2º Primaria» tiene 2, y si después desmarca «2º Primaria» «Guardar» vuelve a estar deshabilitado

#### Scenario: Guardar
- **WHEN** renombra «Inglés» a «Inglés avanzado» y pulsa «Guardar» dos veces
- **THEN** se envía un único `PUT` y vuelve a `/asignaturas` con «Asignatura «Inglés avanzado» actualizada»

#### Scenario: Asignatura sin cursos
- **GIVEN** «Inglés» sin cursos
- **WHEN** abre su edición, cambia el nombre y guarda
- **THEN** ve «Esta asignatura no tiene cursos: marca al menos uno para guardarla» al cargar, y al guardar «Marca al menos un curso» con el foco y no se envía nada

#### Scenario: Asignatura que ya no existe
- **WHEN** abre la edición de una asignatura borrada, o guarda y el servidor responde `404`
- **THEN** ve «Esta asignatura no existe o ya no está disponible» con un enlace a «Asignaturas»

#### Scenario: Nombre o código repetido
- **WHEN** guarda con el nombre o con el código de otra asignatura
- **THEN** el error sale bajo el nombre o bajo el código, con el foco, y se conserva lo escrito

### Requirement: Borrar una asignatura con DELETE /api/subjects/{id}
`DELETE /api/subjects/{id}` MUST borrar de verdad, en una única transacción, la asignatura del colegio de la identidad y, por la cascada de la base de datos, sus filas de `subject_courses`, sin tocar los cursos. MUST responder `200` con `{ deleted: { id } }` y `Cache-Control: no-store`. El orden MUST ser: rol, `id` (no UUID es `404`), existencia de la asignatura (`404`). Un `id` que no es UUID, una asignatura inexistente, de otro colegio o ya borrada MUST responder `404 NOT_FOUND` sin borrar nada. La transacción MUST bloquear solo la fila de la asignatura (`FOR UPDATE`, filtrada por colegio); si algo falla a mitad, MUST NOT borrarse nada. Tras el borrado, el nombre y el código de la asignatura MUST quedar libres para otra del mismo colegio.

#### Scenario: Borrar una asignatura con cursos
- **GIVEN** «Inglés» con código «ING» y los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se borra
- **THEN** la respuesta es `200` con `{ deleted: { id } }`, la asignatura y sus filas de `subject_courses` ya no existen, los dos cursos siguen existiendo, el listado ya no la trae y `GET /api/subjects/{id}` da `404`

#### Scenario: Borrar una asignatura sin cursos
- **GIVEN** una asignatura cuyos cursos se borraron
- **WHEN** se borra
- **THEN** la respuesta es `200` con `{ deleted: { id } }`

#### Scenario: El nombre y el código quedan libres
- **WHEN** se borra «Inglés» con código «ING» y después se crea otra «Inglés» con código «ING»
- **THEN** el alta responde `201`

#### Scenario: Asignatura que no está
- **WHEN** se borra un `id` que no es UUID, uno inexistente, el de otro colegio o uno ya borrado
- **THEN** la respuesta es `404 NOT_FOUND` y no se borra nada

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar el borrado de las filas de `subject_courses`
- **WHEN** se borra «Inglés»
- **THEN** la petición falla y la asignatura y sus filas de `subject_courses` siguen como estaban

#### Scenario: Borrados y ediciones simultáneos
- **WHEN** dos borrados de la misma asignatura llegan a la vez, o un borrado y la edición de la misma asignatura, o un borrado y el borrado de uno de sus cursos, varias rondas
- **THEN** de dos borrados uno responde `200` y otro `404`; la edición de la misma responde `200` o `404`; el borrado de un curso responde `200` y la asignatura, si seguía existiendo, queda sin ese curso; nunca hay `500` ni interbloqueo

### Requirement: Diálogo para borrar una asignatura
`DeleteSubjectModal` MUST estar siempre montado y gobernado por `subject` (`null` si está cerrado; conserva la última mientras se cierra), con `onDeleted`, `onGone`, `onCancel` y `onExited`, y MUST NOT pedir nada al abrirse: usa el nombre y los cursos de la tarjeta. MUST titularse «¿Borrar la asignatura «{nombre}»?» (su nombre accesible), decir «Se imparte en: {cursos}» o «No se imparte en ningún curso», «Si solo ha dejado de impartirse, puedes inactivarla desde Editar» (solo un texto, sin botón) y «Esta acción no se puede deshacer», abrir con el foco en «Cancelar» y no tener «X» de cabecera. MUST enviar una sola petición aunque se pulse dos veces «Borrar asignatura», mostrar «Borrando…» con los botones deshabilitados y no cerrarse con Escape ni con un clic fuera mientras borra. Un `404` MUST llamar a `onGone`; cualquier otro fallo MUST quedarse en el diálogo con un `role="alert"` y permitir reintentar.

#### Scenario: Con cursos
- **GIVEN** «Inglés» con «1º Primaria» y «2º Primaria»
- **WHEN** se abre su diálogo
- **THEN** dice «¿Borrar la asignatura «Inglés»?», «Se imparte en: 1º Primaria, 2º Primaria», el recordatorio de inactivar y «Esta acción no se puede deshacer», con el foco en «Cancelar» y sin ninguna petición

#### Scenario: Sin cursos
- **WHEN** se abre el diálogo de una asignatura sin cursos
- **THEN** dice «No se imparte en ningún curso»

#### Scenario: Cancelar
- **WHEN** se pulsa «Cancelar» o Escape
- **THEN** se cierra sin enviar nada

#### Scenario: Una sola petición
- **WHEN** se pulsa «Borrar asignatura» dos veces seguidas
- **THEN** se envía un único `DELETE` y, mientras tanto, se lee «Borrando…» con los botones deshabilitados

#### Scenario: Fallo
- **WHEN** el servidor responde un error que no es `404`
- **THEN** el diálogo sigue abierto con un aviso y «Borrar asignatura» se puede volver a pulsar

### Requirement: El listado tras borrar una asignatura
Con `onDeleted`, `SubjectsPage` MUST quitar la asignatura de la lista cargada sin volver a pedirla, conservar los filtros y la búsqueda, mostrar «Asignatura «X» eliminada» en un `role="status"` propio, con prioridad sobre el aviso de llegada, y mover el foco al `h1` un turno después de `onExited`. Si era la última del colegio, MUST verse el estado vacío; si los filtros la dejaban como la única visible, «No hay asignaturas que coincidan». Con `onGone` MUST avisar «Esa asignatura ya no existe» y volver a pedir la lista. Al cancelar, el foco MUST volver al botón «Borrar» de esa tarjeta.

#### Scenario: Borrado
- **GIVEN** «Inglés» y «Programación»
- **WHEN** se confirma el borrado de «Inglés»
- **THEN** solo queda «Programación», se lee «Asignatura «Inglés» eliminada», la lista no se vuelve a pedir y el foco está en el título

#### Scenario: Se conservan los filtros
- **GIVEN** el filtro «Inactiva» puesto y «Francés», la única inactiva, en pantalla
- **WHEN** se borra «Francés»
- **THEN** se ve «No hay asignaturas que coincidan» y el filtro sigue puesto

#### Scenario: La última
- **WHEN** se borra la única asignatura
- **THEN** se ve «Todavía no hay asignaturas»

#### Scenario: Ya no existe
- **WHEN** al confirmar el servidor responde `404`
- **THEN** el diálogo se cierra, se lee «Esa asignatura ya no existe» y la lista se vuelve a pedir

#### Scenario: La edición de una asignatura borrada
- **GIVEN** una asignatura que otra persona borró
- **WHEN** se abre `/asignaturas/<id>/editar`
- **THEN** se ve «Esta asignatura no existe o ya no está disponible» con un enlace a «Asignaturas»

### Requirement: Reglas de reparto en las páginas de asignaturas
Las páginas de asignaturas MUST mostrar las reglas de reparto en tres sitios:
- **Tarjeta de `/asignaturas`:** el desplegable de cursos MUST decir «{curso}: {n} sesiones · {m} reglas», con plural y sin el sufijo si `constraintCount` es 0.
- **Edición de la asignatura:** al desmarcar un curso cuyo `constraintCount` cargado es mayor que 0, MUST verse bajo ese curso «Al guardar se borrarán sus {m} reglas en {curso}», ligado a su casilla por `aria-describedby`. El aviso MUST desaparecer al volver a marcarlo.
- **`DeleteSubjectModal`:** MUST decir «Se borrarán también {m} reglas», con la suma de los `constraintCount` de sus cursos de la tarjeta, solo si es mayor que 0, sin pedir nada al abrirse.

Los textos MUST estar en `es.json` y `en.json` y la página MUST NOT tener violaciones de `axe` con los avisos.

#### Scenario: Tarjeta con reglas
- **GIVEN** «Inglés» con 4 sesiones y 1 regla en 1º, y 3 sesiones sin reglas en 2º
- **WHEN** se despliegan sus cursos en `/asignaturas`
- **THEN** se ve «1º Primaria: 4 sesiones · 1 regla» y «2º Primaria: 3 sesiones»

#### Scenario: Aviso al desmarcar un curso
- **GIVEN** «Inglés» con 2 reglas en 1º
- **WHEN** el `ADMIN` desmarca 1º en su edición
- **THEN** ve «Al guardar se borrarán sus 2 reglas en 1º Primaria» ligado a la casilla, y al volver a marcarlo el aviso desaparece

#### Scenario: Diálogo de borrado con reglas
- **GIVEN** «Inglés» con 2 reglas en 1º y 1 en 2º
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Se borrarán también 3 reglas»; para una asignatura sin reglas no aparece esa frase

### Requirement: Reglas en las asignaturas de extremo a extremo
`cypress/e2e/subjects.cy.ts` MUST recorrer, con reglas creadas desde la carga del curso:
- Ver «· N reglas» en la tarjeta.
- Desmarcar el curso en la edición, con su aviso, y guardar: las reglas desaparecen.
- Ver «Se borrarán también N reglas» en el diálogo de borrado.

#### Scenario: Recorrido con reglas
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/subjects.cy.ts`
- **THEN** todos los tests pasan

### Requirement: Asignaciones de profesores de una asignatura en cada curso
Cada `SubjectCourse` de las respuestas de asignaturas (`GET /api/subjects`, `GET /api/subjects/{id}`, `POST` y `PUT`) MUST llevar `assignmentCount`, un entero ≥ 0 y requerido: el número de asignaciones de profesores de la asignatura en las clases de ese curso. Solo va en las respuestas; si llega en una petición, MUST ignorarse como cualquier propiedad desconocida. En el `PUT`, el recuento MUST ser el del estado final. El recuento MUST salir en la misma consulta que lee los cursos de la asignatura.

`subjectsService` del frontend MUST exigirlo: cualquier otra forma es `unavailable`.

#### Scenario: Recuento por curso
- **GIVEN** Inglés en 1º Primaria con profesor en A y B, y en 2º Primaria sin profesores
- **WHEN** se pide `GET /api/subjects/<id>`
- **THEN** 1º Primaria lleva `assignmentCount: 2` y 2º Primaria `0`

#### Scenario: Recuento tras quitar un curso
- **GIVEN** Inglés con 2 asignaciones en 1º Primaria
- **WHEN** un `PUT` quita 1º Primaria de sus cursos
- **THEN** la respuesta no lleva 1º Primaria y no queda ninguna asignación de Inglés en 1º

#### Scenario: Asignatura nueva
- **WHEN** se crea una asignatura con dos cursos
- **THEN** los dos llevan `assignmentCount: 0`

### Requirement: Avisos de asignaciones en las páginas de asignaturas
- **Edición de la asignatura:** al desmarcar un curso con reglas o con asignaciones cargadas, el aviso bajo ese curso MUST decir lo que se borra en una sola frase con «en {curso}», con las mismas piezas, plurales y `Intl.ListFormat` que el aviso de la carga, ligado a su casilla por `aria-describedby`, y desaparecer al volver a marcarlo. `SubjectForm` MUST recibir los recuentos de asignaciones junto a los de reglas.
- **`DeleteSubjectModal`:** MUST decir «Se quitarán también {n} asignaciones de profesores.», con plural y la suma de los `assignmentCount` de sus cursos de la tarjeta, solo si es mayor que 0, tras el párrafo de las reglas y sin pedir nada al abrirse.

Sin asignaciones, los avisos de reglas MUST NOT cambiar. Los textos MUST estar en `es.json` y `en.json` y no MUST haber violaciones de `axe` con los avisos.

#### Scenario: Desmarcar un curso con asignaciones
- **GIVEN** Inglés con 1 regla y 2 asignaciones en 1º Primaria
- **WHEN** el `ADMIN` desmarca 1º Primaria en su edición
- **THEN** ve «Al guardar se borrarán su regla y sus 2 asignaciones de profesores en 1º Primaria» ligado a la casilla, y al volver a marcarlo desaparece

#### Scenario: Desmarcar un curso solo con asignaciones
- **GIVEN** Música sin reglas y con 3 asignaciones en 2º Primaria
- **WHEN** el `ADMIN` desmarca 2º Primaria
- **THEN** ve «Al guardar se borrarán sus 3 asignaciones de profesores en 2º Primaria»

#### Scenario: Diálogo de borrado con asignaciones
- **GIVEN** Inglés con 2 asignaciones en 1º y 1 en 2º, y 3 reglas
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Se borrarán también 3 reglas de reparto.» y «Se quitarán también 3 asignaciones de profesores.»; sin asignaciones, la segunda frase no aparece

### Requirement: Asignaciones en el evento de borrado de una asignatura
`SUBJECT_DELETED` MUST llevar además `assignment_count`, el número de asignaciones de profesores de la asignatura contado dentro de la transacción del borrado, antes de borrar. El evento MUST NOT llevar nombres. La respuesta de `DELETE /api/subjects/{id}` MUST NOT cambiar. El puerto `SubjectRepository.delete` MUST devolver el recuento, o `null` si la asignatura no existe en el colegio.

#### Scenario: Evento con asignaciones
- **GIVEN** Inglés con 3 asignaciones de profesores
- **WHEN** se borra
- **THEN** el log tiene `SUBJECT_DELETED` con `assignment_count: 3` y sin nombres, y la respuesta es la misma que antes de esta historia

