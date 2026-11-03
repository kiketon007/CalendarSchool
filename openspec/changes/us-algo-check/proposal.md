## Why

Antes de generar los horarios hay que saber si se puede, y hoy esa respuesta está repartida entre la carga de cada curso, el listado de reglas y el resumen de carga de los profesores. Además, dos cosas no las comprueba ninguna pantalla: si una asignatura cabe **con su profesor** (sus franjas prohibidas más las horas en que el profesor no puede) y qué pasa con las asignaturas **inactivas**. Es la historia **US-ALGO-CHECK** (`docs/User_Stories_MVP.md`, épica 7), la primera de la generación automática (PRD, generación de horarios; §3.2, máximo de 23 horas lectivas). Lo que lee y comprueba es lo que necesitará el motor (US-ALGO-RUN), que lo reutilizará antes de buscar.

## What Changes

- Una **«foto del problema»** del colegio, leída de una vez: cursos con su calendario y sus clases, sus asignaturas con la carga, el estado, las reglas y las franjas, quién da cada asignatura en cada clase y los tramos no disponibles de cada profesor.
- Una función pura que la comprueba y devuelve **bloqueantes** (no se puede generar) y **avisos** (se puede, pero el resultado puede no ser el esperado), con dieciséis códigos y sus referencias. Reutiliza `workloadWarnings`, `subjectWarnings`, `preferredSlotsWarnings`, `sessionGroupsOf` y `teachingLoadOf`, y añade la comprobación de una asignatura con su profesor y el aviso de las asignaturas inactivas, que no se generan y no cuentan en ninguna comprobación.
- Nuevo endpoint de solo lectura **`GET /api/schedule/readiness`** (`ADMIN` y `MEMBER`, aislado por colegio): `{ ready, blocking, warnings }`.
- Nueva página **`/horarios`** («Generar horarios») con la entrada «Horarios» en la navegación: dice si se puede generar y lista los bloqueantes y después los avisos, cada uno con su texto y un enlace a donde se corrige. El botón «Generar» llegará con US-ALGO-RUN.
- Sin cambios en el modelo de datos ni migraciones; sin códigos de error ni eventos de log nuevos.

## Capabilities

### New Capabilities
- `schedule-readiness`: la comprobación previa a generar los horarios (la foto del problema, los bloqueantes y los avisos, el endpoint, la página, la navegación, la accesibilidad y los E2E).

### Modified Capabilities

Ninguna.

## Impact

- **Contrato:** `docs/api-spec.yml` (operación `getScheduleReadiness` y esquemas `ScheduleReadiness`, `ReadinessIssue`, `ReadinessIssueCode`); se regeneran los tipos del frontend.
- **Backend:** un módulo nuevo `domain/schedule/` (el tipo de la foto, su puerto, `readinessOf` y la conversión de tramos a celdas), `PrismaSchedulingProblemRepository`, el caso de uso `GetScheduleReadiness` y un router `scheduleRouter` montado en `/schedule`.
- **Frontend:** servicio, página `ScheduleReadinessPage` en `/horarios`, la presentación de cada problema, la entrada en `AppHeader` e i18n (`schedule.readiness.*`).
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, el `CLAUDE.md` raíz, la arquitectura (el primer componente de la generación pasa a implementado) y la ficha.
- **Fuera de alcance:** el botón «Generar» y la generación (US-ALGO-RUN); corregir nada desde esta página; los solapes entre calendarios o entre varias asignaturas de un profesor en el mismo día (los resuelve el motor); las aulas; alinear la carga del curso y el resumen de carga con la regla de las inactivas (US-SUBJECT_d, después del MVP).
