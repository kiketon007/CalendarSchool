## MODIFIED Requirements

### Requirement: Contrato de los calendarios en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/calendars` (`createCalendar`), `GET /api/calendars` (`listCalendars`), `GET /api/calendars/{id}` (`getCalendar`), `PUT /api/calendars/{id}` (`updateCalendar`) y `DELETE /api/calendars/{id}` (`deleteCalendar`), con seguridad Bearer, y los esquemas `CreateCalendarRequest` (`name` y `periods` obligatorios, `courseIds` opcional, sin más propiedades), `UpdateCalendarRequest` (la misma forma), `CalendarPeriod` (`type`: `SESSION` o `BREAK`, `startTime` y `endTime` en `HH:MM`), `Calendar` (`id`, `name`, `periods`, `courses` como lista de `{ id, name }` y `createdAt`), `DeleteCalendarResponse` (`{ deleted: { id, courseCount } }`, `courseCount` entero no negativo) y sus respuestas. `POST` MUST declarar `201` (`{ calendar: Calendar }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/calendars`, `200` (`{ calendars: Calendar[] }`), `401`, `500` y `503`; `GET /api/calendars/{id}`, `200` (`{ calendar: Calendar }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ calendar: Calendar }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`; `DELETE`, sin cuerpo, `200` (`DeleteCalendarResponse`), `401`, `403`, `404`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `CalendarNotFound` en `components.responses`. Las descripciones de `POST`, `PUT` y `DELETE` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCalendar`, `listCalendars`, `getCalendar`, `updateCalendar` y `deleteCalendar`
- **THEN** las cinco exigen Bearer y declaran las respuestas indicadas, `createCalendar`, `updateCalendar` y `deleteCalendar` declaran `403`, y `getCalendar`, `updateCalendar` y `deleteCalendar` declaran `404` con `CalendarNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los esquemas `CreateCalendarRequest`, `UpdateCalendarRequest`, `Calendar`, `CalendarPeriod` y `DeleteCalendarResponse`

### Requirement: Acceso a los calendarios
`GET /api/calendars` y `GET /api/calendars/{id}` MUST exigir sesión (`401` sin ella) y estar abiertos a `ADMIN` y `MEMBER`. `POST /api/calendars`, `PUT /api/calendars/{id}` y `DELETE /api/calendars/{id}` MUST exigir sesión y el rol `ADMIN` (`requireRole`): un `MEMBER` MUST recibir `403 FORBIDDEN` antes de que se lea el `id` o se valide el cuerpo, sin crear, cambiar ni borrar nada (también con un `id` inexistente o que no es UUID), con el evento `AUTHORIZATION_DENIED`. El colegio MUST salir siempre de la identidad y no admitirse en el cuerpo.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** pide el listado, pide un calendario y luego intenta crear uno, editar otro y borrar otro
- **THEN** recibe `200`, `200`, `403 FORBIDDEN`, `403 FORBIDDEN` y `403 FORBIDDEN`, y no se crea, cambia ni borra nada

#### Scenario: Miembro con un id que no existe
- **GIVEN** un usuario `MEMBER`
- **WHEN** envía `PUT` o `DELETE /api/calendars/{id}` con un `id` inexistente o que no es UUID
- **THEN** recibe `403 FORBIDDEN`, no `404` ni `400`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los cinco sin token
- **THEN** la respuesta es `401`

### Requirement: Eventos de log de los calendarios
Un alta correcta MUST registrar `CALENDAR_CREATED` con `school_id`, `actor_id`, `calendar_id`, `session_count`, `break_count` y `course_count`. Un alta rechazada por el nombre o por un curso MUST registrar `CALENDAR_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate` o `course_not_found`). Una edición correcta MUST registrar `CALENDAR_UPDATED` con `school_id`, `actor_id`, `calendar_id`, `changed_fields` (lista con `name`, `periods` y `courses` según lo que cambió; vacía si nada cambió), `session_count`, `break_count`, `courses_added` y `courses_removed`. Una edición rechazada MUST registrar `CALENDAR_UPDATE_REJECTED` con `school_id`, `actor_id`, `calendar_id` y `reason` (`not_found`, `duplicate` o `course_not_found`). Un borrado correcto MUST registrar `CALENDAR_DELETED` con `school_id`, `actor_id`, `calendar_id` y `course_count` (los cursos que quedaron sin calendario); un `404` al borrar MUST NOT registrar nada. Los eventos MUST NOT llevar el nombre del calendario ni el de los cursos.

#### Scenario: Sin nombres en el log
- **WHEN** se crea «Primaria» con «1º Primaria» y después otra vez «Primaria»
- **THEN** se registran `CALENDAR_CREATED` y `CALENDAR_CREATION_REJECTED` con `reason: "duplicate"`, y el log no contiene «Primaria»

#### Scenario: Edición en el log
- **GIVEN** «Primaria» con «1º Primaria» y «2º Primaria»
- **WHEN** se renombra a «Primaria 1º ciclo», se quita «2º Primaria» y se añade «3º Primaria»
- **THEN** se registra `CALENDAR_UPDATED` con `changed_fields: ["name", "courses"]`, `courses_added: 1` y `courses_removed: 1`, y el log no contiene ningún nombre

#### Scenario: Borrado en el log
- **GIVEN** «Primaria» con dos cursos
- **WHEN** se borra y después se intenta borrar otra vez
- **THEN** se registra un único `CALENDAR_DELETED` con `course_count: 2`, el segundo intento no deja evento y el log no contiene ningún nombre

### Requirement: Página de listado de calendarios
`/calendarios` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir la lista una sola vez (también con `StrictMode`) con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. MUST mostrar una tarjeta por calendario con su nombre como `h2`, sus periodos en orden («Sesión 1 · 09:00–09:45», «Recreo · 11:15–11:45»), el resumen «N sesiones al día · 5×N a la semana · M minutos lectivos al día» (los recreos no cuentan) y los cursos que lo siguen o «Sin cursos asignados». El botón «Crear calendario» y, en cada tarjeta, el enlace «Editar» (`aria-label` «Editar {nombre}», hacia `/calendarios/{id}/editar`) y el botón «Borrar» (`outline-danger`, `aria-label` «Borrar {nombre}») MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar los calendarios». Sin calendarios MUST mostrar «Todavía no hay calendarios». MUST leer del estado de la navegación, con una guarda de tipo, `{ calendarCreated: <texto no vacío> }` o `{ calendarUpdated: <texto no vacío> }` y mostrar «Calendario «X» creado» o «Calendario «X» actualizado» como texto plano en un `role="status"`.

#### Scenario: Calendario con cursos
- **GIVEN** «Primaria» con seis sesiones de 45 minutos, un recreo y los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se abre `/calendarios`
- **THEN** su tarjeta muestra los siete periodos, «6 sesiones al día · 30 a la semana · 270 minutos lectivos al día» y «1º Primaria, 2º Primaria»

#### Scenario: Según el rol
- **WHEN** un `MEMBER` abre `/calendarios`
- **THEN** ve los calendarios, no ve «Crear calendario», ningún «Editar» ni ningún «Borrar» y ve «Solo los administradores pueden crear y modificar los calendarios»

#### Scenario: Enlace de edición y botón de borrado
- **WHEN** un `ADMIN` abre `/calendarios` con «Primaria»
- **THEN** su tarjeta tiene el enlace «Editar Primaria» hacia `/calendarios/<id>/editar` y el botón «Borrar Primaria»

#### Scenario: Aviso de edición
- **GIVEN** la navegación llega con `{ calendarUpdated: "Primaria 1º ciclo" }`
- **WHEN** se pinta `/calendarios`
- **THEN** se muestra «Calendario «Primaria 1º ciclo» actualizado» en un `role="status"`; con cualquier otra forma del estado no se muestra nada

### Requirement: Accesibilidad, responsive e i18n de los calendarios
Las páginas de calendarios MUST cumplir WCAG 2.1 AA: cada hora con una etiqueta accesible propia («Inicio de la sesión 1», «Fin del recreo 1»), los errores ligados por `aria-describedby`, el diálogo de borrado con su título como nombre accesible, sin violaciones de `axe` (listado, formulario con y sin errores y diálogo de borrado) y sin desplazamiento horizontal a 360 px. Los textos MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado, el formulario con errores y el diálogo de borrado abierto
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

### Requirement: Calendarios de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Primaria» generando las sesiones y verla en el listado con su resumen; crear «Infantil» editando a mano el recreo y la cuarta sesión; mover un curso de un calendario a otro; el nombre repetido; un `MEMBER` que ve los calendarios sin «Crear calendario», «Editar» ni «Borrar» y no puede abrir el alta ni la edición; el formulario a 360 px sin desplazamiento horizontal; la edición (renombrar, mover el recreo, quitar una sesión, mover un curso desde otro calendario y liberar otro, el nombre repetido, «Guardar» deshabilitado sin cambios y el calendario que ya no existe); y el borrado: cancelar, borrar un calendario con cursos (el aviso con el recuento, el foco en el título y que los cursos siguen existiendo sin calendario), borrar el último y el diálogo a 360 px.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `calendars.cy.ts`, también los de edición y de borrado

## ADDED Requirements

### Requirement: Borrar un calendario con DELETE /api/calendars/{id}
`DELETE /api/calendars/{id}` MUST borrar de verdad, en una única transacción, el calendario del colegio de la identidad y sus periodos, y dejar **sin calendario** (`calendar_id` nulo) los cursos que lo seguían, sin borrarlos. MUST responder `200` con `{ deleted: { id, courseCount } }`, donde `courseCount` son los cursos que quedaron sin calendario, contados en la misma transacción, y `Cache-Control: no-store`. El orden MUST ser: rol, `id` (no UUID es `404`), existencia del calendario (`404`). Un `id` que no es UUID, un calendario inexistente, de otro colegio o ya borrado MUST responder `404 NOT_FOUND` sin borrar nada. La transacción MUST bloquear primero la fila del calendario (`FOR UPDATE`, filtrada por colegio) y después sus cursos en orden de `id`; si algo falla a mitad, MUST NOT borrarse nada.

#### Scenario: Borrar un calendario con cursos
- **GIVEN** «Primaria» con siete periodos y los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se borra
- **THEN** la respuesta es `200` con `{ deleted: { id, courseCount: 2 } }`, el calendario y sus periodos ya no existen, los dos cursos siguen existiendo sin calendario y el listado ya no lo trae

#### Scenario: Borrar un calendario sin cursos
- **WHEN** se borra un calendario que no sigue ningún curso
- **THEN** la respuesta es `200` con `courseCount: 0`

#### Scenario: Calendario que no está
- **WHEN** se borra un `id` que no es UUID, uno inexistente, el de otro colegio o uno ya borrado
- **THEN** la respuesta es `404 NOT_FOUND` y no se borra nada

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar el borrado de los periodos
- **WHEN** se borra «Primaria»
- **THEN** la petición falla y el calendario, sus periodos y sus cursos siguen como estaban

#### Scenario: Borrados y ediciones simultáneos
- **WHEN** dos borrados del mismo calendario llegan a la vez, o un borrado y la edición del mismo calendario, o un borrado y la edición de otro calendario que se lleva uno de sus cursos, o un borrado y el borrado de uno de sus cursos, varias rondas
- **THEN** de dos borrados uno responde `200` y otro `404`; la edición del mismo responde `200` o `404`; las demás terminan con éxito; nunca hay `500` ni interbloqueo, y un curso que otra edición se llevó queda en ese otro calendario

### Requirement: Diálogo para borrar un calendario
`DeleteCalendarModal` MUST estar siempre montado y gobernado por `calendar` (`null` si está cerrado; conserva el último mientras se cierra), con `onDeleted`, `onGone`, `onCancel` y `onExited`, y MUST NOT pedir nada al abrirse: usa el nombre y los cursos de la tarjeta. MUST titularse «¿Borrar el calendario «{nombre}»?» (su nombre accesible), decir «Estos cursos se quedarán sin calendario: {cursos}» o «Ningún curso sigue este calendario» y «Esta acción no se puede deshacer», abrir con el foco en «Cancelar» y no tener «X» de cabecera. MUST enviar una sola petición aunque se pulse dos veces «Borrar calendario», mostrar «Borrando…» con los botones deshabilitados y no cerrarse con Escape ni con un clic fuera mientras borra. Un `404` MUST llamar a `onGone`; cualquier otro fallo MUST quedarse en el diálogo con un `role="alert"` y permitir reintentar.

#### Scenario: Con cursos
- **GIVEN** «Primaria» con «1º Primaria» y «2º Primaria»
- **WHEN** se abre su diálogo
- **THEN** dice «¿Borrar el calendario «Primaria»?», «Estos cursos se quedarán sin calendario: 1º Primaria, 2º Primaria» y «Esta acción no se puede deshacer», con el foco en «Cancelar» y sin ninguna petición

#### Scenario: Sin cursos
- **WHEN** se abre el diálogo de un calendario sin cursos
- **THEN** dice «Ningún curso sigue este calendario»

#### Scenario: Cancelar
- **WHEN** se pulsa «Cancelar» o Escape
- **THEN** se cierra sin enviar nada

#### Scenario: Una sola petición
- **WHEN** se pulsa «Borrar calendario» dos veces seguidas
- **THEN** se envía un único `DELETE` y, mientras tanto, se lee «Borrando…» con los botones deshabilitados

#### Scenario: Fallo
- **WHEN** el servidor responde un error que no es `404`
- **THEN** el diálogo sigue abierto con un aviso y «Borrar calendario» se puede volver a pulsar

### Requirement: El listado tras borrar un calendario
Con `onDeleted`, `CalendarsPage` MUST quitar el calendario de la lista cargada sin volver a pedirla, mostrar en un `role="status"` propio, con prioridad sobre el aviso de llegada, «Calendario «X» eliminado» o, si quedaron cursos sin calendario, «Calendario «X» eliminado. N cursos se quedan sin calendario» (en plural según el `courseCount` del servidor, no según la tarjeta), y mover el foco al `h1` un turno después de `onExited`. Si era el último, MUST verse el estado vacío. Con `onGone` MUST avisar «Ese calendario ya no existe» y volver a pedir la lista. Al cancelar, el foco MUST volver al botón «Borrar» de esa tarjeta.

#### Scenario: Borrado con cursos
- **GIVEN** «Primaria» con dos cursos e «Infantil»
- **WHEN** se confirma el borrado de «Primaria» y el servidor responde `courseCount: 2`
- **THEN** solo queda «Infantil», se lee «Calendario «Primaria» eliminado. 2 cursos se quedan sin calendario», la lista no se vuelve a pedir y el foco está en el título

#### Scenario: Recuento real
- **GIVEN** la tarjeta de «Primaria» sin cursos
- **WHEN** se confirma y el servidor responde `courseCount: 1` (otra persona le asignó un curso)
- **THEN** el aviso dice «Calendario «Primaria» eliminado. 1 curso se queda sin calendario»

#### Scenario: El último
- **WHEN** se borra el único calendario
- **THEN** se ve «Todavía no hay calendarios»

#### Scenario: Ya no existe
- **WHEN** al confirmar el servidor responde `404`
- **THEN** el diálogo se cierra, se lee «Ese calendario ya no existe» y la lista se vuelve a pedir
