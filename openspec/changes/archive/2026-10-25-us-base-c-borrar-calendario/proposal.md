## Why

Con US-BASE y US-BASE_b un colegio puede crear y editar sus calendarios base, pero no quitar los que ya no usa (por ejemplo, uno de prueba o el de un ciclo que desaparece), así que el listado y el formulario de cursos acumulan calendarios muertos. US-BASE_c (`docs/User_Stories_MVP.md`) cierra el CRUD con el borrado. Lo justifica el PRD (§3.1: el administrador gestiona el calendario base y el miembro no lo configura; §3.6: los horarios se generan sobre los calendarios que siguen en vigor).

## What Changes

- `DELETE /api/calendars/{id}` (solo `ADMIN`, con `403` para un `MEMBER` antes de leer el `id`): borra de verdad el calendario y sus periodos; los cursos que lo seguían quedan **sin calendario**, sin borrarse. Responde `200` con `{ deleted: { id, courseCount } }`, el recuento hecho con los cursos bloqueados; `404 NOT_FOUND` (respuesta `CalendarNotFound`) sin distinguir otro colegio, inexistente o ya borrado.
- Bloqueo del calendario y después de sus cursos en orden de `id`, como el alta y la edición, sin interbloqueos.
- Evento `CALENDAR_DELETED` sin nombres.
- Frontend: botón «Borrar {nombre}» en cada tarjeta de `/calendarios` solo para `ADMIN` y `DeleteCalendarModal`, que usa los datos de la tarjeta (no pide nada) y dice qué cursos se quedarán sin calendario; al confirmar, la lista se actualiza sin volver a pedirla, con el aviso del recuento real y el foco en el título.
- Sin migraciones ni códigos de error nuevos.

**Fuera de alcance:** papelera o deshacer, borrar varios a la vez, impedir el borrado de un calendario con cursos (validado: se permite), «calendario en uso» y horarios `NEEDS_REVIEW` (no existen horarios) y borrar desde la página de edición.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-calendars`: se añaden el borrado por `DELETE`, sus efectos en los cursos, el diálogo de confirmación y lo que hace el listado tras borrar; cambian el contrato en OpenAPI, el acceso de cada rol, los eventos de log, la página de listado (botón «Borrar»), la accesibilidad y los E2E.

## Impact

- **Contrato (`docs/api-spec.yml`):** `deleteCalendar` y `DeleteCalendarResponse`; tipos regenerados del frontend.
- **Backend:** puerto `CalendarRepository` (`delete`), `application/calendars` (`DeleteCalendar`), `PrismaCalendarRepository`, `calendarsRouter`, composición y dobles de test.
- **Frontend:** `calendarsService` (`delete`), `DeleteCalendarModal`, `CalendarsPage`, i18n y el E2E de calendarios.
- **Modelo de datos:** sin cambios (la cascada de los periodos y el `SET NULL` de los cursos existen desde US-BASE). **Infraestructura:** sin cambios.
