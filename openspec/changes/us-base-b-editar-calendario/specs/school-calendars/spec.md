## MODIFIED Requirements

### Requirement: Contrato de los calendarios en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/calendars` (`createCalendar`), `GET /api/calendars` (`listCalendars`), `GET /api/calendars/{id}` (`getCalendar`) y `PUT /api/calendars/{id}` (`updateCalendar`), con seguridad Bearer, y los esquemas `CreateCalendarRequest` (`name` y `periods` obligatorios, `courseIds` opcional, sin más propiedades), `UpdateCalendarRequest` (la misma forma), `CalendarPeriod` (`type`: `SESSION` o `BREAK`, `startTime` y `endTime` en `HH:MM`), `Calendar` (`id`, `name`, `periods`, `courses` como lista de `{ id, name }` y `createdAt`) y sus respuestas. `POST` MUST declarar `201` (`{ calendar: Calendar }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/calendars`, `200` (`{ calendars: Calendar[] }`), `401`, `500` y `503`; `GET /api/calendars/{id}`, `200` (`{ calendar: Calendar }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ calendar: Calendar }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `CalendarNotFound` en `components.responses`. Las descripciones de `POST` y `PUT` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCalendar`, `listCalendars`, `getCalendar` y `updateCalendar`
- **THEN** las cuatro exigen Bearer y declaran las respuestas indicadas, `createCalendar` y `updateCalendar` declaran `403`, y `getCalendar` y `updateCalendar` declaran `404` con `CalendarNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los esquemas `CreateCalendarRequest`, `UpdateCalendarRequest`, `Calendar` y `CalendarPeriod`

### Requirement: Acceso a los calendarios
`GET /api/calendars` y `GET /api/calendars/{id}` MUST exigir sesión (`401` sin ella) y estar abiertos a `ADMIN` y `MEMBER`. `POST /api/calendars` y `PUT /api/calendars/{id}` MUST exigir sesión y el rol `ADMIN` (`requireRole`): un `MEMBER` MUST recibir `403 FORBIDDEN` antes de que se lea el `id` o se valide el cuerpo, sin crear ni cambiar nada (también con un `id` inexistente), con el evento `AUTHORIZATION_DENIED`. El colegio MUST salir siempre de la identidad y no admitirse en el cuerpo.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** pide el listado, pide un calendario y luego intenta crear uno y editar otro
- **THEN** recibe `200`, `200`, `403 FORBIDDEN` y `403 FORBIDDEN`, y no se crea ni se cambia nada

#### Scenario: Miembro con un id que no existe
- **GIVEN** un usuario `MEMBER`
- **WHEN** envía `PUT /api/calendars/{id}` con un `id` inexistente y un cuerpo inválido
- **THEN** recibe `403 FORBIDDEN`, no `404` ni `400`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los cuatro sin token
- **THEN** la respuesta es `401`

### Requirement: Eventos de log de los calendarios
Un alta correcta MUST registrar `CALENDAR_CREATED` con `school_id`, `actor_id`, `calendar_id`, `session_count`, `break_count` y `course_count`. Un alta rechazada por el nombre o por un curso MUST registrar `CALENDAR_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate` o `course_not_found`). Una edición correcta MUST registrar `CALENDAR_UPDATED` con `school_id`, `actor_id`, `calendar_id`, `changed_fields` (lista con `name`, `periods` y `courses` según lo que cambió; vacía si nada cambió), `session_count`, `break_count`, `courses_added` y `courses_removed`. Una edición rechazada MUST registrar `CALENDAR_UPDATE_REJECTED` con `school_id`, `actor_id`, `calendar_id` y `reason` (`not_found`, `duplicate` o `course_not_found`). Los eventos MUST NOT llevar el nombre del calendario ni el de los cursos.

#### Scenario: Sin nombres en el log
- **WHEN** se crea «Primaria» con «1º Primaria» y después otra vez «Primaria»
- **THEN** se registran `CALENDAR_CREATED` y `CALENDAR_CREATION_REJECTED` con `reason: "duplicate"`, y el log no contiene «Primaria»

#### Scenario: Edición en el log
- **GIVEN** «Primaria» con «1º Primaria» y «2º Primaria»
- **WHEN** se renombra a «Primaria 1º ciclo», se quita «2º Primaria» y se añade «3º Primaria»
- **THEN** se registra `CALENDAR_UPDATED` con `changed_fields: ["name", "courses"]`, `courses_added: 1` y `courses_removed: 1`, y el log no contiene ningún nombre

### Requirement: Página de listado de calendarios
`/calendarios` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir la lista una sola vez (también con `StrictMode`) con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. MUST mostrar una tarjeta por calendario con su nombre como `h2`, sus periodos en orden («Sesión 1 · 09:00–09:45», «Recreo · 11:15–11:45»), el resumen «N sesiones al día · 5×N a la semana · M minutos lectivos al día» (los recreos no cuentan) y los cursos que lo siguen o «Sin cursos asignados». El botón «Crear calendario» y, en cada tarjeta, el enlace «Editar» (`aria-label` «Editar {nombre}», hacia `/calendarios/{id}/editar`) MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar los calendarios». Sin calendarios MUST mostrar «Todavía no hay calendarios». MUST leer del estado de la navegación, con una guarda de tipo, `{ calendarCreated: <texto no vacío> }` o `{ calendarUpdated: <texto no vacío> }` y mostrar «Calendario «X» creado» o «Calendario «X» actualizado» como texto plano en un `role="status"`.

#### Scenario: Calendario con cursos
- **GIVEN** «Primaria» con seis sesiones de 45 minutos, un recreo y los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se abre `/calendarios`
- **THEN** su tarjeta muestra los siete periodos, «6 sesiones al día · 30 a la semana · 270 minutos lectivos al día» y «1º Primaria, 2º Primaria»

#### Scenario: Según el rol
- **WHEN** un `MEMBER` abre `/calendarios`
- **THEN** ve los calendarios, no ve «Crear calendario» ni ningún «Editar» y ve «Solo los administradores pueden crear y modificar los calendarios»

#### Scenario: Enlace de edición
- **WHEN** un `ADMIN` abre `/calendarios` con «Primaria»
- **THEN** su tarjeta tiene el enlace «Editar Primaria» hacia `/calendarios/<id>/editar`

#### Scenario: Aviso de edición
- **GIVEN** la navegación llega con `{ calendarUpdated: "Primaria 1º ciclo" }`
- **WHEN** se pinta `/calendarios`
- **THEN** se muestra «Calendario «Primaria 1º ciclo» actualizado» en un `role="status"`; con cualquier otra forma del estado no se muestra nada

### Requirement: Calendarios de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Primaria» generando las sesiones y verla en el listado con su resumen; crear «Infantil» editando a mano el recreo y la cuarta sesión; mover un curso de un calendario a otro; el nombre repetido; un `MEMBER` que ve los calendarios sin «Crear calendario» ni «Editar» y no puede abrir el alta ni la edición; el formulario a 360 px sin desplazamiento horizontal; y la edición: renombrar, mover el recreo, quitar una sesión, mover un curso desde otro calendario y liberar otro, el nombre repetido, «Guardar» deshabilitado sin cambios y el calendario que ya no existe.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `calendars.cy.ts`, también los de edición

## ADDED Requirements

### Requirement: Leer un calendario con GET /api/calendars/{id}
`GET /api/calendars/{id}` MUST devolver `200` con `{ calendar: Calendar }` (periodos en orden y cursos en orden natural) y `Cache-Control: no-store` si el calendario es del colegio de la identidad. Un `id` que no es UUID, un calendario inexistente o de otro colegio MUST responder `404 NOT_FOUND`, sin distinguir el caso.

#### Scenario: Calendario del colegio
- **GIVEN** «Primaria» con siete periodos y «1º Primaria»
- **WHEN** se pide por su `id`
- **THEN** la respuesta es `200` con sus siete periodos en orden, `courses` con «1º Primaria» y `no-store`

#### Scenario: Calendario que no está
- **WHEN** se pide un `id` que no es UUID, uno inexistente o el de un calendario de otro colegio
- **THEN** la respuesta es `404` con `error.code` igual a `NOT_FOUND` en los tres casos

### Requirement: Editar un calendario con PUT /api/calendars/{id}
`PUT /api/calendars/{id}` MUST recibir el estado final del calendario con la forma y las reglas del alta (nombre, periodos y `courseIds`, validados por el mismo parser y en el mismo orden de errores), y MUST responder `200` con `{ calendar: Calendar }` tal como queda guardado y `Cache-Control: no-store`. El orden de validación MUST ser: rol, `id` (no UUID es `404`), cuerpo (`400`), existencia del calendario (`404`), cursos (`400`) y nombre (`409`). Renombrarlo al nombre de otro calendario del colegio MUST responder `409 CALENDAR_ALREADY_EXISTS`; cambiar solo mayúsculas o espacios del propio nombre MUST ser válido. Los periodos MUST reemplazarse enteros en el orden recibido, con `position` desde 1. Un `PUT` idéntico a lo guardado MUST responder `200` sin error. Gana el último guardado: no hay control de versión.

#### Scenario: Renombrar y cambiar la jornada
- **GIVEN** «Primaria» con seis sesiones y un recreo de 11:15 a 11:45
- **WHEN** se envía el nombre «Primaria 1º ciclo», el recreo de 11:00 a 11:30 con las sesiones reajustadas y una séptima sesión
- **THEN** la respuesta es `200` con el nombre nuevo y los ocho periodos en orden, y al pedirlo de nuevo devuelve lo mismo

#### Scenario: Cambio de mayúsculas del propio nombre
- **GIVEN** «Primaria»
- **WHEN** se envía el nombre «PRIMARIA» con los mismos periodos
- **THEN** la respuesta es `200` con «PRIMARIA»

#### Scenario: Nombre de otro calendario
- **GIVEN** «Primaria» e «Infantil» en el mismo colegio
- **WHEN** se renombra «Primaria» a «infantil »
- **THEN** la respuesta es `409 CALENDAR_ALREADY_EXISTS` y «Primaria» no cambia

#### Scenario: Cuerpo inválido
- **WHEN** se envía un recreo al principio, una sesión de 100 minutos o un nombre vacío
- **THEN** la respuesta es `400 VALIDATION_ERROR` con los mismos códigos y campos que en el alta, y el calendario no cambia

#### Scenario: Calendario que no está
- **WHEN** se envía un cuerpo válido a un `id` que no es UUID, inexistente o de otro colegio
- **THEN** la respuesta es `404 NOT_FOUND` y no cambia ningún calendario ni curso

#### Scenario: Ediciones simultáneas
- **WHEN** dos `PUT` del mismo calendario con periodos distintos llegan a la vez, varias rondas
- **THEN** los dos responden `200` y el calendario queda exactamente con los periodos y los cursos de uno de ellos, nunca una mezcla

### Requirement: Cursos al editar un calendario
Al editar, los cursos de `courseIds` MUST quedar siguiendo este calendario, también los que seguían otro (se mueven); los que lo seguían y no están en `courseIds` MUST quedar sin calendario (`calendar_id` nulo). `courseIds` ausente MUST equivaler a la lista vacía. Un curso de otro colegio o inexistente MUST responder `400` con `NOT_FOUND` en `courseIds[<i>]` sin cambiar nada. La edición MUST hacerse en una transacción que bloquea primero la fila del calendario (`FOR UPDATE`, filtrada por colegio) y después, en orden de `id`, la unión de los cursos pedidos y de los que lo siguen hoy; si algo falla, el calendario MUST conservar su nombre, sus periodos y sus cursos.

#### Scenario: Liberar, añadir y mover
- **GIVEN** «Primaria» con «1º Primaria» y «2º Primaria», e «Infantil» con «3º Primaria»
- **WHEN** se edita «Primaria» con `courseIds` de «1º Primaria» y «3º Primaria»
- **THEN** «Primaria» tiene «1º Primaria» y «3º Primaria», «2º Primaria» no sigue ningún calendario e «Infantil» no tiene cursos

#### Scenario: Sin courseIds
- **GIVEN** «Primaria» con dos cursos
- **WHEN** se edita sin `courseIds`
- **THEN** «Primaria» queda sin cursos y los dos cursos sin calendario

#### Scenario: Curso que ya no existe
- **WHEN** se edita con un curso borrado y otro de otro colegio
- **THEN** la respuesta es `400` con `NOT_FOUND` en sus `courseIds[<i>]` y nada cambia

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la actualización de los cursos
- **WHEN** se edita «Primaria» cambiando el nombre, los periodos y los cursos
- **THEN** la petición falla y «Primaria» conserva su nombre, sus periodos y sus cursos

#### Scenario: Edición contra borrado de un curso y contra un alta
- **WHEN** se edita un calendario con un curso a la vez que se borra ese curso, o a la vez que se crea otro calendario con cursos en común, varias rondas
- **THEN** la edición responde `200` o `400` y el resto termina sin error, nunca con `500` ni interbloqueo

### Requirement: Página de edición de un calendario
`/calendarios/:id/editar` MUST colgar de `RequireRole` con el rol `ADMIN` (un `MEMBER` va a `/onboarding`). MUST pedir el calendario, los cursos y los calendarios una sola vez cada uno (también con `StrictMode`) y mostrar un `role="status"` mientras carga, «Este calendario no existe o ya no está disponible» con un enlace a «Calendarios» ante un `404` (al cargar y al guardar), un `role="alert"` con «Reintentar» si falla la carga del calendario, o el formulario. `CalendarForm` MUST recibir los valores iniciales (nombre, periodos y cursos del calendario, leídos solo al montar) y `requireChanges`: «Guardar» MUST estar deshabilitado mientras lo que se enviaría (nombre limpio, periodos ordenados por hora y conjunto de cursos) sea igual a lo cargado, también tras deshacer un cambio. Mientras los cursos cargan o han fallado, MUST enviar los `courseIds` iniciales sin cambiarlos. En los cursos MUST marcar los que siguen el calendario, avisar «Ahora sigue «X»: se moverá» bajo los de otro calendario y «Se quedará sin calendario» bajo los que lo seguían y se desmarcan, ligados por `aria-describedby`. El bloque «Generar sesiones», la validación, el foco, la guarda contra el doble envío y los errores del servidor MUST funcionar como en el alta. Con el `200` MUST navegar a `/calendarios` con `replace` y `{ calendarUpdated: nombre del servidor }`; un `409` MUST marcar el nombre con el foco; un `400` con `courseIds[<i>]` `NOT_FOUND` MUST volver a pedir los cursos conservando lo escrito; un `403` MUST mostrar «Solo los administradores pueden modificar calendarios»; cualquier otro fallo MUST mostrar un aviso general conservando lo escrito. «Cancelar» MUST volver a `/calendarios`.

#### Scenario: Precarga sin cambios
- **GIVEN** «Primaria» con siete periodos y «1º Primaria»
- **WHEN** un `ADMIN` abre su edición
- **THEN** ve el nombre, los siete periodos y «1º Primaria» marcado, y «Guardar» está deshabilitado

#### Scenario: Solo con cambios reales
- **WHEN** añade un espacio al final del nombre, o cambia una hora y la devuelve a su valor
- **THEN** «Guardar» sigue deshabilitado; al cambiar de verdad una hora, se habilita

#### Scenario: Guardar
- **WHEN** renombra «Primaria» a «Primaria 1º ciclo» y pulsa «Guardar» dos veces
- **THEN** se envía un único `PUT` y vuelve a `/calendarios` con «Calendario «Primaria 1º ciclo» actualizado»

#### Scenario: Avisos de los cursos
- **GIVEN** «Primaria» con «2º Primaria» e «Infantil» con «3º Primaria»
- **WHEN** desmarca «2º Primaria» y marca «3º Primaria»
- **THEN** bajo «2º Primaria» se lee «Se quedará sin calendario» y bajo «3º Primaria» «Ahora sigue «Infantil»: se moverá»

#### Scenario: Calendario que ya no existe
- **WHEN** abre la edición de un calendario borrado, o guarda y el servidor responde `404`
- **THEN** ve «Este calendario no existe o ya no está disponible» con un enlace a «Calendarios»

#### Scenario: Nombre repetido
- **WHEN** guarda con el nombre de otro calendario
- **THEN** el error «Ya existe un calendario con ese nombre» sale bajo el nombre con el foco y se conserva lo escrito
