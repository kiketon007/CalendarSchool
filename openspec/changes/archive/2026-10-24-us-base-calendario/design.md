## Context

- **Cursos como referencia:** `POST /api/courses` (US05) es el patrón de un registro padre con hijos ordenados creados en una transacción: `parseCreateCourseRequest` (Zod, reglas compartidas con el frontend por `test-fixtures/course-fields.json`), `cleanName`/`normalizeName` (`domain/course/courseNames.ts`), un `create` anidado y la traducción del índice único a `CourseAlreadyExists` (`409`) por su nombre (`violatedUniqueIndex`). El orden natural de los nombres es `compareText` (`Intl.Collator('es', { numeric: true, sensitivity: 'base' })`).
- **Roles:** `requireRole(role, logger)` responde `403 FORBIDDEN` con el evento `AUTHORIZATION_DENIED` (hoy solo lo usa `usersRouter`, en todas sus rutas); en el frontend, `RequireRole` lleva a `/onboarding`. Es la primera vez que un mismo recurso tiene lectura para los dos roles y escritura solo para `ADMIN`.
- **Cursos y bloqueos:** el borrado y la edición de un curso bloquean su fila `FOR UPDATE` (US07, US08); el alta y la edición de un alumno la bloquean `FOR SHARE` (US14, US17). `PrismaCourseRepository` lee los cursos con `select` explícitos (`LIST_FIELDS`, `EDIT_FIELDS`), así que una columna nueva no aparece en sus respuestas.
- **Decisiones de producto** (ficha de US-BASE, 2026-10-23): varios calendarios por colegio y cada curso en uno como mucho; asignación desde el formulario del calendario; solo estructura semanal, sin fechas ni estado; la ficha partida en tres.

## Goals / Non-Goals

**Goals:**

- Representar las dos jornadas de `Horarios.docx` (Primaria e Infantil) con calendarios de periodos editables uno a uno.
- Asignar cada curso a un calendario sin tocar la API ni las pantallas de cursos.
- Escritura solo para `ADMIN` y lectura para los dos roles, con el aislamiento por colegio de siempre.
- Las mismas reglas de validación en backend y frontend, con una tabla de casos compartida.

**Non-Goals:**

- Editar o borrar calendarios (US-BASE_b y US-BASE_c), fechas, estado, paginación, estructuras distintas por día, «calendario en uso» y su efecto en los horarios.

## Decisions

### 1. Modelo: periodos en una tabla aparte, horas en minutos y posición explícita

`calendars` (nombre y nombre normalizado, único por colegio) y `calendar_periods` (`position`, `kind` `SESSION`/`BREAK`, `start_minute`, `end_minute`). Las horas se guardan como **minutos desde las 00:00** en `SMALLINT` y la API las expone como `HH:MM`: Prisma mapea `TIME` a un `Date` con fecha y zona horaria, y comparar, sumar y validar minutos enteros es trivial y sin sorpresas. El orden del día es `position` (único por calendario); el número de sesión no se guarda, sale del orden entre las `SESSION`, así que quitar o mover un periodo (US-BASE_b) renumera sin escribir nada más. El `CHECK` (`0 <= start_minute`, `end_minute <= 1439`, `end_minute > start_minute`) se escribe a mano en la migración; el resto de reglas (solapes, máximos, posición del recreo) son de la aplicación.

*Alternativas descartadas:* columnas `TIME` (zona horaria y conversiones en Prisma); una fila por día de la semana como el modelo antiguo v2.1 (la estructura es igual de lunes a viernes, decisión de producto: cinco copias que mantener sincronizadas); una restricción de exclusión con `btree_gist` para los solapes (otra extensión de PostgreSQL para una regla que la aplicación ya valida antes de escribir).

### 2. Cursos: columna `courses.calendar_id` y no tabla intermedia

