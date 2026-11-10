## Context

**Estado actual:**
- La generación (US-ALGO-RUN y RUN_b) ejecuta `RunGeneration`. Este caso de uso reclama la fila, construye el `GenerationInput` con `generationInputOf` y llama a `ScheduleSolver.solve`.
- El único motor es `BacktrackingSolver`. Hace dos cosas: busca un horario válido (fase 1) y lo mejora con `improveSchedule` (fase 2).
- `RunGeneration` escribe el progreso, el latido y la marca de cancelación desde `saveIfDue`, como mucho cada 2 s. `saveIfDue` se dispara cuando el motor consulta `isCancelled()`.
- La entrada ya trae los emplazamientos de cada unidad sin las franjas prohibidas (HC8) ni los tramos no disponibles del profesor (HC4).
- `validateSchedule` comprueba HC1–HC8 sin conocer el motor. HC4 y HC8 ya vienen descontadas de los emplazamientos de cada unidad.

**Restricciones:**
- OR-Tools no tiene versión para Node.js.
- La máquina de desarrollo es Windows con Python 3.12; CI es `ubuntu-latest`.
- El worker de Lambda (Node 24) no tiene Python: llevarlo a AWS es el cambio `us-algo-ortools-despliegue`.
- La regla de diseño del proyecto pide que la búsqueda de restricciones (CSP) dure menos de 60 s y que la alternativa con backtracking no pase de 120 s.

**Decisiones de la persona usuaria** (`docs/User_Stories_MVP.md`, notas del 2026-11-09):
- Los dos motores conviven y cada despliegue elige con `SCHEDULE_ENGINE`; por defecto, `BACKTRACKING`.
- OR-Tools solo resuelve las restricciones duras, y después se aplica la mejora actual.
- Si OR-Tools falla, se usa el motor actual.
- Si no hay solución, el motor actual diagnostica la causa.
- El latido y la cancelación los lleva TypeScript, y Python no toca la base de datos.

## Goals / Non-Goals

**Goals:**
- Un modelo de CP-SAT, puro y determinista, que entregue horarios que `validateSchedule` acepta en todos los problemas de prueba.
- `OrToolsSolver` como un `ScheduleSolver` más: `RunGeneration` no cambia salvo para guardar `engine`.
- La espera es cancelable y mantiene el latido.
- La alternativa y el diagnóstico garantizan que activar `ORTOOLS` nunca da un resultado peor que `BACKTRACKING`: como mucho tarda más, y lo que tarda está acotado por `limitMs`.
- CI ejecuta el modelo y la equivalencia en cada PR.

**Non-Goals:**
- La Lambda de Python, la imagen y el despliegue (`us-algo-ortools-despliegue`).
- `engine` en `schedule_generations` y en la API.
- La barra indeterminada: en este cambio, con `ORTOOLS` en local, la barra se queda en «0 de N» mientras CP-SAT busca.
- Optimizar las preferencias en CP-SAT.
- Que el administrador elija el motor.

## Decisions

### D1. Python fuera de los workspaces, con un contrato JSON por `stdin` y `stdout`
`solver-ortools/` en la raíz contiene:
- `solver.py`: `solve(request: dict, should_stop: Callable[[], bool] | None = None) -> dict`, una función pura.
- `cli.py`: lee la petición de `stdin`, valida `version` y la forma, llama a `solve` y escribe la respuesta en `stdout`.
- `requirements.txt` (`ortools==<versión>`) y `requirements-dev.txt` (`-r requirements.txt`, `pytest` y `ruff`), con versiones fijadas.
- `pyproject.toml` (configuración de `ruff` y `pytest`), `tests/` y `README.md` con el contrato.

Al empezar se fija la última versión estable de `ortools` que tenga rueda para Windows x64 y Linux x64 con Python 3.12, comprobándolo con `pip download`.

