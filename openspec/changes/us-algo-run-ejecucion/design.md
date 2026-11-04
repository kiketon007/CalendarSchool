## Context

`us-algo-run-motor` entrega, en `domain/schedule/`, `generationInputOf`, el puerto `ScheduleSolver` (con `BacktrackingSolver`) y `validateSchedule`, todo puro, más `readinessOf` de US-ALGO-CHECK. Este cambio los ejecuta: crea la generación, la corre en segundo plano, guarda el borrador y lo cuenta en pantalla. El backend actual es una Lambda de 1024 MB y 15 s detrás de un HTTP API (`lambda.ts`, `POOL_MAX = 2`), con `createApp()`/`composeApp()` recibiendo todo por parámetro y los repositorios de Prisma en `infrastructure/`. La búsqueda puede tardar hasta 120 s, así que no cabe en una petición.

## Goals / Non-Goals

**Goals:**
- Pulsar «Generar horarios» y obtener un borrador completo sin esperar con la petición abierta, con progreso, cancelación y errores explicados.
- Una sola generación en curso por colegio, garantizada por la base de datos, y un solo borrador por colegio, sustituido de forma atómica.
- Idempotencia frente a los reintentos de Lambda y recuperación de las generaciones atascadas.

**Non-Goals:**
- Ver, listar o exportar el horario (US-ALGO-VIEW); oficializar o descartar (US-ALGO-CONFIRM); preferencias (US-ALGO-RUN_b); OR-Tools; colas externas.

## Decisions

### D1. Una fila de generación y una Lambda asíncrona, sin cola
`POST /api/schedule/generate` inserta una fila `schedule_generations` en `QUEUED` y la lanza con `InvokeCommand` (`InvocationType: 'Event'`) a `ScheduleWorkerFunction`, y responde `202`. El estado vive en PostgreSQL y el frontend lo consulta. No hay BullMQ ni Redis: la fila es la cola y el índice único parcial `(school_id) WHERE status IN ('QUEUED','RUNNING')` es la exclusión mutua (D2).

Si el lanzamiento falla (permiso, red), el caso de uso marca la fila `FAILED` con `INTERNAL` en el momento y responde `500`; así no queda una generación `QUEUED` para siempre. Alternativa descartada: ejecutar el motor dentro de la Lambda de la API con una respuesta `202` anticipada: Lambda congela la ejecución al responder.

### D2. La exclusión mutua, en la base de datos
Un índice único parcial sobre `(school_id)` con `status IN ('QUEUED','RUNNING')`, escrito a mano en la migración (Prisma no lo expresa). `startGeneration` hace el `INSERT` y traduce la violación de unicidad (`P2002`) a `409 GENERATION_IN_PROGRESS`; no hace una lectura previa como protección (solo para dar el mensaje antes). Dos `POST` simultáneos: uno gana y el otro recibe `409`.

Antes del `INSERT`, `startGeneration` comprueba las **generaciones atascadas** del colegio (D7) para que un intento interrumpido no bloquee para siempre.

### D3. El worker: un manejador sin lógica y un caso de uso `runGeneration`
`scheduleWorker.ts` (como `lambda.ts`: fuera de cobertura, sin lógica) lee SSM, carga la configuración, compone con `composeApp` y exporta un manejador que recibe `{ generationId }` y llama a `runGeneration`. `composeApp` devuelve, además de `app`, el caso de uso `runGeneration`; el lanzador en memoria de local y de tests lo recibe por referencia tardía, así que no hay dependencia circular. Un único código de aplicación para los dos entornos.

`runGeneration(generationId)`:
1. **Reclama** la fila con `UPDATE … SET status='RUNNING', started_at=now(), heartbeat_at=now() WHERE id=$1 AND status='QUEUED'`. Si no afecta a ninguna fila (reintento de Lambda, cancelada antes de empezar), termina sin hacer nada: es la idempotencia que sustituye a los reintentos, que además se desactivan (D6).
2. Lee la foto del problema del colegio de la fila y ejecuta `readinessOf`; con bloqueantes termina en `FAILED/NOT_READY` (los datos pueden haber cambiado desde el `POST`).
3. Construye la entrada (`generationInputOf`), llama a `solver.solve(input, { limitMs, now, isCancelled, onProgress })` y valida con `validateSchedule` (el motor ya lo hace; aquí no se repite).
4. Según el resultado: `solved` → guarda (D4) y `COMPLETED`; `infeasible` → `FAILED/INFEASIBLE` con la causa estructurada; `timeout` → `FAILED/TIMEOUT`; `cancelled` → `CANCELLED`; una excepción → `FAILED/INTERNAL` con la traza solo en el log.