Un curso sigue como mucho un calendario: es una relación N:1 y la columna nula con `ON DELETE SET NULL` la expresa sin tabla extra (borrar un calendario en US-BASE_c deja los cursos «sin calendario» sin código). Las respuestas de cursos no cambian porque `PrismaCourseRepository` usa `select` explícitos; un test de integración lo fija.

*Alternativa descartada:* tabla `calendar_courses` con `UNIQUE (course_id)`: el mismo significado con una tabla y una unión más.

### 3. Contrato y códigos de campo

`CreateCalendarRequest { name, periods: [{ type, startTime, endTime }], courseIds? }` (sin propiedades adicionales, como el resto de cuerpos), `201 { calendar }` y `GET 200 { calendars }`. `Calendar { id, name, periods, courses: [{ id, name }], createdAt }`. Se añaden tres códigos de campo genéricos (`INVALID_RANGE`, `TOO_LONG`, `OVERLAP`) en lugar de forzar `INVALID_FORMAT` o `INVALID_LENGTH`, porque el frontend traduce la pareja campo-código y «La hora de fin debe ser posterior a la de inicio», «Un periodo no puede durar más de 90 minutos» y «Empieza antes de que acabe el periodo anterior» son mensajes distintos. `CALENDAR_ALREADY_EXISTS` se añade a `ErrorCode` y a `ERROR_CODES` a la vez.

### 4. Validación: parser con Zod y reglas de periodos puras y compartidas

`parseCreateCalendarRequest` (en `application/calendars/`) devuelve un `{ field, code }` por campo inválido en el orden `name`, `periods` (y cada `periods[<i>]` en orden: `type`, `startTime`, `endTime`) y `courseIds[<i>]`. Las reglas de la lista de periodos (convertir `HH:MM`, rango, duración máxima, solape con el anterior, máximo de sesiones y de recreos, posición del recreo) son una función pura del dominio (`domain/calendar/calendarPeriods.ts`) que el parser llama solo si cada periodo está bien formado; el frontend tiene su espejo en `validation/calendarValidation.ts`, y los dos recorren `test-fixtures/calendar-fields.json`. El nombre reutiliza las reglas y la limpieza del nombre de un curso.

### 5. Transacción y bloqueos en `PrismaCalendarRepository.create`

En un `$transaction`: (1) si hay `courseIds`, `SELECT id FROM courses WHERE id = ANY($ids) AND school_id = $school ORDER BY id FOR UPDATE` (`$queryRaw`); si falta alguno, se lanza `CourseNotFound` con sus posiciones y no se escribe nada; (2) `INSERT` del calendario (la violación de `calendars_school_id_normalized_name_key` se traduce a `CalendarAlreadyExists`); (3) `createMany` de los periodos con `position` desde 1; (4) `UPDATE courses SET calendar_id = $calendar WHERE id = ANY($ids)` (los que seguían otro calendario se mueven). Devuelve el calendario leído al final de la transacción, con sus periodos y cursos.

- **Sin ciclos de bloqueo:** los cursos se toman siempre en orden de `id`, así que dos altas con cursos en común se ordenan solas; el borrado y la edición de un curso toman solo ese curso (y después sus hijos, que el alta del calendario no toca), y el alta de un alumno lo toma en modo compartido. Gana quien bloquee primero; un curso borrado antes da `NOT_FOUND`.
- Los cursos se comprueban **antes** de insertar el calendario: un cuerpo con un curso inexistente y un nombre repetido responde `400` (es el primer fallo que se encuentra), como el alta de un alumno valida el curso antes de insertar.

### 6. Rutas y roles

`calendarsRouter` monta `requireAuthentication` en todas sus rutas y `requireRole('ADMIN', logger)` solo en `POST /`, antes del handler: un `MEMBER` recibe `403` sin que el caso de uso valide el cuerpo (un JSON roto sigue siendo `400 INVALID_JSON`, porque `express.json()` va antes en la aplicación). `GET /` no lleva `requireRole`. Los casos de uso reciben el colegio y el autor de la identidad.

### 7. Lectura y orden

