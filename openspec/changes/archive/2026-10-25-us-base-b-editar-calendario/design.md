## Context

- **US-BASE (archivada el 2026-10-24)** dejó `calendars` y `calendar_periods` (minutos desde medianoche, `position` único por calendario, `CHECK` de los minutos), `courses.calendar_id` (nulo, `ON DELETE SET NULL`), `POST` y `GET /api/calendars`, `parseCreateCalendarRequest` con la tabla compartida `test-fixtures/calendar-fields.json`, `PrismaCalendarRepository.create` (cursos `FOR UPDATE` en orden de `id`), `calendarsRouter` con `requireRole('ADMIN')` solo en el `POST`, y en el frontend `CalendarForm` (generador, filas editables ordenadas por hora al guardar con `sortPeriods`, cursos con «Ahora sigue «X»: se moverá»), `CalendarsPage` y `CreateCalendarPage`.
- **Patrón de edición:** US07 (cursos) y US17 (alumnos). El `id` se valida en el router (`parseStudentId` lanza el error de «no encontrado» si no es UUID) antes que el cuerpo; el `PUT` recibe el estado final y reutiliza el parser del alta; el puerto `update` devuelve cómo era y cómo quedó, para el evento sin una segunda lectura; el `404` usa el código común `NOT_FOUND` con una respuesta reutilizable (`CourseNotFound`, `StudentNotFound`) y el error de dominio se traduce en `errorHandler`. En el frontend, `requireChanges` deshabilita «Guardar» según lo que se enviaría, y la página de edición carga una vez con `StrictMode` y muestra «no existe o ya no está disponible» ante un `404`.
- **Decisiones de producto** (ficha de US-BASE_b, 2026-10-25): gana el último guardado; un curso desmarcado queda sin calendario, avisado bajo el curso y sin diálogo.

## Goals / Non-Goals

**Goals:**

- Editar nombre, periodos y cursos de un calendario con las mismas reglas que el alta, solo para `ADMIN`, con lectura para los dos roles.
- Una edición atómica y sin interbloqueos con el alta, otras ediciones y el borrado de cursos.
- Reutilizar `CalendarForm` sin duplicar validación ni maquetación.

**Non-Goals:**

- Borrar calendarios (US-BASE_c), control de versión o aviso de conflictos, historial, «calendario en uso», horarios `NEEDS_REVIEW`, duplicar calendarios y estructuras por día.

## Decisions

### 1. Contrato: dos operaciones sobre `/api/calendars/{id}` y ningún código nuevo

`getCalendar` (`200 { calendar }`) y `updateCalendar` (cuerpo `UpdateCalendarRequest`, que es la misma forma que `CreateCalendarRequest` declarada aparte para que cada operación tenga su nombre en los tipos generados; `200 { calendar }`). El `404` es `NOT_FOUND` con la respuesta reutilizable `CalendarNotFound`, como `CourseNotFound` y `StudentNotFound`. Alternativa descartada: un código `CALENDAR_NOT_FOUND`; rompería la convención y obligaría a tocar `ErrorCode`, `ERROR_CODES` y `api-error-handling` sin beneficio para el cliente, que ya distingue el recurso por la ruta.

### 2. Dominio y aplicación

- `domain/calendar/calendarErrors.ts` gana `CalendarNotFound`. El puerto `CalendarRepository` gana `findById(schoolId, id): Promise<Calendar | null>` y `update(schoolId, id, changes, courseIds): Promise<{ before: Calendar; after: Calendar } | null>` (`null` si el calendario no es del colegio), con `changes` igual a `NewCalendar` sin `id`.
- `GetCalendar` convierte `null` en `CalendarNotFound`.
- `parseUpdateCalendarRequest` delega en `parseCreateCalendarRequest` (mismas reglas y mismo orden de errores; la tabla compartida sigue siendo la fuente).
- `UpdateCalendar`: parsea el cuerpo (un `400` no toca el repositorio ni registra nada, como en el alta), llama a `update`, convierte `null` en `CalendarNotFound` con `CALENDAR_UPDATE_REJECTED` (`not_found`), `CalendarCoursesNotFound` en el `400` de `courseIds[<i>]` (`course_not_found`) y `CalendarAlreadyExists` en el `409` (`duplicate`). Con éxito calcula `changed_fields` comparando `before` y `after` (nombre exacto, periodos por tipo y minutos, conjunto de ids de cursos) y `courses_added`/`courses_removed` como diferencias de conjuntos, y devuelve `after` con los cursos ordenados por `compareText`.
- `parseCalendarId` en `presentation/calendars/` (como `parseStudentId`): un `id` que no es UUID lanza `CalendarNotFound` y el router lo valida antes de llamar al caso de uso. El `PUT` monta `requireRole('ADMIN')` antes, así que el orden es rol → `id` → cuerpo → calendario → cursos → nombre.

### 3. Transacción y bloqueos en `PrismaCalendarRepository.update`

Dentro de `$transaction`:

