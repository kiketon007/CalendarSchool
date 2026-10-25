## Why

Hoy un calendario base solo se puede crear (US-BASE): si cambia la jornada de un colegio (se mueve el recreo, se añade una sesión) o hay que reasignar cursos, la única salida sería crear otro calendario con otro nombre, porque aún no se puede borrar. US-BASE_b (`docs/User_Stories_MVP.md`) permite editar un calendario existente. Lo justifica el PRD (§3.1: el administrador gestiona el calendario base y el miembro no lo configura; §3.6: los horarios se generan sobre él; y el glosario: el calendario base es la jornada semanal), y conviene hacerlo antes de las asignaturas y las restricciones, que se apoyarán en calendarios ya ajustados.

## What Changes

- `GET /api/calendars/{id}` (`ADMIN` y `MEMBER`) devuelve un calendario del colegio; `404 NOT_FOUND` si no es UUID, no existe o es de otro colegio.
- `PUT /api/calendars/{id}` (solo `ADMIN`, `403` para un `MEMBER` antes de validar nada) recibe el **estado final** `{ name, periods, courseIds? }` con las mismas reglas que el alta: renombra (`409 CALENDAR_ALREADY_EXISTS` si otro calendario usa el nombre), **reemplaza** los periodos y deja los cursos de `courseIds` en este calendario (moviéndolos desde otro) y los que lo seguían y ya no están, **sin calendario**. Gana el último guardado. Todo en una transacción con bloqueos en orden.
- Eventos `CALENDAR_UPDATED` y `CALENDAR_UPDATE_REJECTED`, sin nombres.
- Frontend: enlace «Editar» en cada tarjeta de `/calendarios` solo para `ADMIN`, página `/calendarios/:id/editar` (bajo `RequireRole role="ADMIN"`) que reutiliza `CalendarForm` con valores iniciales, «Guardar» solo con cambios reales y el aviso «Se quedará sin calendario» bajo los cursos que se desmarcan; aviso «Calendario «X» actualizado» al volver.
- Sin migraciones ni códigos de error nuevos (`NOT_FOUND` con la respuesta reutilizable `CalendarNotFound`).

**Fuera de alcance:** borrar un calendario (US-BASE_c), detectar conflictos entre ediciones (validado: gana el último), «calendario en uso» y horarios `NEEDS_REVIEW` (no existen horarios), historial de cambios, duplicar calendarios, asignar el calendario desde las pantallas de cursos y estructuras distintas por día.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-calendars`: se añaden la lectura de un calendario, su edición por `PUT`, las reglas de cursos liberados y movidos, el acceso de cada rol a las dos operaciones nuevas, sus eventos de log, el enlace «Editar» del listado, la página de edición y sus E2E; cambian el contrato en OpenAPI, la página de listado (enlace y aviso de edición), el acceso y los eventos de log.

## Impact

- **Contrato (`docs/api-spec.yml`):** `getCalendar`, `updateCalendar`, `UpdateCalendarRequest` y la respuesta `CalendarNotFound`; tipos regenerados del frontend.
- **Backend:** `domain/calendar` (`CalendarNotFound`, puerto con `findById` y `update`), `application/calendars` (`GetCalendar`, `UpdateCalendar`, `parseCalendarId`, `parseUpdateCalendarRequest`), `PrismaCalendarRepository`, `calendarsRouter`, `errorHandler`, composición y dobles de test.
- **Frontend:** `calendarsService` (`get`, `update`), `calendarValidation` (`hasCalendarChanges`), `CalendarForm` (modo edición), `EditCalendarPage`, `CalendarsPage`, `App.tsx`, i18n y el E2E de calendarios.
- **Modelo de datos:** sin cambios (las tablas de US-BASE bastan). **Infraestructura:** sin cambios.
