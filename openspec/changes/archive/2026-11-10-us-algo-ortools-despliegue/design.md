## Context

**Estado tras `us-algo-ortools-motor`** (en la misma rama base, sin integrar en `main`):
- `OrToolsSolver` (`domain/schedule/`) envía el problema por el puerto `OrToolsTransport` y lo resuelve CP-SAT en `solver-ortools/` (`solver.py` puro y `cli.py` por `stdin` y `stdout`).
- Cuando falla, pasa al motor actual. Cuando CP-SAT dice `infeasible`, el motor actual busca la causa.
- El único transporte es `ChildProcessOrToolsTransport`. `SCHEDULE_ENGINE` elige el motor, y `createScheduleSolver` lo construye.
- `schedules.engine` y los eventos ya llevan el motor. La API no lo expone.

**Restricciones:**
- **Lambdas actuales:** `ApiFunction` y `ScheduleWorkerFunction` son `NodejsFunction` en x86_64. El worker tiene 2 GB y 5 minutos, y la API lo invoca de forma asíncrona.
- **Despliegue:** se hace con `cdk deploy` desde `deploy.yml`, en `ubuntu-latest`, que tiene Docker. El rol de GitHub asume los roles `cdk-hnb659fds-*` del *bootstrap*, entre ellos el de publicar imágenes en el repositorio ECR de assets.
- **Tests de los stacks:** sintetizan sin AWS y sin empaquetar (`aws:cdk:bundling-stacks: []`).
- **Cancelación:** una Lambda en curso no se puede cancelar.
- **Decisión de la persona usuaria (2026-11-09):** la imagen de contenedor, el latido y la cancelación desde TypeScript, y nada de credenciales en Python.
- **Decisión de la persona usuaria (2026-11-10):** no se integra en `main` hasta tener los dos cambios.

## Goals / Non-Goals

**Goals:**
- Que producción pueda usar `ORTOOLS` cambiando solo una variable del entorno `prod` y volviendo a desplegar.
- Por defecto todo sigue igual: el motor actual, sin cambios visibles.
- La pantalla no muestra un progreso falso con CP-SAT.

**Non-Goals:**
- Elegir el motor desde la aplicación.
- Optimizar las preferencias en CP-SAT.
- Mostrar el motor.
- Cancelar la Lambda de Python.
- Medir el rendimiento en AWS, que es informativo y se hará tras integrar, en la comprobación en producción.

## Decisions

### D1. `handler.py`, `Dockerfile` y `.dockerignore` en `solver-ortools/`
- **`handler.py`:** `handler(event, _context)` hace `return solve(validate(event))`, con `validate` de `cli.py`, sin E/S propia. Una petición inválida lanza `ValueError` y Lambda la devuelve como `FunctionError: Unhandled`, que el transporte trata como fallo (alternativa).
- **`Dockerfile`:**
  ```dockerfile
  FROM public.ecr.aws/lambda/python:3.12
  COPY requirements.txt ${LAMBDA_TASK_ROOT}/
  RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt
  COPY solver.py cli.py handler.py ${LAMBDA_TASK_ROOT}/
  CMD ["handler.handler"]
  ```
- **`.dockerignore`:** excluye `.venv`, `tests`, `__pycache__`, `.pytest_cache`, `.ruff_cache` y `requirements-dev.txt`. CDK lo respeta al calcular el hash y al preparar el asset (`ignoreMode` Docker), así que el entorno virtual local, de cientos de MB, no entra ni en la síntesis de los tests.

**Alternativas descartadas:**
- **Zip con capa:** `ortools` con `numpy` y `protobuf` roza los 250 MB descomprimidos, y empaquetar las ruedas de Linux desde Windows es delicado. Ya lo descartó la persona usuaria.
- **Imagen sobre `python:3.12-slim` con el *runtime interface client*:** es más trabajo, sin ganancia.

### D2. `ScheduleOrToolsFunction` en `appStack.ts`
```ts
const orToolsFunction = new DockerImageFunction(this, 'ScheduleOrToolsFunction', {
  functionName: `${prefix}-schedule-ortools`,
  code: DockerImageCode.fromImageAsset(join(REPOSITORY_ROOT, 'solver-ortools'), { platform: Platform.LINUX_AMD64 }),
  architecture: Architecture.X86_64, memorySize: 2048, timeout: Duration.minutes(5),
  logGroup: new LogGroup(..., retention: ONE_MONTH), loggingFormat: LoggingFormat.JSON,
});
scheduleWorkerFunction.addToRolePolicy(new PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [orToolsFunction.functionArn] }));
```
- **Sin entorno ni SSM:** la función no recibe variables de entorno ni permisos de SSM.
- **Tiempo:** 5 minutos, como en la historia, es solo un tope de seguridad. CP-SAT para a los 60 s como mucho (`ORTOOLS_LIMIT_MS`), y una Lambda que el worker deja de esperar termina por ese límite.
- **Se despliega siempre:** sin invocaciones no cuesta nada salvo el almacenamiento de la imagen en ECR. Así, cambiar de motor no cambia la plantilla, solo una variable.

