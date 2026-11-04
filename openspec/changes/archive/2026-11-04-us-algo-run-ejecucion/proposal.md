## Why

`us-algo-run-motor` deja un motor puro que sabe colocar las sesiones, pero nadie lo ejecuta: falta la pieza que lo lanza desde la pantalla, lo hace en segundo plano (una petición HTTP no pasa de unos 30 s y la búsqueda puede tardar minutos), guarda el borrador y cuenta cómo va (US-ALGO-RUN, `docs/User_Stories_MVP.md`; PRD §3.2). Este es el **segundo de los dos cambios** en que se partió la historia, y depende de los tipos y del puerto `ScheduleSolver` del primero.

## What Changes

- **Contrato:** `POST /api/schedule/generate`, `GET /api/schedule/generate`, `GET /api/schedule/generate/{id}` y `DELETE /api/schedule/generate/{id}` (tag `Schedule`), el esquema `Generation` y tres códigos de error nuevos, `SCHEDULE_NOT_READY`, `GENERATION_IN_PROGRESS` y `GENERATION_NOT_CANCELLABLE`.
- **Modelo de datos:** tres tablas, `schedules` (borrador u oficial; como mucho un `DRAFT` por colegio), `schedule_entries` (una fila por sesión colocada, sin aula ni rol) y `schedule_generations` (una fila por intento, con un índice único parcial: una generación en curso por colegio).
- **Ejecución en segundo plano sin cola:** el `POST` crea la fila `QUEUED`, lanza de forma asíncrona una segunda Lambda (`ScheduleWorkerFunction`, 5 minutos y 2 GB) y responde `202`; el worker reclama la fila con una actualización condicional (idempotente), repite la comprobación previa, ejecuta el motor, valida, y guarda el horario en una transacción que **sustituye** al borrador anterior. Progreso y latido sin escribir en cada paso; cancelación por marca en la fila; generaciones atascadas detectadas por el latido.
- **Errores explicados:** `NOT_READY`, `INFEASIBLE` (con la lección y la restricción como datos estructurados), `TIMEOUT` e `INTERNAL` (la traza solo va al log).
- **Pantalla:** `/horarios` gana, para el administrador y sin bloqueantes, el botón «Generar horarios» y un panel de generación (progreso accesible, cancelar, resumen y error por código con enlaces), con sondeo cada 2 s.
- **Observabilidad:** eventos `SCHEDULE_GENERATION_STARTED|COMPLETED|FAILED|CANCELLED` sin nombres de profesores, cursos ni asignaturas.
- **Infraestructura:** la función del worker, el permiso `lambda:InvokeFunction` de la API sobre ella y `retryAttempts: 0`.

## Capabilities

### New Capabilities
- `schedule-generation`: la generación de horarios en segundo plano: endpoints, ciclo de vida de una generación, el borrador guardado, la cancelación, los errores, la seguridad y la pantalla que la lanza y la sigue.

### Modified Capabilities
- Ninguna: el botón y el panel de generación son comportamiento nuevo de `schedule-generation` que se monta en la página existente, sin cambiar ningún requisito de `schedule-readiness`.

## Impact

- **Backend:** `application/schedule/` (`startGeneration`, `runGeneration`, `getGeneration`, `cancelGeneration`), puertos `GenerationRepository`, `ScheduleRepository` y `GenerationLauncher` en `domain/schedule/`, repositorios Prisma y `LambdaGenerationLauncher` en `infrastructure/`, `scheduleWorker.ts` (manejador sin lógica, fuera de cobertura), rutas en `presentation/schedule/scheduleRouter.ts`, `composeApp.ts` y `SCHEDULE_MAX_SECONDS` en `config.ts`.
- **Base de datos:** una migración de Prisma con tres tablas, índices únicos parciales y `CHECK` escritos a mano; `MODELO_DATOS.md` actualizado.
- **Contrato:** `docs/api-spec.yml` y los tipos generados; `appError.ts` (`ERROR_CODES`).
- **Frontend:** `services/scheduleGenerationService.ts`, `components/ScheduleGenerationPanel`, `ScheduleReadinessPage` y `schedule.generation.*` en `es.json` y `en.json`.
- **Infraestructura:** `appStack.ts` (función del worker, permiso de invocación, variables de entorno) y su test de plantilla.
- **Dependencia:** `@aws-sdk/client-lambda` en el backend.
- **Fuera de alcance:** ver, listar o exportar el horario (US-ALGO-VIEW), oficializarlo, descartarlo y los diálogos de borrado que cuentan entradas (US-ALGO-CONFIRM), las preferencias SC1–SC4 (US-ALGO-RUN_b), OR-Tools (US-ALGO-ORTOOLS), aulas y rol `REFUERZO` (eliminados), colas externas (BullMQ/Redis).
