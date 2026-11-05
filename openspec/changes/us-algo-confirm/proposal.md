## Why

Hoy el colegio genera, ve y exporta un horario borrador, pero no puede decir cuál es **el** horario vigente: cada generación sustituye al borrador y nada queda como referencia para el curso. US-ALGO-CONFIRM (`docs/User_Stories_MVP.md`, ficha enriquecida el 2026-11-05) lo resuelve: el administrador confirma el borrador como horario oficial (o lo descarta) y todo el colegio consulta y exporta un único oficial vigente. Lo pide el PRD (§3.2: «El administrador puede guardar/validar un horario como "oficial" para el curso»; §3.1: la oficialización es del administrador y los miembros la ven).

## What Changes

- **Base de datos:** `schedules` gana `confirmed_at`, `confirmed_by_id` y `replaced_at`, con `CHECK` y un índice único parcial: un solo `OFFICIAL` vigente (sin `replaced_at`) por colegio. El oficial sustituido **se conserva**.
- **Confirmar** (`POST /api/schedule/{id}/confirm`, solo `ADMIN`): promueve el borrador a oficial en su sitio y marca como sustituido el oficial anterior, en una transacción. `404` si el borrador ya no existe (otro administrador regeneró), `409 SCHEDULE_NOT_DRAFT` si ya no es borrador.
- **Descartar** (`DELETE /api/schedule/{id}`, solo `ADMIN`): borra el borrador y sus entradas; un oficial no se borra (`409`).
- **Leer el oficial** (`GET /api/schedule/official`) y **resumen** (`GET /api/schedule/overview`: borrador, oficial y cuántos anteriores), para los dos roles. La lectura del borrador se generaliza a cualquier horario vigente y su esquema pasa a `ScheduleDetail` con los datos de confirmación.
- **Frontend:** la página del borrador se generaliza para `/horarios/oficial` («Oficial», «Confirmado el … por …», tres vistas y «Exportar»); «Confirmar como oficial» y «Descartar el borrador» (solo `ADMIN`, con diálogos) en `/horarios/borrador` y en el resumen de la generación; el resumen del oficial arriba de `/horarios`; el panel de generación enlaza según lo que sea hoy su horario; la exportación del oficial dice «Horario oficial confirmado el …».
- Código de error nuevo `SCHEDULE_NOT_DRAFT`; eventos `SCHEDULE_CONFIRMED`, `SCHEDULE_DRAFT_DISCARDED` y sus rechazos.

**Fuera de alcance:** la lista y la vista de los horarios anteriores (US-ALGO-CONFIRM_b); revertir a un oficial anterior; editar un horario a mano; borrar un oficial; varios borradores a la vez; el aviso general de borrador desfasado; notificar a los profesores; enlaces al oficial desde `/cursos` o `/profesores`.

## Capabilities

### New Capabilities

- `schedule-confirmation`: confirmar el borrador como horario oficial y descartarlo; el oficial vigente y los sustituidos en la base; la lectura del oficial y el resumen de los horarios; la página del oficial, los diálogos y el resumen en `/horarios`.

### Modified Capabilities

- `schedule-draft-view`: el contrato de la lectura (`ScheduleDetail`, con `OFFICIAL` y los datos de confirmación), el servicio que la valida y la página del borrador, que ofrece «Confirmar como oficial» y «Descartar el borrador» a un `ADMIN`.
- `schedule-generation`: el estado «completada» del panel enlaza según lo que sea hoy el horario de esa generación (borrador, oficial o ya no existe) y ofrece «Confirmar como oficial».
- `schedule-export`: el documento de un horario oficial dice «Horario oficial confirmado el …» en lugar de «Borrador generado el …».

## Impact

- **Backend:** migración Prisma (columnas, `CHECK` e índice escritos a mano); dominio y casos de uso en `domain/schedule/` y `application/schedule/` (`ConfirmSchedule`, `DiscardScheduleDraft`, `GetSchedule`, `GetScheduleOverview`); repositorio Prisma; rutas en `presentation/schedule/scheduleRouter.ts`; `ERROR_CODES`.
- **Contrato y modelo:** `docs/api-spec.yml` (tres rutas nuevas, `ScheduleDetail`, `ScheduleSummary`, `SCHEDULE_NOT_DRAFT`) y los tipos generados; `docs/Modelo_de_Datos/MODELO_DATOS.md`.
- **Frontend:** servicios, la página del horario, dos diálogos, el resumen del oficial, el panel, la exportación, rutas en `App.tsx` y textos en `es.json`/`en.json`; un E2E nuevo.
- **Infraestructura y dependencias:** sin cambios.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md`, `ARQUITECTURA_COMPLETA.md` (sección 0), la ficha y el resumen de la épica.
