# school-calendars Specification

## Purpose
TBD - created by archiving change us-base-calendario. Update Purpose after archive.
## Requirements
### Requirement: Contrato de los calendarios en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/calendars` (`createCalendar`), `GET /api/calendars` (`listCalendars`), `GET /api/calendars/{id}` (`getCalendar`) y `PUT /api/calendars/{id}` (`updateCalendar`), con seguridad Bearer, y los esquemas `CreateCalendarRequest` (`name` y `periods` obligatorios, `courseIds` opcional, sin más propiedades), `UpdateCalendarRequest` (la misma forma), `CalendarPeriod` (`type`: `SESSION` o `BREAK`, `startTime` y `endTime` en `HH:MM`), `Calendar` (`id`, `name`, `periods`, `courses` como lista de `{ id, name }` y `createdAt`) y sus respuestas. `POST` MUST declarar `201` (`{ calendar: Calendar }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET /api/calendars`, `200` (`{ calendars: Calendar[] }`), `401`, `500` y `503`; `GET /api/calendars/{id}`, `200` (`{ calendar: Calendar }`), `401`, `404`, `500` y `503`; `PUT`, `200` (`{ calendar: Calendar }`), `400`, `401`, `403`, `404`, `409`, `500` y `503`. El `404` MUST usar el código `NOT_FOUND` con una respuesta reutilizable `CalendarNotFound` en `components.responses`. Las descripciones de `POST` y `PUT` MUST decir que son solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCalendar`, `listCalendars`, `getCalendar` y `updateCalendar`
- **THEN** las cuatro exigen Bearer y declaran las respuestas indicadas, `createCalendar` y `updateCalendar` declaran `403`, y `getCalendar` y `updateCalendar` declaran `404` con `CalendarNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cuatro operaciones y los esquemas `CreateCalendarRequest`, `UpdateCalendarRequest`, `Calendar` y `CalendarPeriod`

### Requirement: Tablas de los calendarios
La migración `add_calendars` MUST crear `calendars` (`id` UUID, `school_id` clave ajena a `schools` sin cascada, `name` y `normalized_name` `VARCHAR(100)`, `created_at`, `updated_at`, con índice único `(school_id, normalized_name)`) y `calendar_periods` (`id` UUID, `calendar_id` clave ajena a `calendars` con `ON DELETE CASCADE`, `position` `SMALLINT`, `kind` enum `SESSION` o `BREAK`, `start_minute` y `end_minute` `SMALLINT` en minutos desde las 00:00, `created_at`, `updated_at`, con índice único `(calendar_id, position)` y un `CHECK` escrito a mano que exige `start_minute >= 0`, `end_minute <= 1439` y `end_minute > start_minute`). MUST añadir a `courses` la columna `calendar_id`, nula, clave ajena a `calendars` con `ON DELETE SET NULL` y con índice. MUST NOT añadir fechas, curso académico, estado ni borrado lógico.

#### Scenario: Restricción del periodo
- **WHEN** se inserta directamente en la base de datos un periodo con `end_minute` igual a `start_minute`
- **THEN** la base de datos lo rechaza

#### Scenario: El curso sobrevive a su calendario
- **GIVEN** un curso que sigue un calendario
- **WHEN** se borra el calendario directamente en la base de datos
- **THEN** el curso sigue existiendo con `calendar_id` a `NULL` y los periodos del calendario desaparecen

### Requirement: Crear un calendario con POST /api/calendars
`POST /api/calendars` MUST crear en el colegio de la identidad el calendario, sus periodos (en el orden recibido, con `position` desde 1) y las asignaciones de cursos en una única transacción, y responder `201` con el calendario tal como quedó (sus periodos en orden y sus cursos en orden natural) y `Cache-Control: no-store`. Si falla cualquier escritura, MUST NOT quedar nada. Dos altas simultáneas con el mismo nombre MUST terminar con un `201` y un `409 CALENDAR_ALREADY_EXISTS`.

#### Scenario: Calendario de Primaria
- **WHEN** un `ADMIN` crea «Primaria» con las sesiones 09:00–09:45, 09:45–10:30, 10:30–11:15, el recreo 11:15–11:45 y las sesiones 11:45–12:30, 12:30–13:15 y 13:15–14:00
- **THEN** la respuesta es `201` con esos siete periodos en orden, `courses` vacío y `Cache-Control: no-store`

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la inserción de los periodos
- **WHEN** se crea un calendario con dos cursos
- **THEN** la respuesta es un error, no existe el calendario, no hay periodos y los dos cursos siguen con el calendario que tenían

#### Scenario: Dos altas con el mismo nombre
- **WHEN** se piden a la vez dos altas de «Primaria»
- **THEN** una responde `201` y la otra `409 CALENDAR_ALREADY_EXISTS`

### Requirement: Reglas del nombre de un calendario
El nombre MUST ser obligatorio, de 1 a 100 caracteres tras recortar los espacios de los extremos y colapsar los repetidos, con las mismas reglas de caracteres que el nombre de un curso (letras, también acentuadas y ñ, dígitos, `º`, `ª`, `-`, `/` y espacios), y MUST ser único en el colegio sin distinguir mayúsculas ni espacios sobrantes. Calendarios de colegios distintos MAY llamarse igual.

#### Scenario: Nombre inválido
- **WHEN** se crea un calendario sin nombre, con 101 caracteres o con `<`
- **THEN** la respuesta es `400` con `name` y `REQUIRED`, `INVALID_LENGTH` o `INVALID_CHARACTERS`

#### Scenario: Nombre repetido
- **GIVEN** el calendario «Primaria»
- **WHEN** se crea «  primaria »
- **THEN** la respuesta es `409 CALENDAR_ALREADY_EXISTS`

### Requirement: Reglas de los periodos de un calendario
`periods` MUST ser una lista ordenada por hora con la misma estructura para los cinco días lectivos. Cada periodo MUST tener `type` (`SESSION` o `BREAK`), `startTime` y `endTime` en `HH:MM` de 24 horas, de `00:00` a `23:59`. MUST haber entre 1 y 8 sesiones y como mucho 2 recreos; un recreo MUST ir entre dos sesiones (ni el primero, ni el último, ni junto a otro recreo). Cada periodo MUST acabar después de empezar y durar como máximo 90 minutos, y MUST NOT empezar antes de que acabe el anterior (pueden ser contiguos o dejar un hueco). El número de una sesión MUST NOT guardarse: es su orden entre las sesiones. Los errores MUST indicarse en `periods` (`REQUIRED` sin ninguna sesión, `INVALID_LENGTH` con más de 8 sesiones o más de 2 recreos), en `periods[<i>].type` (`REQUIRED`, `INVALID_FORMAT` o `NOT_ALLOWED` para un recreo mal colocado), en `periods[<i>].startTime` y `periods[<i>].endTime` (`REQUIRED` o `INVALID_FORMAT`) y en `periods[<i>].endTime` (`INVALID_RANGE` si no es posterior al inicio, `TOO_LONG` si dura más de 90 minutos) y `periods[<i>].startTime` (`OVERLAP` si empieza antes de que acabe el anterior), en el orden de la lista.

#### Scenario: Infantil
- **WHEN** se crea «Infantil» con las sesiones 09:00–09:45, 09:45–10:30, 10:30–11:15, el recreo 11:15–12:00 y las sesiones 12:00–12:30, 12:30–13:15 y 13:15–14:00
- **THEN** la respuesta es `201` y la cuarta sesión dura 30 minutos

#### Scenario: Periodos inválidos
- **WHEN** se envían un periodo de 09:00 a 08:00, otro de 100 minutos y otro que empieza a las 10:00 cuando el anterior acaba a las 10:15
- **THEN** la respuesta es `400` con `INVALID_RANGE`, `TOO_LONG` y `OVERLAP` en cada uno de esos periodos y no se crea nada

#### Scenario: Recreos mal colocados y límites
- **WHEN** se envía un recreo al principio, al final o junto a otro, una novena sesión, un tercer recreo o ningún periodo de tipo sesión
- **THEN** la respuesta es `400` con `NOT_ALLOWED` en el `type` del recreo, `INVALID_LENGTH` o `REQUIRED` en `periods`

### Requirement: Cursos que siguen un calendario
`courseIds` MUST ser opcional y sin repetidos (`DUPLICATE` en `courseIds[<i>]` desde el segundo), con como mucho 100 elementos UUID (`INVALID_FORMAT` si no lo es). Cada curso MUST ser del colegio de la identidad: uno de otro colegio o que no existe MUST dar `400` con `NOT_FOUND` en `courseIds[<i>]` y MUST NOT crear nada. Un curso sigue como mucho un calendario: si ya seguía otro, MUST pasar al nuevo en la misma transacción. Los cursos MUST bloquearse con `FOR UPDATE` en orden de `id`, de modo que dos altas con cursos en común no se interbloqueen y el borrado o la edición de un curso a la vez terminen sin error de servidor.

#### Scenario: Asignar y mover cursos
- **GIVEN** «1º Primaria» siguiendo el calendario «Infantil»
- **WHEN** se crea «Primaria» con `courseIds` de «1º Primaria» y «2º Primaria»
- **THEN** «Primaria» lleva los dos cursos y, al listar, «Infantil» ya no lleva «1º Primaria»

#### Scenario: Curso de otro colegio o borrado
- **WHEN** se crea un calendario con un curso de otro colegio o con el de un curso borrado
- **THEN** la respuesta es `400` con `NOT_FOUND` en `courseIds[<i>]` y no se crea nada

#### Scenario: Alta a la vez que el borrado de su curso
- **WHEN** se crea un calendario con un curso a la vez que se borra ese curso, varias veces
- **THEN** el alta responde `201` o `400` con `NOT_FOUND`, el borrado `200`, y nunca hay un `500` ni un interbloqueo

### Requirement: Listado de calendarios con GET /api/calendars
`GET /api/calendars` MUST devolver los calendarios del colegio de la identidad ordenados por nombre con `compareText`, cada uno con sus periodos en orden y los cursos que lo siguen en orden natural, y `Cache-Control: no-store`. MUST NOT admitir paginación ni filtros (cualquier parámetro se ignora).

#### Scenario: Listado ordenado
- **GIVEN** los calendarios «Primaria» e «Infantil» y un calendario de otro colegio
- **WHEN** se piden los calendarios
- **THEN** la respuesta trae «Infantil» y «Primaria» en ese orden, con sus periodos y cursos, y no trae el del otro colegio

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

### Requirement: La API de los cursos no cambia
Las respuestas de `GET` y `POST /api/courses` y de `GET` y `PUT /api/courses/{id}` MUST NOT incluir el calendario del curso, y sus cuerpos de petición MUST NOT admitirlo. Borrar un curso MUST NOT tocar ningún calendario.

#### Scenario: Curso con calendario
- **GIVEN** un curso que sigue un calendario
- **WHEN** se pide `GET /api/courses`
- **THEN** el curso se devuelve con las mismas propiedades que antes de esta historia

### Requirement: Eventos de log de los calendarios
Un alta correcta MUST registrar `CALENDAR_CREATED` con `school_id`, `actor_id`, `calendar_id`, `session_count`, `break_count` y `course_count`. Un alta rechazada por el nombre o por un curso MUST registrar `CALENDAR_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate` o `course_not_found`). Una edición correcta MUST registrar `CALENDAR_UPDATED` con `school_id`, `actor_id`, `calendar_id`, `changed_fields` (lista con `name`, `periods` y `courses` según lo que cambió; vacía si nada cambió), `session_count`, `break_count`, `courses_added` y `courses_removed`. Una edición rechazada MUST registrar `CALENDAR_UPDATE_REJECTED` con `school_id`, `actor_id`, `calendar_id` y `reason` (`not_found`, `duplicate` o `course_not_found`). Los eventos MUST NOT llevar el nombre del calendario ni el de los cursos.

#### Scenario: Sin nombres en el log
- **WHEN** se crea «Primaria» con «1º Primaria» y después otra vez «Primaria»
- **THEN** se registran `CALENDAR_CREATED` y `CALENDAR_CREATION_REJECTED` con `reason: "duplicate"`, y el log no contiene «Primaria»

#### Scenario: Edición en el log
- **GIVEN** «Primaria» con «1º Primaria» y «2º Primaria»
- **WHEN** se renombra a «Primaria 1º ciclo», se quita «2º Primaria» y se añade «3º Primaria»
- **THEN** se registra `CALENDAR_UPDATED` con `changed_fields: ["name", "courses"]`, `courses_added: 1` y `courses_removed: 1`, y el log no contiene ningún nombre

### Requirement: Enlace a los calendarios en la navegación
La cabecera MUST mostrar «Calendario» hacia `/calendarios` a los dos roles, entre «Alumnos» y «Usuarios», con `aria-current="page"` en `/calendarios` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la cabecera muestra «Cursos», «Profesores», «Alumnos» y «Calendario», y no «Usuarios»

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

### Requirement: Página de creación de un calendario
`/calendarios/nuevo` MUST colgar de `RequireRole` con el rol `ADMIN` (un `MEMBER` va a `/onboarding`). El formulario (`CalendarForm`) MUST tener el nombre, un bloque «Generar sesiones» (hora de inicio, número de sesiones de 1 a 8, duración de 1 a 90 minutos y, opcionalmente, un recreo tras la sesión N con su duración) cuyo botón «Generar» sustituye la tabla de periodos por periodos contiguos, la tabla de periodos editable (inicio y fin de cada uno con `input type="time"`, «Añadir sesión», «Añadir recreo» y «Quitar» por fila) y «Cursos que siguen este calendario» (una casilla por curso del colegio; en los que ya siguen otro calendario, «Ahora sigue «X»: se moverá»). MUST arrancar con los periodos generados por defecto (09:00, 6 sesiones de 45 minutos, sin recreo). «Añadir sesión» y «Añadir recreo» añaden la fila al final, a continuación del último periodo, y el orden de las filas MUST ser el de la jornada: al guardar, antes de validar, la tabla MUST ordenarse por hora de inicio (y, a igualdad, por hora de fin) cuando todas las horas están bien escritas, de modo que un recreo que se ha movido a las 11:15 queda entre las dos sesiones que separa, se renumeran las sesiones y los errores salen en la fila que se ve; si alguna hora está vacía o mal escrita, se conserva el orden y se marcan esos errores. La ayuda de los periodos MUST decir que se ordenan por hora al guardar. MUST validar con las mismas reglas que el backend antes de enviar, con el error bajo su campo y el foco en el primero inválido, MUST enviar una sola vez aunque se pulse dos veces y MUST mostrar los errores del servidor en sus campos. Con el `201` MUST navegar a `/calendarios` con `replace` y `{ calendarCreated: nombre }`. Un `400` con `courseIds[<i>]` `NOT_FOUND` MUST volver a pedir los cursos conservando lo escrito; un `409` MUST marcar el nombre con el foco.

#### Scenario: Generar Primaria
- **GIVEN** 09:00, 6 sesiones, 45 minutos y un recreo de 30 minutos tras la sesión 3
- **WHEN** se pulsa «Generar»
- **THEN** la tabla queda 09:00–09:45, 09:45–10:30, 10:30–11:15, recreo 11:15–11:45, 11:45–12:30, 12:30–13:15 y 13:15–14:00

#### Scenario: Recreo añadido y colocado por hora
- **GIVEN** la jornada por defecto (seis sesiones de 45 minutos desde las 09:00 sin recreo)
- **WHEN** se pulsa «Añadir recreo» (la fila nueva queda la última, 13:30–14:00), se cambia a 11:15–11:45 y se pulsa «Guardar» con las sesiones 4 a 6 desplazadas a 11:45–12:30, 12:30–13:15 y 13:15–14:00
- **THEN** la tabla se reordena por hora, el recreo queda entre las sesiones 3 y 4, no hay error y se envía la jornada en ese orden

#### Scenario: Recreo que sigue fuera de lugar
- **GIVEN** la jornada por defecto y un recreo añadido sin cambiar sus horas (13:30–14:00)
- **WHEN** se pulsa «Guardar»
- **THEN** el recreo sigue el último, el error «Un recreo va entre dos sesiones» sale bajo su fila y no se envía nada

#### Scenario: Validación antes de enviar
- **WHEN** se intenta guardar con un recreo al final o una sesión de 100 minutos
- **THEN** el error sale bajo esa fila, el foco va a ella y no se envía nada

#### Scenario: Curso que se mueve
- **GIVEN** «1º Primaria» siguiendo «Infantil»
- **WHEN** se marca en el formulario de un calendario nuevo
- **THEN** se ve «Ahora sigue «Infantil»: se moverá»

### Requirement: Accesibilidad, responsive e i18n de los calendarios
Las páginas de calendarios MUST cumplir WCAG 2.1 AA: cada hora con una etiqueta accesible propia («Inicio de la sesión 1», «Fin del recreo 1»), los errores ligados por `aria-describedby`, sin violaciones de `axe` (listado, formulario con y sin errores) y sin desplazamiento horizontal a 360 px. Los textos MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado y el formulario con errores
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

### Requirement: Calendarios de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Primaria» generando las sesiones y verla en el listado con su resumen; crear «Infantil» editando a mano el recreo y la cuarta sesión; mover un curso de un calendario a otro; el nombre repetido; un `MEMBER` que ve los calendarios sin «Crear calendario» ni «Editar» y no puede abrir el alta ni la edición; el formulario a 360 px sin desplazamiento horizontal; y la edición: renombrar, mover el recreo, quitar una sesión, mover un curso desde otro calendario y liberar otro, el nombre repetido, «Guardar» deshabilitado sin cambios y el calendario que ya no existe.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `calendars.cy.ts`, también los de edición

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

