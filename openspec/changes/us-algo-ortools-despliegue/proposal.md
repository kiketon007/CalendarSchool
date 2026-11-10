## Why

`us-algo-ortools-motor` ya tiene el segundo motor de US-ALGO-ORTOOLS (`docs/User_Stories_MVP.md`, «US-ALGO-ORTOOLS concretada»; PRD §3.2, generación automática de horarios), pero solo se ejecuta como proceso hijo en local y en CI. El worker de Lambda (Node 24) no tiene Python, así que producción no puede usar `ORTOOLS`. Además, mientras CP-SAT busca la pantalla muestra «0 de N sesiones», porque CP-SAT no coloca las sesiones de una en una.

Este segundo cambio cierra la historia: despliega el motor en una Lambda de Python con imagen de contenedor, deja que cada despliegue elija el motor y muestra una barra indeterminada mientras busca OR-Tools.

## What Changes

- **Lambda de OR-Tools:**
  - `ScheduleOrToolsFunction` es una Lambda de Python 3.12 con imagen de contenedor (`solver-ortools/Dockerfile` y `handler.py`, que valida con `cli.validate` y llama a `solve`).
  - Va en x86_64, con 2 GB y 5 minutos, sin acceso a la base de datos ni a SSM.
  - Solo la puede invocar `ScheduleWorkerFunction`.
  - Se despliega siempre, aunque el motor sea `BACKTRACKING`.
- **`LambdaOrToolsTransport`** implementa `OrToolsTransport`:
  - Usa `InvokeCommand` con `RequestResponse`, sin reintentos del SDK y con el tiempo de la petición acotado.
  - Un `FunctionError`, o una respuesta que no es JSON, se rechaza, y `OrToolsSolver` pasa entonces a la alternativa.
  - Si se cancela, aborta la espera. La Lambda termina sola por el límite de CP-SAT (60 s), y su resultado se descarta.
- **Configuración por despliegue:**
  - El contexto de CDK `scheduleEngine` (`BACKTRACKING` por defecto) pasa `SCHEDULE_ENGINE` a la API y al worker.
  - `deploy.yml` lo toma de la variable del entorno `prod` de GitHub `SCHEDULE_ENGINE`, si existe.
  - El worker recibe además `SCHEDULE_ORTOOLS_FUNCTION_NAME`. Con ella, `createScheduleSolver` usa el transporte de Lambda; sin ella, el proceso hijo.
- **El motor de cada generación:**
  - `schedule_generations.engine` (`ScheduleEngine`, `BACKTRACKING` por defecto en la migración) se fija al crear la generación con el motor configurado.
  - Si se pasa a la alternativa, cambia: `SolveOptions.onEngine` lo avisa y `RunGeneration` lo escribe con el progreso.
  - Al guardar el borrador, `replaceDraft` deja en la generación el motor que lo encontró.
- **Contrato:** `Generation` gana `engine` (obligatorio, esquema nuevo `ScheduleEngine`: `BACKTRACKING | ORTOOLS`). No hay endpoints nuevos ni cambios en los errores.
- **Frontend:**
  - `scheduleGenerationService` valida `engine`.
  - Con `engine: 'ORTOOLS'` y `phase: 'SEARCHING'`, `ScheduleGenerationPanel` muestra el mismo texto, «Buscando un horario válido…», con una barra **indeterminada** con nombre y sin «N de M sesiones».
  - El motor no se muestra al administrador.

## Capabilities

### New Capabilities
<!-- Ninguna: lo nuevo amplía las dos capacidades del motor y de la generación. -->

### Modified Capabilities
- `ortools-solver`: el transporte por Lambda, el punto de entrada `handler.py` y su imagen, y el aviso `onEngine` al pasar a la alternativa.
- `schedule-generation`: `engine` en `Generation` (contrato) y en `schedule_generations`, la Lambda de OR-Tools en la infraestructura, `SCHEDULE_ENGINE` y `SCHEDULE_ORTOOLS_FUNCTION_NAME` en AWS, y la barra indeterminada del panel.

## Impact

- **Python:** `solver-ortools/` gana `handler.py`, `Dockerfile` y `.dockerignore`, con sus tests.
- **Backend:**
  - `infrastructure/aws/lambdaOrToolsTransport.ts` (nuevo), `createScheduleSolver.ts` y `config.ts`.
  - `domain/schedule/scheduleSolver.ts` (`onEngine`), `orToolsSolver.ts`, `generation.ts`, `generationRepository.ts` y `scheduleRepository.ts`.
  - `application/schedule/runGeneration.ts`, `startGeneration.ts` y `generationView.ts`.
  - Los repositorios Prisma de la generación y del horario.
  - Una migración: `schedule_generations.engine`.
- **Frontend:** `scheduleGenerationService.ts`, `ScheduleGenerationPanel.tsx`, `es.json` y `en.json`.
- **Contrato:** `docs/api-spec.yml` (`ScheduleEngine` y `Generation.engine`) y los tipos generados.
- **Infraestructura:**
  - `infrastructure/lib/appStack.ts` y su test, y `infrastructure/bin/app.ts` (contexto `scheduleEngine`).
  - `.github/workflows/deploy.yml`, que pasa el contexto.
  - El despliegue construye la imagen con Docker, que ya tiene el runner, y la publica en el repositorio de assets del *bootstrap* de CDK con su rol, que el rol de despliegue ya puede asumir.
- **Modelo de datos:** `schedule_generations.engine` en `MODELO_DATOS.md`.
- **Seguridad:**
  - La Lambda de Python no tiene URL, API ni permisos sobre la base de datos o SSM.
  - La petición solo lleva ids y números, sin datos personales.
- **Fuera de alcance:**
  - Que el administrador elija el motor.
  - Que CP-SAT optimice las preferencias.
  - Mostrar el motor en pantalla o en la exportación.
  - Lanzar los dos motores en paralelo.
  - Cambiar el motor por defecto.
  - Ejecutar OR-Tools en el E2E de Cypress.
  - Cancelar la Lambda de Python en curso, que no es posible en Lambda: termina por su límite.