1. `SELECT id FROM calendars WHERE id = $1 AND school_id = $2 FOR UPDATE`. Si no hay fila, `null` antes de tocar nada (un calendario inexistente gana a un curso inexistente).
2. Leer el calendario como era (`before`) con sus periodos y cursos.
3. `SELECT id FROM courses WHERE school_id = $2 AND (id = ANY($3) OR calendar_id = $1) ORDER BY id FOR UPDATE`: la unión de los pedidos y de los que lo siguen hoy, en orden de `id`. Si falta alguno de los pedidos, `CalendarCoursesNotFound` con sus posiciones.
4. `update` del nombre y del nombre normalizado (la violación de `calendars_school_id_normalized_name_key` se traduce en `CalendarAlreadyExists` por `violatedUniqueIndex`; el propio calendario no choca consigo mismo porque es la misma fila).
5. `deleteMany` de sus periodos y `createMany` de los nuevos con `position` desde 1 (el índice único no choca porque se borra antes, dentro de la misma transacción).
6. `updateMany` de los que lo seguían y ya no están (`calendar_id = NULL`) y de los pedidos (`calendar_id = id`).
7. Releer (`after`).

- **Sin ciclos de bloqueo:** el alta bloquea solo cursos, en orden de `id`; la edición bloquea su calendario y después cursos, en el mismo orden; dos ediciones de calendarios distintos bloquean calendarios distintos y después cursos ordenados; el borrado de un curso bloquea solo ese curso. Ninguna transacción espera por un calendario mientras retiene un curso.
- **Gana el último:** dos ediciones del mismo calendario se serializan en el paso 1; la segunda lee el estado que dejó la primera y lo reemplaza entero, así que nunca queda una mezcla.
- **Alternativa descartada:** actualizar los periodos fila a fila conservando sus `id`. Nada los referencia hoy, exige casar filas sin identidad en la API y mover posiciones sin chocar con el índice único; reemplazarlos es más simple y atómico. Cuando los horarios referencien sesiones, el motor de generación decidirá cómo tratarlas.

### 4. Rutas y roles

`GET /:id` con solo `requireAuthentication` (montado ya en el router) y `PUT /:id` con `requireRole('ADMIN')` delante, como el `POST`. Las dos con `no-store` (lo pone `noStore` a toda la API).

### 5. Frontend

- `calendarsService.get(authorizedFetch, id)` (`loaded`, `notFound`, `unauthenticated`, `unavailable`) y `update(authorizedFetch, id, input)` (`updated`, `validationError`, `alreadyExists`, `notFound`, `forbidden`, `unauthenticated`, `unavailable`), con el `id` codificado, validando la forma de la respuesta y sin lanzar nunca.
- `validation/calendarValidation.ts` gana `hasCalendarChanges(initial, current)`: compara el nombre limpio (recortado y con los espacios colapsados, como el backend), los periodos tras `sortPeriods` (tipo e inicio y fin) y el conjunto de cursos.
- `CalendarForm` gana dos props opcionales que el alta no usa: `initialValues` (`{ name, periods, courseIds }`, leídos solo al montar: el estado inicial de las filas sale de ahí, con las `key` de un contador, y los cursos que ya seguían el calendario son los de `initialValues.courseIds`, de donde sale el aviso «Se quedará sin calendario») y `requireChanges`; `followedBy` excluye este calendario, así que sus cursos no avisan de moverse. El alta conserva la jornada por defecto cuando no hay `initialValues`. **Mientras los cursos cargan o han fallado, el formulario de edición envía los `courseIds` iniciales sin tocarlos** (si enviara una lista vacía, guardar dejaría al calendario sin cursos sin que nadie lo haya pedido) y los casos de «Guardar» sin cambios cuentan sobre esa lista.
- `pages/EditCalendarPage.tsx` bajo `RequireRole role="ADMIN"`: pide el calendario, los cursos y los calendarios una vez cada uno (una `ref` del intento pedido para `StrictMode`, como `EditStudentPage`), monta el formulario con `key` del intento cuando el calendario llega, traduce cada resultado del `update` como dice la spec y navega a `/calendarios` con `replace` y `{ calendarUpdated }`.
- `CalendarsPage` añade «Editar» (un `Link` con clases `btn`, `aria-label` «Editar {nombre}») en cada tarjeta si el rol es `ADMIN` y lee `calendarUpdated` con la misma guarda de tipo que `calendarCreated`.

## Risks / Trade-offs

- **[Se pierde la edición de otra persona]** → aceptado por la persona usuaria (gana el último); el estado final nunca es una mezcla (bloqueo de la fila del calendario y reemplazo completo).
- **[Interbloqueos]** → orden fijo (calendario, después cursos por `id`) y tests de concurrencia contra el alta, otra edición y el borrado de un curso.
- **[Los `id` de los periodos cambian en cada edición]** → hoy nada los referencia; queda anotado para el motor de generación.
- **[Un curso queda sin calendario al desmarcarlo]** → intencionado y avisado bajo el curso.
- **[`CalendarForm` crece con props de edición]** → props opcionales con el alta como caso por defecto, y tests de los dos modos.
- **Seguridad:** el colegio sale de la identidad; el calendario y los cursos se filtran por colegio en las consultas de bloqueo; la escritura exige `ADMIN` antes de leer nada; el `404` no distingue un calendario de otro colegio.
- **Rendimiento:** una edición toca un calendario, como mucho 10 periodos y unos pocos cursos; la lectura por `id` es una consulta con dos relaciones.

## Migration Plan

Sin migraciones. Despliegue normal (el paso `prisma migrate deploy` no aplicará nada). Vuelta atrás: revertir la PR; no deja datos que limpiar.

## Open Questions

Ninguna.
