## Why

El resumen de carga (`/profesores/resumen`, US-PROF-SUMMARY) dice si un profesor cabe en las 23 horas lectivas, pero no de dónde sale el número: con varios calendarios, sesiones de distinta duración y tramos no disponibles, un «22 h 30 min – 25 h» o un «tiene 10 sesiones y solo puede dar 5» obligan a abrir otras tres pantallas para entenderlo. Es la historia **US-PROF-SUMMARY_b** (`docs/User_Stories_MVP.md`, épica 6), separada del resumen a petición de la persona usuaria: un detalle desplegable de un profesor, sin salir de la página. Se apoya en PRD §3.2 (máximo de 23 horas lectivas y disponibilidad de los profesores).

## What Changes

- `ProfessorLoad` gana **`calendars`**: el desglose de la carga por calendario (`{ calendar, sessions, available, minMinutes, maxMinutes }`, por nombre), calculado por el mismo `teachingLoadOf`. La suma de sus rangos es el rango del profesor. Solo en respuestas; ningún endpoint ni código de error nuevo.
- En `/profesores/resumen`, cada profesor con asignaciones tiene un botón **«Detalle»** que despliega, bajo su fila o dentro de su tarjeta:
  - sus asignaciones con sus sesiones y el rango de duración de las sesiones del calendario de su curso;
  - el desglose por calendario y el total;
  - su disponibilidad en una cuadrícula de solo lectura (`SlotGrid`), con un selector de calendario;
  - los avisos ampliados, cada uno con su explicación y un enlace a lo que lo resuelve.
- Un solo profesor desplegado a la vez; si un filtro lo oculta, se cierra.
- La disponibilidad del profesor y los calendarios se piden al desplegar, con `GET /api/professors/{id}/availability` y `GET /api/calendars` (este, una vez por visita), con su propio «Reintentar».
- Sin cambios en el modelo de datos ni migraciones.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities
- `professor-load-summary`: el resumen lleva el desglose por calendario y la página gana el detalle desplegable de un profesor con sus avisos ampliados.

## Impact

- **Contrato:** `docs/api-spec.yml` (`ProfessorLoadCalendar` y `ProfessorLoad.calendars`); se regeneran los tipos del frontend.
- **Backend:** solo el dominio (`teachingLoadOf` devuelve el desglose y `test-fixtures/teaching-load.json` lo fija) y el caso de uso, que lo pasa; ni el repositorio ni la ruta cambian.
- **Frontend:** `professorsSummaryService` (valida el desglose y que sume el total), un componente `ProfessorLoadDetail`, `ProfessorsSummaryPage` (el botón, el desplegado, la caché de calendarios y el cierre al filtrar) e i18n; reutiliza `SlotGrid`, `utils/professorAvailability`, `calendarsService` y `professorAvailabilityService`.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, el README (módulo 8) y la ficha y la fila de la épica.
- **Fuera de alcance:** la «timeline» del horario del profesor (necesita US-ALGO), editar la disponibilidad o las asignaciones desde el detalle, exportar a CSV y varios detalles abiertos a la vez.