**Alternativa descartada:** crearla solo con `ORTOOLS`. Un cambio de motor crearía o borraría recursos, y la primera generación con `ORTOOLS` coincidiría con la primera construcción de la imagen.

### D3. `LambdaOrToolsTransport` (`infrastructure/aws/lambdaOrToolsTransport.ts`)
Sigue el patrón de `LambdaGenerationLauncher`: `@aws-sdk/client-lambda`, ya dependencia, con el cliente inyectable para los tests.
- **El cliente:** `new LambdaClient({ maxAttempts: 1, requestHandler: new NodeHttpHandler({ requestTimeout: ORTOOLS_LIMIT_MS + 30_000 }) })`. Un reintento del SDK volvería a ejecutar CP-SAT, y el tiempo de la petición cubre los 60 s de CP-SAT más el arranque en frío de la imagen.
- **La invocación:** `send(new InvokeCommand({ FunctionName, InvocationType: 'RequestResponse', Payload: JSON.stringify(request) }), { abortSignal: signal })`.
- **El resultado:**
  - `FunctionError`, un `StatusCode` distinto de 200 o un `Payload` que no es JSON: `OrToolsInvokeError`, con un mensaje fijo. El contenido va aparte, en una propiedad, nunca en el log.
  - Si no, `JSON.parse` del `Payload`.
- **Abortar:** el SDK rechaza con `AbortError`, y `OrToolsSolver` ya lo trata como cancelado porque comprueba su propia señal.

### D4. El motor de la generación: columna, `onEngine` y vista
- **Migración:** `ALTER TABLE schedule_generations ADD COLUMN engine "ScheduleEngine" NOT NULL DEFAULT 'BACKTRACKING'`. El enum ya existe y ya tiene `ORTOOLS`, que se añadió en el cambio anterior, en otra migración, así que no se usa en la misma transacción en la que se crea.
- **Al crear:** `StartGeneration` recibe ya `engine`, que hoy solo registra, y lo pasa a `GenerationRepository.insert`.
- **`onEngine`:** `SolveOptions.onEngine?: (engine: ScheduleEngine) => void`. `OrToolsSolver` lo llama con `'BACKTRACKING'` en `runFallback` (alternativa y diagnóstico) antes de llamar al motor actual.
- **Durante la generación:** `RunGeneration` guarda el valor en una variable, como `phase`, y `saveProgress` lo escribe con el progreso (`{ placed, total, phase, score, engine }`).
- **Al guardar:** `replaceDraft` ya marca la generación `COMPLETED` en la misma transacción, y ahora también escribe `engine: draft.engine`.
- **Vista:** `toGenerationView` añade `engine`. `Generation` (dominio) gana `engine`, y las lecturas del repositorio lo devuelven.

**Alternativa descartada:** fijar el motor solo al terminar. Mientras busca, la pantalla no sabría si mostrar la barra indeterminada.

### D5. Configuración y composición
- **`config.ts`:** `SCHEDULE_ORTOOLS_FUNCTION_NAME: z.string().min(1).optional()`, que pasa a `scheduleOrToolsFunctionName`.
- **`createScheduleSolver`:** recibe ese nombre y, con él, construye `LambdaOrToolsTransport`. Sin él, `ChildProcessOrToolsTransport`.
- **El contexto en CDK:**
  - `bin/app.ts` lee `app.node.tryGetContext('scheduleEngine')` y lo valida contra `['BACKTRACKING', 'ORTOOLS']`. Con otro valor, `throw new Error('El contexto scheduleEngine debe ser BACKTRACKING u ORTOOLS')`.
  - `AppStackProps.scheduleEngine` (`BACKTRACKING` por defecto) se añade al `baseEnvironment`, así que llega a la API y al worker. La API lo necesita para guardar el motor al crear la generación.
  - Solo el worker recibe `SCHEDULE_ORTOOLS_FUNCTION_NAME`.
- **`deploy.yml`:** `env: SCHEDULE_ENGINE: ${{ vars.SCHEDULE_ENGINE }}` y `-c scheduleEngine="${SCHEDULE_ENGINE:-BACKTRACKING}"` en el `cdk deploy`. El encabezado documenta la variable.

**Documentación:** cómo cambiar el motor (la variable desde la web o con `gh variable set`, volver a desplegar, comprobarlo en CloudWatch y volver atrás) va en una sección propia de `docs/despliegue/PUESTA_EN_MARCHA.md`, enlazada desde `deploy.yml`: es una operación de despliegue, no de código.

