## Why

US-ALGO-CHECK dice si un colegio está listo para generar, pero todavía no hay nada que genere: falta el motor que coloque cada sesión cumpliendo las restricciones duras (US-ALGO-RUN, `docs/User_Stories_MVP.md`; PRD §3.2, generación automática de horarios). La historia es grande (13 puntos) y se parte en dos cambios: este, **el motor y el validador puros**, que se pueden probar a fondo sin base de datos ni infraestructura, y `us-algo-run-ejecucion`, que los ejecuta en segundo plano y los muestra en pantalla. Además, la exploración del 2026-11-03 decidió avisar antes de generar de los cursos con menos carga que franjas, cuyos huecos quedarán vacíos.

## What Changes

- **Aviso nuevo en la comprobación previa:** `WORKLOAD_BELOW_SLOTS` (curso con calendario y asignaturas activas cuya carga es menor que sus franjas: «quedarán N huecos libres»). Es un aviso, no impide generar. Cambia el contrato (`ReadinessIssueCode`), `readinessOf`, la tabla de casos y la página `/horarios` (texto y enlace a la carga del curso).
- **Entrada del motor:** `generationInputOf(problem)` convierte la foto del problema de US-ALGO-CHECK en las sesiones a colocar (por clase y asignatura **activa** con profesor), con las celdas del calendario de cada curso en minutos y los dominios ya filtrados por las franjas prohibidas y la disponibilidad del profesor.
- **Motor:** el puerto `ScheduleSolver` y su implementación `BacktrackingSolver` (backtracking con *forward checking*, la variable más restringida primero, poda de simetrías y límite de tiempo y cancelación inyectables). Devuelve un horario o `infeasible` con una causa explicable, `timeout` o `cancelled`. Determinista.
- **Validador:** `validateSchedule(input, entries)`, puro e independiente del motor, que comprueba HC1–HC8 y devuelve las violaciones. El motor nunca entrega un horario que no lo pase.
- **Numeración de las restricciones duras** (ya corregida en la especificación): HC1 carga exacta, HC2 un profesor en un solo sitio (por intervalos de hora), HC3 reparto diario y bloques, HC4 disponibilidad, HC5 una asignatura por clase y hueco, HC6 profesor de la asignación, HC7 máximo de 23 horas y HC8 franjas prohibidas.

## Capabilities

### New Capabilities
- `schedule-solver`: la entrada del motor, el motor de restricciones duras (`ScheduleSolver`/`BacktrackingSolver`) y el validador `validateSchedule`, puros y sin E/S.

### Modified Capabilities
- `schedule-readiness`: un aviso nuevo, `WORKLOAD_BELOW_SLOTS`, en el contrato, en `readinessOf` y en la página (pasan a 8 avisos y 17 códigos).

## Impact

- **Backend:** `domain/schedule/` (`generationInput.ts`, `scheduleSolver.ts`, `backtrackingSolver.ts`, `validateSchedule.ts` y `readiness.ts`). Sin cambios en aplicación, infraestructura ni presentación: el motor aún no se invoca desde ninguna ruta.
- **Frontend:** `scheduleReadinessService` (`WARNING_CODES`), `ReadinessIssueItem` y los textos `schedule.readiness.issues.WORKLOAD_BELOW_SLOTS_*`.
- **Contrato:** `docs/api-spec.yml` (un valor más en `ReadinessIssueCode`) y los tipos generados. Sin endpoints nuevos.
- **Modelo de datos:** sin cambios (las tablas del horario llegan con `us-algo-run-ejecucion`).
- **Infraestructura:** sin cambios.
- **Tablas de casos:** `test-fixtures/schedule-readiness.json` (casos del aviso nuevo) y `test-fixtures/schedule-generation.json` (nueva).
- **Fuera de alcance:** ejecución en segundo plano, tablas `schedules`, `schedule_entries` y `schedule_generations`, endpoints de generación, Lambda del worker y pantalla de generación (`us-algo-run-ejecucion`); preferencias SC1–SC4 (US-ALGO-RUN_b); ver el horario (US-ALGO-VIEW); oficializar (US-ALGO-CONFIRM); OR-Tools (US-ALGO-ORTOOLS); aulas y rol `REFUERZO` (eliminados).
