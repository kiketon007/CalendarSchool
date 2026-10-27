## MODIFIED Requirements

### Requirement: Contrato de las asignaturas en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/subjects` (`createSubject`), `GET /api/subjects` (`listSubjects`), `GET /api/subjects/{id}` (`getSubject`) y `PUT /api/subjects/{id}` (`updateSubject`), con seguridad Bearer, y los esquemas `SubjectType` (`CORE`, `ELECTIVE`, `CUSTOM`), `SubjectStatus` (`ACTIVE`, `INACTIVE`), `SubjectColor` (`blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`), `CreateSubjectRequest` (`name`, `type`, `status`, `color` y `courses` obligatorios; `code` y `description` opcionales y admitiendo `null`; `courses` como lista de `{ courseId, sessionsPerWeek }`; sin más propiedades), `UpdateSubjectRequest` (la misma forma), `SubjectCourse` (`id`, `name`, `sessionsPerWeek`) y `Subject` (`id`, `name`, `code` como texto o `null`, `type`, `status`, `description` como texto o `null`, `color`, `courses` como lista de `SubjectCourse` y `createdAt`). `POST` MUST declarar `201` (`{ subject: Subject }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/subjects`, `200` (`{ subjects: Subject[] }`), `401`, `500` y `503`; `GET /api/subjects/{id}`, `200` (`{ subject: Subject }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ subject: Subject }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `SubjectNotFound` en `components.responses`. Las descripciones de `POST` y `PUT` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createSubject`, `listSubjects`, `getSubject` y `updateSubject`
- **THEN** las cuatro exigen Bearer y declaran las respuestas indicadas, `createSubject` y `updateSubject` declaran `403` y `409`, y `getSubject` y `updateSubject` declaran `404` con `SubjectNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los esquemas `CreateSubjectRequest`, `UpdateSubjectRequest`, `Subject`, `SubjectCourse` y `SubjectColor`

### Requirement: Acceso a las asignaturas
`GET /api/subjects` y `GET /api/subjects/{id}` MUST exigir sesión (`401` sin ella) y estar abiertos a `ADMIN` y `MEMBER`. `POST /api/subjects` y `PUT /api/subjects/{id}` MUST exigir sesión y el rol `ADMIN` (`requireRole`): un `MEMBER` MUST recibir `403 FORBIDDEN` antes de que se lea el `id` o se valide el cuerpo, sin crear ni cambiar nada (también con un `id` inexistente), con el evento `AUTHORIZATION_DENIED`. El colegio MUST salir siempre de la identidad.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** pide el listado, pide una asignatura y luego intenta crear una con un cuerpo inválido y editar otra
- **THEN** recibe `200`, `200`, `403 FORBIDDEN` y `403 FORBIDDEN`, y no se crea ni se cambia nada

#### Scenario: Miembro con un id que no existe
- **GIVEN** un usuario `MEMBER`
- **WHEN** envía `PUT /api/subjects/{id}` con un `id` inexistente y un cuerpo inválido
- **THEN** recibe `403 FORBIDDEN`, no `404` ni `400`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los cuatro sin token
- **THEN** la respuesta es `401`

### Requirement: Eventos de log de las asignaturas
Un alta correcta MUST registrar `SUBJECT_CREATED` con `school_id`, `actor_id`, `subject_id` y `course_count`. Un alta rechazada por el nombre, el código o un curso MUST registrar `SUBJECT_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate_name`, `duplicate_code` o `course_not_found`). Una edición correcta MUST registrar `SUBJECT_UPDATED` con `school_id`, `actor_id`, `subject_id`, `changed_fields` (lista con `name`, `code`, `type`, `status`, `description`, `color` y `courses` según lo que cambió; vacía si nada cambió), `courses_added`, `courses_removed` y `courses_changed` (cursos que siguen con otras sesiones). Una edición rechazada MUST registrar `SUBJECT_UPDATE_REJECTED` con `school_id`, `actor_id`, `subject_id` y `reason` (`not_found`, `duplicate_name`, `duplicate_code` o `course_not_found`). Un `400` de validación MUST NOT registrar ningún evento. Los eventos MUST NOT llevar el nombre, el código ni la descripción de la asignatura, ni el nombre de los cursos.

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

### Requirement: Página de listado de asignaturas
`/asignaturas` MUST colgar de `AuthenticatedLayout` sin restricción de rol y pedir la lista una sola vez (también con `StrictMode`), con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. Cada asignatura MUST mostrar la muestra de su color con su nombre accesible, su nombre, su código si lo tiene, su tipo («Troncal», «Optativa» o «Propia del centro»), su estado («Activa» o «Inactiva») y el resumen de sus cursos («N cursos · M sesiones a la semana», o «Sin cursos» con un aviso visible en texto). El resumen MUST ser un botón con `aria-expanded` que despliega cada curso con sus sesiones («1º Primaria: 2 sesiones»). MUST ofrecer filtros por tipo y por estado (con «Todos») y una búsqueda por nombre o código con la comparación de la búsqueda de cursos, en el cliente y combinables, y «No hay asignaturas que coincidan» si no queda ninguna. Sin asignaturas MUST mostrar «Todavía no hay asignaturas». El botón «Crear asignatura» y, en cada asignatura, el enlace «Editar» (`aria-label` «Editar {nombre}», hacia `/asignaturas/{id}/editar`) MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar las asignaturas». MUST leer del estado de la navegación, con una guarda de tipo, `{ subjectCreated: <texto no vacío> }` o `{ subjectUpdated: <texto no vacío> }` y mostrar «Asignatura «X» creada» o «Asignatura «X» actualizada» como texto plano en un `role="status"`.

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
- **THEN** ve las asignaturas, no ve «Crear asignatura» ni ningún «Editar» y ve «Solo los administradores pueden crear y modificar las asignaturas»

#### Scenario: Enlace de edición
- **WHEN** un `ADMIN` abre `/asignaturas` con «Inglés»
- **THEN** su tarjeta tiene el enlace «Editar Inglés» hacia `/asignaturas/<id>/editar`

#### Scenario: Aviso de edición
- **GIVEN** la navegación llega con `{ subjectUpdated: "Inglés avanzado" }`
- **WHEN** se pinta `/asignaturas`
- **THEN** se muestra «Asignatura «Inglés avanzado» actualizada» en un `role="status"`; con cualquier otra forma del estado no se muestra nada

### Requirement: Accesibilidad, responsive e i18n de las asignaturas
Las páginas de asignaturas MUST cumplir WCAG 2.1 AA: cada número de sesiones con su etiqueta accesible, los errores ligados por `aria-describedby`, el desplegable de cursos con `aria-expanded`, el color anunciado por su nombre, el enlace «Editar» con su nombre accesible, el aviso de asignatura sin cursos de la edición ligado por `aria-describedby`, sin violaciones de `axe` (listado, formulario de alta y de edición, con y sin errores) y sin desplazamiento horizontal a 360 px. Los textos, los tipos, los estados y los nombres de los colores MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado, el formulario con errores y el formulario de edición
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

### Requirement: Asignaturas de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Inglés» con todos los cursos y «Programación» con cursos parciales y sin código, y verlas en el listado; los filtros y la búsqueda; el nombre y el código repetidos; borrar un curso y ver la asignatura con «Sin cursos»; un `MEMBER` que ve las asignaturas sin «Crear asignatura» ni «Editar» y no puede abrir el alta ni la edición; el formulario a 360 px sin desplazamiento horizontal; y la edición: «Guardar» deshabilitado sin cambios, renombrar y ver el aviso, inactivar y verla con el filtro «Inactiva», cambiar las sesiones de un curso, añadir uno y quitar otro, el nombre y el código de otra asignatura, la asignatura sin cursos que exige marcar uno, la asignatura que ya no existe y la edición a 360 px.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `subjects.cy.ts`, también los de edición

## ADDED Requirements

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
Al editar, las filas de `subject_courses` de la asignatura MUST reemplazarse por las de `courses`: los cursos nuevos se añaden, los que no están se quitan y los que siguen toman las sesiones recibidas. `courses` MUST seguir las reglas del alta (entre 1 y 100, sin repetidos, sesiones de 1 a 5), así que una asignatura que se quedó sin cursos no se puede guardar sin marcar alguno. Un curso de otro colegio o inexistente MUST responder `400` con `NOT_FOUND` en `courses[<i>].courseId` sin cambiar nada. La edición MUST hacerse en una transacción que bloquea primero la fila de la asignatura (`FOR UPDATE`, filtrada por colegio) y después, con `FOR SHARE` y en orden de `id`, la unión de los cursos pedidos y de los que tiene hoy, antes de tocar `subject_courses`; si algo falla, la asignatura MUST conservar todos sus campos y sus cursos.

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
