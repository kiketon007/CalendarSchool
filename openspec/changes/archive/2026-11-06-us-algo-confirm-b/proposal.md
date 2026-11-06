## Why

Desde US-ALGO-CONFIRM, confirmar un borrador sustituye al oficial vigente y el sustituido **se conserva** en la base, pero nadie puede verlo: `/horarios` solo cuenta cuántos hay (`previousCount`). US-ALGO-CONFIRM_b (`docs/User_Stories_MVP.md`, ficha enriquecida el 2026-11-05) lo cierra: el colegio lista sus horarios oficiales anteriores y abre cualquiera de ellos en solo lectura, para consultar cómo era el horario vigente en otro momento. Lo justifica el PRD (§3.2: el horario «oficial» del curso; §3.1: los miembros consultan lo que el administrador oficializa).

## What Changes

- **Listar los anteriores** (`GET /api/schedule/previous`, `ADMIN` y `MEMBER`): las cabeceras (`ScheduleSummary`) de los oficiales sustituidos del colegio, el sustituido más recientemente primero, con un tope de 100 y sin paginar.
- **Leer un oficial por id** (`GET /api/schedule/{id}`, `ADMIN` y `MEMBER`): el oficial vigente o uno sustituido del colegio, con la misma forma normalizada (`ScheduleDetail`) que el borrador y el oficial; cualquier otro id (borrador, otro colegio, inexistente o no UUID) responde `404`. El selector de lectura del repositorio se generaliza a `'draft' | 'official' | { id }`.
- **Frontend:** página nueva `/horarios/anteriores` con la lista; `/horarios/anteriores/:id` con la misma página del horario en un modo `previous` (insignia «Sustituido», «Confirmado el … por … · Sustituido el …», aviso «Se muestra con los datos de hoy…», tres vistas y «Exportar», sin acciones de escritura); el resumen del oficial de `/horarios` enlaza «Horarios anteriores (N)» si hay alguno; la exportación de un sustituido dice «Horario oficial confirmado el … · sustituido el …».
- Sin migraciones, sin escrituras, sin códigos de error nuevos y sin eventos de log.

**Fuera de alcance:** guardar una foto de los datos al sustituir (un anterior se ve con los nombres, colores y calendarios de hoy, y se avisa); revertir a un anterior; borrar anteriores o purgar el histórico; comparar dos horarios; paginar la lista; abrir un borrador por id.

## Capabilities

### New Capabilities

- `schedule-history`: la lista de los oficiales sustituidos y la lectura de un oficial por id (contrato, repositorio, casos de uso y rutas); la página de la lista y la página de un anterior en solo lectura.

### Modified Capabilities

- `schedule-confirmation`: el resumen del oficial en `/horarios` enlaza «Horarios anteriores (N)» cuando `previousCount` es mayor que 0.
- `schedule-export`: el documento de un oficial sustituido añade «· sustituido el …» a «Horario oficial confirmado el …».

## Impact

- **Backend:** `domain/schedule/scheduleRead.ts` (selector `{ id }` y `listPrevious`), `infrastructure/prisma/` (repositorio de lectura), `application/schedule/` (`GetSchedule` con id y `ListPreviousSchedules`), `presentation/schedule/scheduleRouter.ts` (dos rutas) y la raíz de composición.
- **Contrato y modelo:** `docs/api-spec.yml` (`GET /api/schedule/previous` y el `get` de `/api/schedule/{id}`) y los tipos generados. El modelo de datos no cambia.
- **Frontend:** `scheduleDraftService.getById`, `scheduleService.previous`, `pages/PreviousSchedulesPage.tsx`, el modo `previous` de `ScheduleDraftPage`, `OfficialScheduleSummary`, `utils/scheduleExport.ts`, rutas en `App.tsx` y textos en `es.json`/`en.json`; un E2E nuevo.
- **Infraestructura y dependencias:** sin cambios.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md`, `CLAUDE.md` (estado actual), `ARQUITECTURA_COMPLETA.md` (sección 0), la ficha y el resumen de la épica.
