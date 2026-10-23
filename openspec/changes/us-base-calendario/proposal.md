## Why

US-BASE (`docs/User_Stories_MVP.md`, épica 5, PRD §3.5 «Generación de horarios»: «estructura horaria definida (sesiones de 45 minutos, periodos de patio)» y «horarios diferenciados para Infantil y Primaria») es la base de todo el bloque de horarios: la disponibilidad de los profesores (US-PROF-AVAIL), las restricciones (US19) y el motor de generación necesitan saber qué sesiones tiene cada día. Hoy el colegio no puede describir su jornada, y el documento de partida (`Horarios.docx`) tiene dos estructuras distintas (Primaria e Infantil) que ningún modelo del proyecto puede representar.

## What Changes

- **Calendarios base por colegio:** un colegio crea varios calendarios (p. ej. «Primaria» e «Infantil»), cada uno con un nombre único en el colegio y una lista ordenada de periodos (sesiones y recreos con su hora de inicio y fin), iguales de lunes a viernes. De 1 a 8 sesiones, de 0 a 2 recreos entre sesiones, cada periodo de 90 minutos como máximo y sin solapes.
- **Cursos que siguen cada calendario:** al crear un calendario se marcan los cursos que lo siguen; un curso sigue como mucho uno (`courses.calendar_id`, nulo, `ON DELETE SET NULL`) y marcarlo en otro lo mueve. La API y las pantallas de cursos no cambian.
- `POST /api/calendars` (solo `ADMIN`: `403 FORBIDDEN` para un `MEMBER`) crea el calendario con sus periodos y las asignaciones en una transacción; `GET /api/calendars` (los dos roles) los lista con sus periodos y cursos.
- Nuevo código de error `CALENDAR_ALREADY_EXISTS` (`409`) y tres códigos de campo genéricos: `INVALID_RANGE`, `TOO_LONG` y `OVERLAP`.
- Frontend: enlace «Calendario» en la cabecera para los dos roles; `/calendarios` (listado en solo lectura para el `MEMBER`, con el total de sesiones al día, a la semana y los minutos lectivos) y `/calendarios/nuevo` (solo `ADMIN`) con un formulario que genera las sesiones a partir de hora de inicio, número, duración y recreo, y permite editarlas a mano una a una.
- Eventos `CALENDAR_CREATED` y `CALENDAR_CREATION_REJECTED`, sin nombres.
- Migración `add_calendars`: tablas `calendars` y `calendar_periods` y la columna `courses.calendar_id`.

Decisiones validadas por la persona usuaria (2026-10-23) y recogidas en la ficha de US-BASE: varios calendarios por colegio, asignación desde el formulario del calendario, solo estructura semanal (sin fechas ni estado; cambia el glosario del PRD) y la ficha partida en tres (crear y ver, editar y borrar).

**Fuera de alcance:** editar (US-BASE_b) y borrar (US-BASE_c) un calendario; fechas, curso académico y estado; «calendario en uso» y marcar horarios como `NEEDS_REVIEW` (no existen horarios); paginación; estructuras distintas por día de la semana; asignar el calendario desde las pantallas de cursos; avisar de los cursos sin calendario; y cualquier uso de los calendarios por el motor de generación.

## Capabilities

### New Capabilities

- `school-calendars`: calendarios base del colegio (modelo, reglas de los periodos, asignación a los cursos, contrato, acceso solo `ADMIN` para escribir, eventos y las páginas de listado y alta).

### Modified Capabilities

- `api-error-handling`: los códigos de campo admiten `INVALID_RANGE`, `TOO_LONG` y `OVERLAP`, y se añade el conflicto `CALENDAR_ALREADY_EXISTS`.

## Impact

- **Contrato:** `docs/api-spec.yml` (`createCalendar`, `listCalendars`, `CreateCalendarRequest`, `Calendar`, `CalendarPeriod`, `CALENDAR_ALREADY_EXISTS` y los códigos de campo nuevos). Tipos del frontend regenerados.
- **Modelo de datos:** migración `add_calendars` (dos tablas, una columna nueva y nula en `courses` y un `CHECK` escrito a mano). Compatible hacia atrás con los cursos.
- **Backend:** dominio `calendar`, casos de uso `CreateCalendar` y `ListCalendars`, `PrismaCalendarRepository`, `calendarsRouter` (con `requireRole('ADMIN')` en el `POST`), `errorHandler`, `appError.ts` y la raíz de composición.
- **Frontend:** `calendarsService`, `calendarValidation` (tabla compartida `test-fixtures/calendar-fields.json`), `utils/calendarPeriods.ts`, `CalendarForm`, `CalendarsPage`, `CreateCalendarPage`, rutas, `AppHeader`, i18n y E2E.
- **Documentación:** `MODELO_DATOS.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, estándares, `README.md`, arquitectura y el glosario del PRD.
