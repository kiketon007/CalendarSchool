## Why

El motor de horarios es hoy solo `BacktrackingSolver`, en TypeScript. US-ALGO-ORTOOLS (`docs/User_Stories_MVP.md`, sección «US-ALGO-ORTOOLS concretada»; PRD §3.2, generación automática de horarios) pide un segundo motor con OR-Tools (CP-SAT), más potente en colegios grandes o muy ajustados. Los dos motores conviven y cada despliegue elige cuál se lanza. OR-Tools no tiene versión para Node.js, así que el modelo se escribe en Python.

La historia es grande y se parte en dos cambios:
- **Este, `us-algo-ortools-motor`:** el motor de Python, que se ejecuta como proceso hijo, el adaptador `OrToolsSolver` con su alternativa y su diagnóstico, la elección del motor y CI. Se puede desplegar sin cambios visibles, porque producción sigue con `BACKTRACKING`.
- **`us-algo-ortools-despliegue`:** la Lambda de Python con imagen de contenedor, `engine` en la generación y en el contrato, y la barra indeterminada.

## What Changes

- **Motor de Python (`solver-ortools/`, en la raíz y fuera de los workspaces de npm):**
  - `solver.py` es puro: modela HC1, HC2, HC3, HC5 y HC7 en CP-SAT sobre los emplazamientos que ya calcula el backend (HC4 y HC8 vienen descontados, y HC6 se cumple porque cada lección lleva su profesor). No tiene función objetivo, es determinista (semilla y número de hilos fijos) y para en la primera solución, al agotar el tiempo o cuando se lo piden.
  - `cli.py` lee una petición JSON versionada de `stdin` y escribe la respuesta en `stdout`.
  - Dependencias fijadas, `pytest` y `ruff`.
- **`OrToolsSolver` (implementa `ScheduleSolver`):**
  1. Envía el `GenerationInput`, sin nombres, por un puerto `OrToolsTransport`. La implementación de este cambio es `ChildProcessOrToolsTransport`, que lanza `python cli.py`.
  2. Mientras espera, consulta `isCancelled()` cada 500 ms, de modo que `RunGeneration` sigue escribiendo el latido y leyendo la cancelación. Si se cancela, mata el proceso.
  3. Valida el resultado con `validateSchedule` y lo mejora con el mismo `improveSchedule` que `BacktrackingSolver`.
  4. Si CP-SAT dice `infeasible`, diagnostica la causa con `BacktrackingSolver` usando el tiempo que quede.
  5. Si el transporte falla, la respuesta no tiene la forma esperada o el horario no es válido, pasa a `BacktrackingSolver` (alternativa) y escribe un log de aviso.
- **El resultado `solved` dice qué motor produjo el horario (`engine`).** `RunGeneration` lo guarda en `schedules.engine`, y el enum `ScheduleEngine` gana `ORTOOLS` (migración). `SCHEDULE_GENERATION_STARTED` y `SCHEDULE_GENERATION_COMPLETED` llevan el motor.
- **Configuración:** `SCHEDULE_ENGINE` vale `BACKTRACKING` (por defecto) u `ORTOOLS`, y `SCHEDULE_ORTOOLS_PYTHON` es el ejecutable de Python del proceso hijo. Las dos se validan en `config.ts`. `composeApp.ts` construye el motor elegido.
- **Pruebas de equivalencia:** los problemas resolubles de `test-fixtures/schedule-generation.json`, el colegio de tamaño real y el colegio sin huecos libres se resuelven con los dos motores, y `validateSchedule` acepta los dos horarios. En los imposibles, los dos dicen `infeasible`.
- **CI:** `actions/setup-python`, la instalación de `solver-ortools/requirements-dev.txt`, `ruff check` y `pytest`, antes de los tests de integración del backend.

## Capabilities

### New Capabilities
- `ortools-solver`: el motor de CP-SAT en Python (modelo, contrato JSON y proceso hijo) y el adaptador `OrToolsSolver`, con la espera cancelable, la validación, la mejora, el diagnóstico de `infeasible` y la alternativa.

### Modified Capabilities
- `schedule-solver`: el resultado `solved` lleva `engine` y la mejora pasa a ser compartida, de modo que los dos motores la aplican igual.
- `schedule-generation`: la elección del motor por despliegue (`SCHEDULE_ENGINE`), `ORTOOLS` en `schedules.engine` y el motor en los eventos de observabilidad.

## Impact

- **Backend:**
  - Dominio, en `domain/schedule/`: `scheduleSolver.ts`, `backtrackingSolver.ts`, el nuevo `orToolsSolver.ts` y el puerto `orToolsTransport.ts`.
  - Infraestructura: el nuevo `infrastructure/childProcessOrToolsTransport.ts` y `infrastructure/config.ts`.
  - Aplicación y composición: `application/schedule/runGeneration.ts` y `composeApp.ts`.
  - Datos: `prisma/schema.prisma` y una migración que añade un valor al enum.
- **Python:** `solver-ortools/` (nuevo).
- **Frontend:** sin cambios.
- **Contrato:** `docs/api-spec.yml` sin cambios, porque la API no expone el motor.
- **Modelo de datos:** `ScheduleEngine` gana `ORTOOLS`, y se actualiza `MODELO_DATOS.md`.
- **Infraestructura:** sin cambios en AWS. Producción sigue con `BACKTRACKING`, y en este cambio el worker de Lambda no puede usar `ORTOOLS` porque no tiene Python. CI gana Python.
- **Documentación:**
  - `README.md`: Python 3 y `pip install` en la instalación.
  - `backend/CLAUDE.md` y `solver-ortools/README.md`: el contrato JSON.
  - `ARQUITECTURA_COMPLETA.md`: el motor alternativo, como implementado en local.
- **Fuera de alcance:**
  - Llevado a `us-algo-ortools-despliegue`: la Lambda de Python, su imagen y su despliegue; `engine` en `schedule_generations` y en el contrato; la barra indeterminada del panel.
  - Descartado en la historia: que el administrador elija el motor; que CP-SAT optimice las preferencias; mostrar el motor en pantalla; lanzar los dos motores en paralelo; cambiar el motor por defecto; ejecutar OR-Tools en el E2E de Cypress.