**Alternativas descartadas:**
- **Un workspace de npm con un `package.json` envoltorio:** mezcla herramientas sin ganancia, y `npm test` no sabe ejecutar `pytest`.
- **Un servicio HTTP en local:** obliga a arrancar otro proceso en `npm run dev` y en los tests.
- **gRPC o protobuf:** demasiado para cuatro respuestas.

`cli.py` es la frontera que comparten el proceso hijo y la futura Lambda, y su `handler.py` del cambio siguiente solo llamará a `solve`.

### D2. Petición mínima y sin nombres
Petición:
```json
{ "version": 1, "limitSeconds": 60,
  "courses": [{ "id": "…", "cells": [{ "sessionNumber": 1, "startMinute": 540, "endMinute": 585 }] }],
  "lessons": [{ "index": 0, "courseId": "…", "classId": "…", "professorId": "…", "maxPerDay": 1, "blockSize": null }],
  "units": [{ "index": 0, "lessonIndex": 0, "size": 1, "placements": [{ "dayOfWeek": 1, "firstSession": 1 }] }] }
```
- **Fuera de la petición:** los nombres, las preferidas, la disponibilidad y las franjas prohibidas, porque las dos últimas ya están descontadas en `placements`.
- **Respuesta:** con `solved`, un emplazamiento por unidad (`unitIndex`, `dayOfWeek`, `firstSession`). TypeScript reconstruye las entradas con `entriesOfPlacements`, la misma función de `BacktrackingSolver`, de modo que la forma del horario no se escribe dos veces.

Una guarda de tipo (`isOrToolsResponse`, en `domain/schedule/orToolsTransport.ts`) comprueba lo siguiente:
- que `version` es 1;
- que hay un único emplazamiento por unidad, con índices en rango;
- que cada emplazamiento pertenece al dominio de su unidad.

Un emplazamiento fuera del dominio se trata como `bad_response`, porque HC4 y HC8 dependen del dominio y `validateSchedule` también lo detectaría.

### D3. El modelo de CP-SAT
Las variables son `x[u, p]` (booleanas), una por unidad y emplazamiento de su dominio.
- **HC1:** `AddExactlyOne(x[u, ·])`.
- **HC5 (clase, día y sesión):** para cada clase, día y sesión, `Add(sum(x que cubren esa celda) <= 1)`. Una unidad de tamaño `k` que empieza en `s` cubre las sesiones `s … s+k−1`.
- **HC2 (profesor y día):** un `NewOptionalFixedSizeIntervalVar` por cada `x[u, p]`, con el minuto de inicio de la primera celda y la duración hasta el fin de la última (las celdas de un bloque son seguidas y del mismo tramo), y `AddNoOverlap` por profesor y día. Los intervalos son semiabiertos, así que dos que solo se tocan no chocan, como en `validateSchedule`. Funciona aunque los cursos tengan calendarios distintos, porque se compara en minutos.
- **HC3 (lección y día):**
  - `b_d` es el número de unidades de bloque de la lección colocadas ese día, y `s_d` el de sueltas.
  - Sin bloque: `s_d <= maxPerDay`.
  - Con bloque: `b_d <= 1` y `s_d <= maxPerDay * (1 - b_d)`, porque, si hay bloque, no hay sueltas.
- **HC7:** para cada profesor, `Σ x[u, p] · minutos(u, p) ≤ 1380`, donde los minutos de un emplazamiento son lo que duran sus celdas (las sesiones de un calendario pueden durar distinto). La constante es la del dominio (`MAX_TEACHING_MINUTES`) y se repite en Python; un test del backend la compara con la del dominio. Sin esta restricción, un profesor con más de 23 horas de carga daría un horario que `validateSchedule` rechazaría, y se gastaría una alternativa sin necesidad.
- **HC4, HC6 y HC8:** no se modelan. HC4 y HC8 ya vienen descontadas de los emplazamientos, y HC6 se cumple porque cada lección lleva su profesor. `validateSchedule` las vuelve a comprobar en TypeScript.
- **Parámetros:** `num_workers = 8`, `random_seed = 0`, `max_time_in_seconds = limitSeconds`, sin objetivo, de modo que para en la primera solución factible. Para que sea determinista con varios hilos hace falta `interleave_search = True` (así lo indica la documentación de CP-SAT; el test de determinismo lo vigila) y construir el modelo en el orden de la entrada.
- **Cancelación:** `should_stop` se consulta desde un callback de solución. Antes de la primera solución, la cancelación la hace el proceso que llama (D4).
- **Estados:** `OPTIMAL` o `FEASIBLE` dan `solved`; `INFEASIBLE` da `infeasible`; `UNKNOWN` por tiempo da `timeout`; `MODEL_INVALID` termina con código distinto de 0.