**Alternativa descartada:** el valor en `cdk.json`. Cambiar de motor exigiría un commit en `main`, cuando con la variable del entorno basta con volver a ejecutar el despliegue, también el manual de *rollback*.

### D6. Frontend
- **`scheduleGenerationService`:** valida `engine` con una lista cerrada (`'BACKTRACKING' | 'ORTOOLS'`, con un test de tipos contra el contrato).
- **`ScheduleGenerationPanel`:**
  - Calcula `indeterminateSearch = engine === 'ORTOOLS' && phase === 'SEARCHING'`.
  - Con ella, reutiliza la barra a rayas sin valor de la mejora, con su propio nombre (`schedule.generation.searchingIndeterminate.label`), y omite la línea «N de M sesiones» y «Preparando…».
  - El resto del panel no cambia.
- **Estilos:** no hay estilos nuevos. La barra ya existe, y su animación ya respeta `prefers-reduced-motion` a través de Bootstrap.

### D7. Pruebas
- **`pytest`:** `handler` frente a `solve`, la petición inválida, y un test que lee `Dockerfile` y `.dockerignore`.
- **Backend:**
  - `LambdaOrToolsTransport` con un cliente simulado: éxito, `FunctionError`, `StatusCode`, JSON roto, abortar y `maxAttempts`.
  - `onEngine` en `OrToolsSolver` (alternativa, diagnóstico y sin llamada si resuelve).
  - `RunGeneration` escribe el motor con el progreso.
  - `StartGeneration` lo pasa a `insert`.
  - `toGenerationView`.
  - `config`, `createScheduleSolver` con los dos transportes, y los repositorios Prisma (columna, valor por defecto, `saveProgress` y `replaceDraft`).
  - Integración HTTP: `engine` en el `202` y en el `GET`.
- **Contrato:** `schema.test.ts` (`expectTypeOf`), y `api:types` y `api:types:check`.
- **Frontend:** el servicio (`engine` obligatorio y conocido), y el panel con `ORTOOLS` en `SEARCHING` (barra sin valor y con nombre, sin «N de M», `axe`) y su vuelta a la barra con valor al cambiar a `BACKTRACKING`.
- **Infraestructura:**
  - La plantilla: tres funciones, la de imagen con su memoria y su tiempo, la política del worker limitada a su ARN, `SCHEDULE_ENGINE` en las dos funciones de Node y `SCHEDULE_ORTOOLS_FUNCTION_NAME` en el worker.
  - El contexto `scheduleEngine`: por defecto, `ORTOOLS` e inválido.
- **E2E:** sin cambios de flujo. El E2E sigue con `BACKTRACKING`, y la barra indeterminada se cubre en los tests del componente.

## Risks / Trade-offs

- **[Arranque en frío de la imagen (cientos de MB con `ortools`)]** → Unos segundos la primera vez, dentro del margen del tiempo de la petición (60 s + 30 s) y de los 5 minutos del worker. Se medirá en la comprobación en producción.
- **[Un `cdk deploy` desde una máquina sin Docker falla al construir la imagen]** → El despliegue de verdad es `deploy.yml`, que tiene Docker. Los tests de los stacks no construyen la imagen. `PUESTA_EN_MARCHA.md` lo advierte.
- **[La Lambda de Python sigue hasta 60 s tras una cancelación]** → Es un coste pequeño y acotado, aceptado por la persona usuaria. El resultado se descarta.
- **[Que la alternativa ocurra sin que se vea]** → El `warn` `ortools_fallback` va a CloudWatch, y `engine` cambia en la generación y en el horario.
- **[Una imagen mal construida (otra plataforma)]** → `Platform.LINUX_AMD64` es explícito y la función es `X86_64`. El smoke test no la ejecuta, y la comprobación manual en producción, con `ORTOOLS`, sí.

## Migration Plan

1. **Integración** (cuando la persona usuaria la apruebe, con los dos cambios): las migraciones son aditivas (`schedule_generations.engine` con valor por defecto). El primer despliegue construye y publica la imagen, y crea la función. Sin la variable `SCHEDULE_ENGINE`, todo sigue con `BACKTRACKING`.
2. **Probar `ORTOOLS` en producción:** definir `SCHEDULE_ENGINE=ORTOOLS` en el entorno `prod` de GitHub, volver a ejecutar el despliegue, generar un horario y volver a `BACKTRACKING` (o dejarlo), con su informe.
3. **Rollback:** quitar la variable y volver a desplegar, o desplegar a mano un commit anterior. La columna nueva puede quedarse, porque tiene valor por defecto.

## Open Questions

- Ninguna que bloquee. El tiempo real de arranque en frío de la imagen se anotará tras integrar.
