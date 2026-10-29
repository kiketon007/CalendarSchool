## MODIFIED Requirements

### Requirement: Contrato de las asignaturas en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/subjects` (`createSubject`), `GET /api/subjects` (`listSubjects`), `GET /api/subjects/{id}` (`getSubject`), `PUT /api/subjects/{id}` (`updateSubject`) y `DELETE /api/subjects/{id}` (`deleteSubject`), con seguridad Bearer, y los esquemas `SubjectType` (`CORE`, `ELECTIVE`, `CUSTOM`), `SubjectStatus` (`ACTIVE`, `INACTIVE`), `SubjectColor` (`blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`), `CreateSubjectRequest` (`name`, `type`, `status`, `color` y `courses` obligatorios; `code` y `description` opcionales y admitiendo `null`; `courses` como lista de `{ courseId, sessionsPerWeek }`; sin más propiedades), `UpdateSubjectRequest` (la misma forma), `SubjectCourse` (`id`, `name`, `sessionsPerWeek`), `Subject` (`id`, `name`, `code` como texto o `null`, `type`, `status`, `description` como texto o `null`, `color`, `courses` como lista de `SubjectCourse` y `createdAt`) y `DeleteSubjectResponse` (`{ deleted: { id } }`). `POST` MUST declarar `201` (`{ subject: Subject }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/subjects`, `200` (`{ subjects: Subject[] }`), `401`, `500` y `503`; `GET /api/subjects/{id}`, `200` (`{ subject: Subject }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ subject: Subject }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`; `DELETE`, sin cuerpo, `200` (`DeleteSubjectResponse`), `401`, `403`, `404`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `SubjectNotFound` en `components.responses`. Las descripciones de `POST`, `PUT` y `DELETE` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createSubject`, `listSubjects`, `getSubject`, `updateSubject` y `deleteSubject`
- **THEN** las cinco exigen Bearer y declaran las respuestas indicadas, `createSubject`, `updateSubject` y `deleteSubject` declaran `403`, y `getSubject`, `updateSubject` y `deleteSubject` declaran `404` con `SubjectNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los esquemas `CreateSubjectRequest`, `UpdateSubjectRequest`, `Subject`, `SubjectCourse`, `SubjectColor` y `DeleteSubjectResponse`

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

## ADDED Requirements

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