**Alternativa descartada:** HC2 con restricciones por parejas de emplazamientos que se solapan. Crece de forma cuadrática en un colegio real, mientras que `AddNoOverlap` es lineal y lo propaga CP-SAT.

### D4. Espera cancelable desde TypeScript
`OrToolsSolver.solve(input, options)`:
1. Calcula `searchMs = min(ORTOOLS_LIMIT_MS, limitMs − transcurrido)`, con `ORTOOLS_LIMIT_MS = 60_000` (la regla CSP < 60 s), y construye la petición con `limitSeconds = searchMs / 1000`.
2. Llama a `transport.solve(request, signal)` y, mientras espera, ejecuta cada 500 ms un `setInterval` que llama a `options.isCancelled()`. En `RunGeneration`, esa llamada es la que dispara `saveIfDue`, que escribe el latido y lee la marca. Si devuelve `true`, `abort()`, y el resultado es `cancelled`.
3. Al terminar la espera, limpia el temporizador en un `finally`.

`ChildProcessOrToolsTransport` (`infrastructure/`) hace lo siguiente:
- `spawn(pythonPath, [scriptPath], { stdio: 'pipe', windowsHide: true })`;
- escribe el JSON y cierra `stdin`;
- acumula `stdout` y `stderr` (`stderr` con un tope de 4 kB, para el log);
- con un código distinto de 0, rechaza con `OrToolsProcessError`, sin el contenido de `stderr` en el mensaje que se guarda;
- con `signal` abortado, `child.kill()` y rechaza con `AbortError`;
- un tope de seguridad, `searchMs + 10 s`, mata el proceso si CP-SAT no respeta su límite, y rechaza como `invoke_error`.

`pythonPath` sale de `SCHEDULE_ORTOOLS_PYTHON` (`python3` por defecto; en esta máquina Windows también existe `python3`). `scriptPath` lo resuelve `loadConfig` como `path.resolve(process.cwd(), '../solver-ortools/cli.py')`, porque los scripts de npm del workspace se ejecutan con `cwd` en `backend/`. Solo `server.ts` llama a `loadConfig`, y `createApp` lo recibe ya resuelto.

**Alternativas descartadas:**
- **Que Python escriba el latido** (la decisión inicial): la persona usuaria la cambió al ver esta opción. Pedía credenciales de la base de datos en Python y dos sitios que escriben la generación.
- **Que TypeScript escriba el latido con su propio temporizador**, sin pasar por `isCancelled`: duplicaría `saveIfDue`.

### D5. Resultado compartido de los dos motores: `solvedOutcomeOf`
El tramo final de `BacktrackingSolver.solve` se extrae a `domain/schedule/solvedOutcome.ts`: desde «Fase 1 terminada» (las entradas a partir de los emplazamientos, `assertValid`, el presupuesto de la mejora, `SKIPPED` o `improveSchedule`, volver a validar y puntuar).

`solvedOutcomeOf(input, initialPlacements, engine, options, startedAt)` devuelve el `solved` con `engine`. `BacktrackingSolver` la llama con `'BACKTRACKING'` y `OrToolsSolver` con `'ORTOOLS'`. Su comportamiento no cambia, y los tests del motor y de la mejora lo garantizan.