`listBySchool` lee los calendarios con sus periodos (`orderBy: position`) y sus cursos (`{ id, name }`), y `ListCalendars` ordena calendarios y cursos con `compareText`. Sin paginación: un colegio tiene pocos calendarios.

### 8. Frontend

- `utils/calendarPeriods.ts` (puro): `generatePeriods({ start, sessionCount, duration, breakAfter?, breakDuration? })`, `sessionNumberOf`, `toMinutes`/`toClock` y `summaryOf` (sesiones al día, a la semana y minutos lectivos). Si los periodos generados pasan de las 23:59, la validación los marca como inválidos.
- `CalendarForm`: filas con una `key` estable (contador en una `ref`, como `CourseForm`), `input type="time"` (su valor es siempre `HH:MM`), etiquetas por fila («Inicio de la sesión 2», «Fin del recreo 1»), «Generar» que sustituye la tabla, y la lista de cursos con el aviso de los que se mueven, que cruza `coursesService.list` con `calendarsService.list`. Arranca con los valores por defecto ya generados. Se extrae del principio para que US-BASE_b lo reutilice (`initialValues`, `onSubmit`).
- **Orden de las filas = orden de la jornada:** el backend interpreta `periods` por orden (la posición decide qué sesión es la 3ª y si un recreo está entre dos sesiones), pero la tabla se edita por horas. Para que mover un recreo cambiando sus horas funcione, `CalendarForm` ordena las filas por hora de inicio (y de fin) al guardar, antes de validar, con una función pura `sortPeriods` en `utils/calendarPeriods.ts` (orden estable; solo si todas las horas están bien escritas, porque una hora vacía no se puede ordenar) y deja la tabla ordenada, así que las etiquetas («Sesión 4», «Recreo 1») y los errores por fila coinciden con lo que se ve. «Añadir recreo» sigue añadiendo al final. Alternativas descartadas: ordenar en cada pulsación (las filas saltan mientras se escribe) y botones «mover arriba/abajo» (más superficie de interfaz para el mismo resultado); el contrato y el backend no cambian.
- `CalendarsPage`: carga única, tarjetas (siempre: hay pocos calendarios y una tabla por calendario cabe a 360 px), «Crear calendario» solo para `ADMIN` (leído de la sesión: es una comodidad, decide el backend) y el aviso de llegada.
- `CreateCalendarPage` bajo `RequireRole role="ADMIN"`. `AppHeader` gana «Calendario» entre «Alumnos» y «Usuarios».

## Risks / Trade-offs

- **[La migración altera `courses`]** → columna nueva y nula, sin datos que migrar; `select` explícitos en el repositorio de cursos y un test que comprueba que sus respuestas no cambian.
- **[Interbloqueos con cursos]** → bloqueo en orden de `id` y tests de concurrencia (dos altas con cursos en común; alta contra borrado del curso).
- **[Reglas de periodos solo en la aplicación]** → tabla compartida entre backend y frontend; el `CHECK` cubre el mínimo en la base de datos.
- **[`input type="time"` según el navegador]** → el valor es siempre `HH:MM`; los tests comprueban el valor y no el aspecto.
- **[Desviación del PRD (fechas)]** → validada por la persona usuaria; el glosario del PRD se actualiza en este cambio.
- **Seguridad:** el colegio sale de la identidad; los cursos se comprueban dentro del colegio; la escritura exige `ADMIN` en el backend aunque el frontend oculte el botón.
- **Rendimiento:** pocas filas por colegio; el listado es una consulta con dos relaciones incluidas.

## Migration Plan

La migración `add_calendars` (dos tablas, un enum, una columna nula en `courses` con su índice y el `CHECK`) se aplica en el despliegue con `prisma migrate deploy`, antes de publicar el backend. Es aditiva: el backend anterior sigue funcionando con ella. Rollback: desplegar el commit anterior; las tablas y la columna se quedan sin usarse (no se deshacen migraciones en producción).

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha de US-BASE.