### D4. Guardar el borrador en una transacción que sustituye al anterior
`ScheduleRepository.replaceDraft(schoolId, generationId, entries, userId)` en **una transacción**: borra el `DRAFT` anterior del colegio (las entradas caen por `ON DELETE CASCADE`), inserta el `schedules` nuevo y sus entradas (por lotes), enlaza `schedule_generations.schedule_id` y marca la generación `COMPLETED`. Si algo falla, no queda nada a medias y el borrador anterior sigue ahí. Una generación fallida, cancelada o con `timeout` **no toca** el borrador anterior; los horarios `OFFICIAL` (US-ALGO-CONFIRM) nunca se tocan. El índice único parcial `(school_id) WHERE status='DRAFT'` en `schedules` lo garantiza.

Las entradas llevan `start_minute`/`end_minute` copiados del calendario de la generación: así el borrador no cambia si después se edita el calendario, y US-ALGO-VIEW lo pinta sin recalcular. `professor_id` es **nullable con `ON DELETE SET NULL`** (borrar un profesor deja el hueco sin profesor; el borrador es desechable y los diálogos de borrado no cuentan sus entradas). La clave única `(schedule_id, class_id, day_of_week, session_number)` es HC5; no hay clave única por profesor, porque HC2 es por intervalos y lo garantiza el validador.

### D5. Progreso, latido y cancelación sin machacar la base de datos
El motor informa con `onProgress(placed, total)`. El worker no escribe en cada llamada: guarda `placed`/`total` y refresca `heartbeat_at` como mucho cada 2 s (reloj inyectado), y en la misma escritura lee `cancel_requested`. `isCancelled()` devuelve el último valor leído, así que una cancelación se advierte en 2 s como mucho y no cuesta una consulta por nodo. `progress` en la respuesta es `round(100 · placed / total)`, de 0 a 100, y no baja porque el motor informa del máximo alcanzado.

`DELETE /api/schedule/generate/{id}`: si la generación está `QUEUED` o `RUNNING`, marca `cancel_requested = true` (y, si seguía `QUEUED`, la pasa a `CANCELLED` directamente, porque el worker no la reclamará) y responde `200` con la generación tal como está; el worker la lleva a `CANCELLED` al verlo. Si ya terminó, `409 GENERATION_NOT_CANCELLABLE`.

### D6. Infraestructura: segunda función, mismo código, sin reintentos
`ScheduleWorkerFunction` (`NodejsFunction` con otro punto de entrada, `scheduleWorker.ts`): **timeout de 5 minutos** (el límite del motor, 120 s por defecto, más margen) y **2 GB**, mismos secretos de SSM, misma base y mismas variables de entorno, con `SCHEDULE_MAX_SECONDS`. La función de la API recibe `lambda:InvokeFunction` solo sobre la del worker y el nombre de ésta como `SCHEDULE_WORKER_FUNCTION_NAME`. Las invocaciones asíncronas se reintentan por defecto dos veces: se configura **`retryAttempts: 0`** y la reclamación idempotente cubre el resto. `POOL_MAX` del worker sigue en 2 (una conexión para el progreso y otra para el guardado). Tests de la plantilla con `aws-cdk-lib/assertions`.

Alternativa descartada: AWS Step Functions o SQS: más infraestructura para una sola tarea de larga duración que ya tiene su estado en la base.

### D7. Generación atascada
Si la Lambda se interrumpe (timeout de 5 min, caída), la fila queda en `RUNNING` y bloquearía al colegio. Una generación `RUNNING` cuyo `heartbeat_at` es anterior a 90 s (dos veces el intervalo de latido más margen de arranque), o `QUEUED` de hace más de 90 s sin que el worker la haya reclamado, se considera atascada: al consultarla (`GET`) o al intentar generar (`POST`), se marca `FAILED` con `INTERNAL` y el mensaje «la generación se interrumpió». Es una transición condicional (`WHERE status IN (...) AND heartbeat_at < …`) para que dos lectores no se pisen.

### D8. Errores de la generación
`error_code` ∈ `NOT_READY | INFEASIBLE | TIMEOUT | INTERNAL`, con `error_message` (texto corto, en castellano, sin nombres propios más allá de lo que ya se mostrará en pantalla) y `error_details` (JSON): para `INFEASIBLE`, la causa del motor (`reason` y las referencias de la lección: curso, clase, asignatura y profesor, con id y nombre); para `NOT_READY`, nada (la pantalla vuelve a la comprobación). Los nombres van en `error_details` porque la pantalla los necesita para el enlace, pero **no** en los eventos de observabilidad. El mensaje de `INFEASIBLE` dice que la restricción señalada es **orientativa** salvo `NO_FREE_CELLS`. La traza de un `INTERNAL` solo va al log; la respuesta lleva el id de la generación para localizarla.