`OrToolsSolver` valida antes de llamar a `solvedOutcomeOf`, con `validateSchedule` y no con `assertValid`, que lanza. Así, un horario inválido de OR-Tools pasa a la alternativa en lugar de terminar en `INTERNAL`.

`onProgress(total, total)` se llama una vez, antes de `solvedOutcomeOf`.

### D6. Diagnóstico y alternativa: `OrToolsSolver` recibe un `fallback: ScheduleSolver`
| Respuesta del transporte | Qué hace | `engine` |
|---|---|---|
| `solved` válido | `solvedOutcomeOf(…, 'ORTOOLS')` | `ORTOOLS` |
| `solved` inválido, `bad_response` o rechazo sin cancelar | `warn ortools_fallback {reason}` y `fallback.solve(input, { ...options, limitMs: restante })` | `BACKTRACKING` |
| `infeasible` | `fallback.solve(input, { ...options, limitMs: restante })`. Con `infeasible`, la causa; con `timeout`, `warn ortools_infeasible_undiagnosed`; con `solved` (ya mejorado si se pidió), `error ortools_infeasible_contradicted` | `BACKTRACKING` |
| `timeout` | `timeout` con `placed: 0` | — |
| `cancelled`, o cancelación vista en la espera | `cancelled` | — |

El diagnóstico se lanza con las mismas `options` (también `improve`). Si sale `infeasible` o `timeout`, la mejora no llega a ejecutarse. Si los motores se contradicen y sale `solved`, el horario ya viene mejorado como el de `BACKTRACKING`, sin exponer los emplazamientos de partida de `BacktrackingSolver`.

El `limitMs` restante se calcula con el `now` inyectado. El logger entra por el constructor (`Logger` del puerto existente), con `generation_id` en el contexto que pasa `RunGeneration` a `solve`: `SolveOptions` gana el campo opcional `logContext`.

**Alternativa descartada:** la alternativa en `RunGeneration`. Mezclaría el detalle de un motor en el caso de uso, y el puerto `ScheduleSolver` dejaría de ser suficiente.

### D7. Configuración y composición
`config.ts` gana:
- `SCHEDULE_ENGINE: z.enum(['BACKTRACKING', 'ORTOOLS']).default('BACKTRACKING')`;
- `SCHEDULE_ORTOOLS_PYTHON: z.string().min(1).default('python3')`;
- `scheduleOrToolsScript`, que no es una variable sino la ruta calculada.

`composeApp.ts`:
```ts
const backtracking = new BacktrackingSolver();
const solver = config.scheduleEngine === 'ORTOOLS'
  ? new OrToolsSolver({ transport: new ChildProcessOrToolsTransport(...), fallback: backtracking, logger })
  : backtracking;
```
`RunGeneration` recibe `engine` para el evento `SCHEDULE_GENERATION_STARTED` y guarda `outcome.engine` en `replaceDraft`. `.env.example` documenta las dos variables.

### D8. Modelo de datos
Una migración `ALTER TYPE "ScheduleEngine" ADD VALUE 'ORTOOLS'`, creada con `prisma migrate dev --create-only` y revisada a mano: no debe tocar los `CHECK` ni los índices parciales. En PostgreSQL 17, `ADD VALUE` es compatible con transacciones siempre que el valor nuevo no se use en la misma transacción, y la migración no lo usa. `schema.prisma` y `MODELO_DATOS.md` se actualizan.

`ScheduleDraft` (el puerto de `replaceDraft`) gana `engine`. `PrismaScheduleRepository` lo escribe en lugar del literal `BACKTRACKING`.

### D9. Pruebas
- **`pytest`** (`solver-ortools/tests/`): problemas mínimos escritos en Python para cada restricción, para `infeasible`, `timeout`, el determinismo, la versión desconocida y la forma inválida (`cli.py` como subproceso).
- **TypeScript unitario:**
  - `OrToolsSolver` con un `FakeOrToolsTransport` (respuesta fija, rechazo, promesa que no termina) y un reloj contado: cada fila de D6, el latido y la cancelación con temporizadores simulados (`vi.useFakeTimers`).
  - `solvedOutcomeOf`.
  - `isOrToolsResponse`.
  - `config`.
  - `composeApp`, en la parte que elige el motor.
