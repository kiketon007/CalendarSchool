## ADDED Requirements

### Requirement: Contrato de los calendarios en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/calendars` (`createCalendar`) y `GET /api/calendars` (`listCalendars`), con seguridad Bearer, y los esquemas `CreateCalendarRequest` (`name` y `periods` obligatorios, `courseIds` opcional, sin más propiedades), `CalendarPeriod` (`type`: `SESSION` o `BREAK`, `startTime` y `endTime` en `HH:MM`), `Calendar` (`id`, `name`, `periods`, `courses` como lista de `{ id, name }` y `createdAt`) y sus respuestas. `POST` MUST declarar `201` (`{ calendar: Calendar }`), `400`, `401`, `403`, `409`, `500` y `503`; `GET`, `200` (`{ calendars: Calendar[] }`), `401`, `500` y `503`. La descripción de `POST` MUST decir que es solo para `ADMIN`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCalendar` y `listCalendars`
- **THEN** las dos exigen Bearer y declaran las respuestas indicadas, y `createCalendar` declara `403`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones y los esquemas `CreateCalendarRequest`, `Calendar` y `CalendarPeriod`

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
`GET /api/calendars` MUST exigir sesión (`401` sin ella) y estar abierto a `ADMIN` y `MEMBER`. `POST /api/calendars` MUST exigir sesión y el rol `ADMIN` (`requireRole`): un `MEMBER` MUST recibir `403 FORBIDDEN` sin que se valide el cuerpo ni se cree nada, con el evento `AUTHORIZATION_DENIED`. El colegio MUST salir siempre de la identidad y no admitirse en el cuerpo.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** pide el listado y luego intenta crear un calendario
- **THEN** recibe `200` y `403 FORBIDDEN`, y no se crea nada

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los dos sin token
- **THEN** la respuesta es `401`

### Requirement: La API de los cursos no cambia
Las respuestas de `GET` y `POST /api/courses` y de `GET` y `PUT /api/courses/{id}` MUST NOT incluir el calendario del curso, y sus cuerpos de petición MUST NOT admitirlo. Borrar un curso MUST NOT tocar ningún calendario.

#### Scenario: Curso con calendario
- **GIVEN** un curso que sigue un calendario
- **WHEN** se pide `GET /api/courses`
- **THEN** el curso se devuelve con las mismas propiedades que antes de esta historia

### Requirement: Eventos de log de los calendarios
Un alta correcta MUST registrar `CALENDAR_CREATED` con `school_id`, `actor_id`, `calendar_id`, `session_count`, `break_count` y `course_count`. Un alta rechazada por el nombre o por un curso MUST registrar `CALENDAR_CREATION_REJECTED` con `school_id`, `actor_id` y `reason` (`duplicate` o `course_not_found`). Los eventos MUST NOT llevar el nombre del calendario ni el de los cursos.

#### Scenario: Sin nombres en el log
- **WHEN** se crea «Primaria» con «1º Primaria» y después otra vez «Primaria»
- **THEN** se registran `CALENDAR_CREATED` y `CALENDAR_CREATION_REJECTED` con `reason: "duplicate"`, y el log no contiene «Primaria»

### Requirement: Enlace a los calendarios en la navegación
La cabecera MUST mostrar «Calendario» hacia `/calendarios` a los dos roles, entre «Alumnos» y «Usuarios», con `aria-current="page"` en `/calendarios` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la cabecera muestra «Cursos», «Profesores», «Alumnos» y «Calendario», y no «Usuarios»

### Requirement: Página de listado de calendarios
`/calendarios` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir la lista una sola vez (también con `StrictMode`) con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. MUST mostrar una tarjeta por calendario con su nombre como `h2`, sus periodos en orden («Sesión 1 · 09:00–09:45», «Recreo · 11:15–11:45»), el resumen «N sesiones al día · 5×N a la semana · M minutos lectivos al día» (los recreos no cuentan) y los cursos que lo siguen o «Sin cursos asignados». El botón «Crear calendario» MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar los calendarios». Sin calendarios MUST mostrar «Todavía no hay calendarios». MUST leer del estado de la navegación, con una guarda de tipo, `{ calendarCreated: <texto no vacío> }` y mostrar «Calendario «X» creado» como texto plano en un `role="status"`.

#### Scenario: Calendario con cursos
- **GIVEN** «Primaria» con seis sesiones de 45 minutos, un recreo y los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se abre `/calendarios`
- **THEN** su tarjeta muestra los siete periodos, «6 sesiones al día · 30 a la semana · 270 minutos lectivos al día» y «1º Primaria, 2º Primaria»

#### Scenario: Según el rol
- **WHEN** un `MEMBER` abre `/calendarios`
- **THEN** ve los calendarios, no ve «Crear calendario» y ve «Solo los administradores pueden crear y modificar los calendarios»

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
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real: crear «Primaria» generando las sesiones y verla en el listado con su resumen; crear «Infantil» editando a mano el recreo y la cuarta sesión; mover un curso de un calendario a otro; el nombre repetido; un `MEMBER` que ve los calendarios sin «Crear calendario» y no puede abrir el alta; y el formulario a 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de `calendars.cy.ts`