### D9. API
`Generation` en el contrato: `{ id, status, progress, placed, total, errorCode, errorMessage, errorDetails, scheduleId, createdAt, startedAt, finishedAt }` con `errorDetails` estructurado (`reason` y `lesson { course, class, subject, professor }` o `null`). `GET /api/schedule/generate` devuelve `{ generation: Generation | null }` (la que está en curso o, si no hay, la última del colegio) con `Cache-Control: no-store`; `GET /{id}` igual, `404` si no es del colegio o no es un UUID. `POST` y `DELETE` exigen `ADMIN` (`requireRole`); los `GET` los ven los dos roles. El colegio y el usuario salen siempre de la sesión.

### D10. Frontend
`scheduleGenerationService` (`start`, `current`, `get`, `cancel`) devuelve resultados por caso y nunca lanza, y valida la forma de la respuesta. `ScheduleGenerationPanel` se monta en `ScheduleReadinessPage` solo para `ADMIN` y sin bloqueantes; al montar pide la generación actual (`GET`) para retomar tras recargar. El sondeo cada 2 s es un temporizador encadenado (no `setInterval`) que se detiene al desmontar o al terminar y descarta respuestas tardías con un contador de peticiones; la barra es `role="progressbar"` con valor y texto «N de M sesiones» (no solo color). Sin nada en almacenamiento del navegador. Los textos van en `schedule.generation.*`.

### D11. Observabilidad y seguridad
Eventos `SCHEDULE_GENERATION_STARTED|COMPLETED|FAILED|CANCELLED` con `school_id`, `actor_id`, id de la generación, `placed`, `total`, duración y `error_code`, y **nunca** nombres de profesores, cursos ni asignaturas. Todas las consultas se filtran por el colegio de la sesión (o de la fila de la generación en el worker). Se añade `SCHEDULE_MAX_SECONDS` (por defecto 120, entero entre 5 y 240) a `loadConfig`.

### D12. La búsqueda del motor en un colegio sin huecos libres
En producción, un colegio de 6 cursos de 2 clases con 30 sesiones para 30 franjas agotó los 120 s: el motor colocaba 28 de 360 sesiones en 30 s. Con MRV puro y todos los empates por índice, llenaba la clase 1 entera antes de mirar las demás, agotaba a los especialistas compartidos y no veía el choque hasta muy tarde, y el backtracking cronológico no salía de ese mal comienzo (los tests de propiedades usaban un tercio de huecos libres, que lo ocultaban). Se añade **dom/wdeg** (la unidad con menos emplazamientos vivos por unidad de peso; el peso sube cada vez que se vacía el dominio de una unidad y se conserva entre reinicios; sin fallos todos pesan 1 y es MRV) y **reinicios**: tras 100 retrocesos se deshace todo y se vuelve a empezar con un límite ×1,5 y los valores en otro orden (generador con semilla fija: sigue siendo determinista). Un árbol agotado sigue demostrando `infeasible`, porque el límite crece sin tope. Resultado: ese colegio se resuelve en 0,5 s. Con 400 retrocesos de primer límite tardaba 25 s en una variante con tramos no disponibles; con 100, menos de 0,4 s. Queda sin resolver una combinación forzada (música en bloques de 2 y tramos no disponibles en todos los especialistas), de la que no se sabe si tiene solución: es el motivo de US-ALGO-ORTOOLS.

## Risks / Trade-offs

- **Dos Lambdas con el mismo código:** el empaquetado crece (el worker incluye el motor) pero evita una segunda base de código; se acepta.
- **Latencia del arranque en frío del worker:** hasta unos segundos antes de pasar a `RUNNING`; la pantalla muestra «en cola» hasta entonces y la detección de atascos tiene margen (90 s).
- **Pérdida de una generación si la Lambda muere:** se detecta por el latido y se puede repetir; el borrador anterior se conserva.
- **Hueco entre `INSERT` y `Invoke`:** si el proceso muere entre ambos, la fila queda `QUEUED` y la limpia D7.
- **El progreso es aproximado:** es el máximo de sesiones colocadas; una búsqueda puede estar mucho tiempo en el mismo valor.
- **Sin aislamiento entre colegios en la ejecución:** una generación larga ocupa una Lambda (concurrencia de la cuenta); el límite de tiempo y una sola generación por colegio acotan el riesgo.
- **Migración:** tablas nuevas, sin datos previos y sin impacto en las existentes; el despliegue ejecuta la migración antes que el código (el flujo actual).