- **Integración** (`orToolsSolver.int.test.ts`, con el proceso hijo real):
  - La equivalencia de D3 en `test-fixtures/schedule-generation.json`, el colegio de tamaño real y el colegio sin huecos libres.
  - Matar el proceso al abortar.
  - Un `RunGeneration` completo con `SCHEDULE_ENGINE=ORTOOLS` contra la base de test, que guarda `engine` `ORTOOLS` y en el que `heartbeat_at` avanza.

  Estos tests requieren Python con `ortools`. Si `python3 -c "import ortools"` falla, se saltan con un aviso en local y fallan en CI (`process.env.CI`), para no ocultar una CI mal configurada.
- **CI:** en el job `quality` se añaden `actions/setup-python@v5` (3.12, con caché de `pip`), `pip install -r solver-ortools/requirements-dev.txt`, `ruff check solver-ortools`, `ruff format --check solver-ortools` y `pytest solver-ortools`, antes de `npm test`. El job `e2e` no cambia.

## Risks / Trade-offs

- **[CP-SAT no es determinista con varios hilos si el orden de las variables cambia]** → `num_workers` y semilla fijos, `interleave_search = True` y el modelo construido en el orden de la entrada. El test de determinismo se repite 3 veces. Si fallara, `num_workers = 1` (más lento, pero determinista).
- **[Python no instalado o sin `ortools` en el equipo de alguien]** → `BACKTRACKING` es el valor por defecto. Con `ORTOOLS`, el fallo del proceso pasa a la alternativa con un `warn`. `README.md` explica la instalación.
- **[El proceso hijo se queda colgado]** → El tope de seguridad de D4 lo mata, y la cancelación lo mata en ~500 ms.
- **[Cambiar `BacktrackingSolver` al extraer `solvedOutcomeOf`]** → Es un refactor sin cambio de comportamiento, protegido por la tabla `schedule-generation.json`, la propiedad con semilla fija y la medición de la mejora, que se ejecutan antes y después.
- **[Con `ORTOOLS`, una generación imposible tarda hasta 60 s más]** → Acotado: el diagnóstico usa el tiempo restante de `limitMs`, que no se amplía. Es el precio de un motor más potente en los casos resolubles.
- **[Windows: `python3` puede ser el alias de la Microsoft Store]** → En esta máquina es Python 3.12 real. `SCHEDULE_ORTOOLS_PYTHON` permite apuntar a otro ejecutable, y el README lo indica.
- **[La barra se queda en «0 de N» con `ORTOOLS` en local]** → Es aceptable de forma transitoria, porque producción sigue con `BACKTRACKING`. La barra indeterminada llega con el cambio siguiente.

## Migration Plan

1. Mergear con `SCHEDULE_ENGINE` sin definir en todos los entornos. La migración solo añade un valor al enum y no reescribe filas.
2. Desplegar: el worker de Lambda sigue con `BACKTRACKING` y no cambia nada visible.
3. **Rollback:** revertir el código. El valor `ORTOOLS` del enum puede quedarse, porque PostgreSQL no permite quitarlo sin recrear el tipo y no hace daño. No hay horarios con `ORTOOLS` en producción.

## Open Questions

- ~~La versión exacta de `ortools`~~ Resuelta: `ortools==9.15.6755`, con rueda para Windows x64 y Linux x64 (`manylinux_2_28`) con Python 3.12 (comprobado con `pip download` el 2026-11-09). Exige `numpy>=2.0.2` y `protobuf>=6.33.1`, por eso va en un entorno virtual (`solver-ortools/.venv`) y no en el Python global.
- Si el determinismo con 8 hilos no se sostiene en el test, se usa `num_workers = 1` y se anota aquí.
