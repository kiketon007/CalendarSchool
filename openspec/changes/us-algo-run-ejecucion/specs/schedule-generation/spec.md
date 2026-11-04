## ADDED Requirements

### Requirement: Contrato de la generación en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`:
- `POST /api/schedule/generate` (`ADMIN`, sin cuerpo): `202` con `{ generation }`; `401`, `403 FORBIDDEN`, `409 SCHEDULE_NOT_READY` y `409 GENERATION_IN_PROGRESS`.
- `GET /api/schedule/generate` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`): `200` con `{ generation: Generation | null }`.
- `GET /api/schedule/generate/{id}` (`ADMIN` y `MEMBER`, `no-store`): `200` con `{ generation }` y `404`.
- `DELETE /api/schedule/generate/{id}` (`ADMIN`): `200` con `{ generation }`, `403`, `404` y `409 GENERATION_NOT_CANCELLABLE`.

El esquema `Generation` MUST ser `{ id, status (QUEUED|RUNNING|COMPLETED|FAILED|CANCELLED), progress (0–100), placed, total, errorCode (NOT_READY|INFEASIBLE|TIMEOUT|INTERNAL|null), errorMessage (string|null), errorDetails (objeto|null), scheduleId (uuid|null), createdAt, startedAt, finishedAt }`. `errorDetails` de `INFEASIBLE` MUST llevar el motivo (`NO_FREE_CELLS`, `CLASS_BUSY`, `PROFESSOR_BUSY`, `DAILY_RULE` o `MAX_HOURS`) y la lección con sus referencias (curso, clase, asignatura y profesor, cada uno con `id` y `name`). Los tres códigos nuevos (`SCHEDULE_NOT_READY`, `GENERATION_IN_PROGRESS`, `GENERATION_NOT_CANCELLABLE`) MUST estar a la vez en el enum `ErrorCode` y en `ERROR_CODES` de `appError.ts`.

#### Scenario: Contrato y tipos
- **WHEN** se lee `docs/api-spec.yml` y se regeneran los tipos con `npm run api:types -w frontend`
- **THEN** existen las cuatro operaciones, `Generation` y los tres códigos de error, y `api:types:check` y `appError.test.ts` pasan

### Requirement: Tablas del horario y de la generación
La migración de Prisma MUST crear, con UUIDv7 generados por la aplicación y `ON DELETE CASCADE` desde el colegio:
- `schedules`: `id`, `school_id`, `status` (`DRAFT`|`OFFICIAL`), `engine` (`BACKTRACKING`), `placed_sessions`, `generated_at`, `created_by`. **Índice único parcial `(school_id) WHERE status = 'DRAFT'`**.
- `schedule_entries`: `id`, `schedule_id` (cascada), `course_id`, `class_id`, `subject_id` (cascada), `professor_id` **nullable `ON DELETE SET NULL`**, `day_of_week` (1–5), `session_number`, `start_minute`, `end_minute`, con `CHECK start_minute < end_minute` y `CHECK` de rango en el día. **Único `(schedule_id, class_id, day_of_week, session_number)`** (HC5). Sin clave única por profesor, sin aula y sin rol.
- `schedule_generations`: `id`, `school_id`, `created_by`, `status`, `placed`, `total`, `error_code`, `error_message`, `error_details` (JSON), `schedule_id` (nullable, `SET NULL`), `heartbeat_at`, `cancel_requested`, `created_at`, `started_at`, `finished_at`. **Índice único parcial `(school_id) WHERE status IN ('QUEUED','RUNNING')`**.

#### Scenario: Una generación en curso por colegio
- **GIVEN** una generación `QUEUED` o `RUNNING` del colegio
- **WHEN** se inserta otra del mismo colegio
- **THEN** la base la rechaza por unicidad; con la anterior en `COMPLETED`, `FAILED` o `CANCELLED`, se acepta

#### Scenario: Un borrador por colegio
- **GIVEN** un horario `DRAFT` del colegio
- **WHEN** se inserta otro `DRAFT` del mismo colegio
- **THEN** la base lo rechaza; un `OFFICIAL` no cuenta

#### Scenario: Borrar un profesor deja el hueco sin profesor
- **GIVEN** entradas de un horario con ese profesor
- **WHEN** se borra el profesor
- **THEN** las entradas siguen existiendo con `professor_id` nulo

#### Scenario: Una clase, un hueco
- **WHEN** se insertan dos entradas con el mismo horario, clase, día y sesión
- **THEN** la base rechaza la segunda

### Requirement: Iniciar una generación
`POST /api/schedule/generate` MUST, para un `ADMIN`: comprobar que no hay bloqueantes con `readinessOf` sobre la foto del colegio de la sesión (con bloqueantes, `409 SCHEDULE_NOT_READY` sin crear nada); marcar como interrumpidas las generaciones atascadas del colegio; insertar la generación en `QUEUED` (si el índice único parcial la rechaza, `409 GENERATION_IN_PROGRESS`); lanzar el worker de forma asíncrona con el id; y responder `202` con la generación. Si el lanzamiento falla, MUST marcar la generación `FAILED` con `INTERNAL` y responder `500`, de modo que no quede ninguna `QUEUED`.

#### Scenario: Generar
- **GIVEN** un administrador y un colegio sin bloqueantes
- **WHEN** llama a `POST /api/schedule/generate`
- **THEN** responde `202` con una generación `QUEUED`, `progress` 0 y los totales a cero, y el worker recibe su id

#### Scenario: Con bloqueantes
- **GIVEN** un colegio con algún bloqueante
- **THEN** responde `409 SCHEDULE_NOT_READY` y no hay ninguna fila nueva

#### Scenario: Ya hay una en curso
- **GIVEN** una generación `RUNNING` del colegio
- **THEN** otro `POST` responde `409 GENERATION_IN_PROGRESS` y no crea otra

#### Scenario: Dos peticiones simultáneas
- **WHEN** dos `POST` llegan a la vez
- **THEN** uno responde `202` y el otro `409 GENERATION_IN_PROGRESS`; solo hay una fila en curso

#### Scenario: Falla el lanzamiento
- **GIVEN** un lanzador que falla
- **THEN** responde `500`, la generación queda `FAILED` con `INTERNAL` y se puede generar de nuevo

### Requirement: Leer la generación
`GET /api/schedule/generate` MUST devolver la generación en curso del colegio o, si no hay, la última por fecha de creación, o `null`; `GET /api/schedule/generate/{id}`, la indicada. Los dos MUST ser accesibles para `ADMIN` y `MEMBER`, llevar `Cache-Control: no-store`, filtrar por el colegio de la sesión y marcar antes como interrumpida una generación atascada. `{id}` que no es un UUID o no es del colegio MUST responder `404`. `progress` MUST ser `round(100 · placed / total)` (0 si `total` es 0) y no bajar nunca.

#### Scenario: Retomar tras recargar
- **GIVEN** una generación `RUNNING`
- **WHEN** cualquier usuario del colegio llama a `GET /api/schedule/generate`
- **THEN** recibe esa generación con su `status` y `progress`

#### Scenario: Sin generaciones
- **THEN** responde `{ generation: null }`

#### Scenario: Otro colegio y UUID inválido
- **WHEN** se pide el id de una generación de otro colegio, o un id que no es UUID
- **THEN** responde `404` en los dos casos, sin distinguirlos

### Requirement: Ejecución en segundo plano
`runGeneration(generationId)` MUST, en este orden: reclamar la fila con una actualización condicional `QUEUED → RUNNING` (si no afecta a ninguna fila, termina sin hacer nada, de modo que un reintento no la ejecuta dos veces); repetir la comprobación previa (con bloqueantes, `FAILED` con `NOT_READY`); construir la entrada y llamar al motor con el límite `SCHEDULE_MAX_SECONDS`, un reloj, la señal de cancelación y el progreso; y, según el resultado, terminar en `COMPLETED` (guardando el borrador), `FAILED` con `INFEASIBLE` (con el motivo y la lección en `errorDetails`), `FAILED` con `TIMEOUT`, `CANCELLED` o, ante cualquier excepción, `FAILED` con `INTERNAL`. Una generación que termina MUST dejar `finished_at`, y una `FAILED` o `CANCELLED` MUST NOT modificar el borrador anterior.

#### Scenario: Éxito
- **GIVEN** un colegio con solución
- **WHEN** corre el worker
- **THEN** la generación pasa por `RUNNING` a `COMPLETED`, con `scheduleId`, `placed` igual a `total` y un borrador con una entrada por sesión

#### Scenario: Reintento de Lambda
- **GIVEN** una generación ya reclamada
- **WHEN** el worker se invoca otra vez con el mismo id
- **THEN** no hace nada: no cambia la fila ni vuelve a ejecutar el motor

#### Scenario: Cambió el colegio entre el POST y el arranque
- **GIVEN** una generación `QUEUED` y un bloqueante nuevo
- **THEN** termina `FAILED` con `NOT_READY` y no guarda nada

#### Scenario: Sin solución
- **GIVEN** un problema que el motor demuestra sin solución
- **THEN** termina `FAILED` con `INFEASIBLE` y `errorDetails` con el motivo y la lección; el borrador anterior sigue intacto

#### Scenario: Se acaba el tiempo
- **GIVEN** un reloj que agota el límite
- **THEN** termina `FAILED` con `TIMEOUT` y un mensaje que dice que puede existir un horario

#### Scenario: Error interno
- **GIVEN** una excepción durante la ejecución
- **THEN** termina `FAILED` con `INTERNAL`, el mensaje no contiene la traza y la traza queda en el log

### Requirement: Guardar el borrador
Al resolverse, el horario MUST guardarse en **una transacción** que borra el `DRAFT` anterior del colegio, inserta el horario `DRAFT` (`engine` `BACKTRACKING`, `placed_sessions`, `created_by` del `POST`) y sus entradas, enlaza el horario con la generación y la marca `COMPLETED`. Si la transacción falla, MUST NOT quedar un horario a medias ni perderse el borrador anterior. Las entradas MUST llevar el curso, la clase, la asignatura, el profesor, el día, el número de sesión y los minutos de inicio y fin. Los horarios `OFFICIAL` MUST NOT tocarse.

#### Scenario: Sustituye al borrador anterior
- **GIVEN** un borrador previo y una generación nueva con éxito
- **THEN** solo existe el borrador nuevo, con sus entradas, y las del anterior han desaparecido

#### Scenario: Falla el guardado
- **GIVEN** un fallo de la base a mitad de la inserción de entradas
- **THEN** el borrador anterior sigue con sus entradas, no hay un horario nuevo y la generación termina `FAILED` con `INTERNAL`

#### Scenario: Fallida o cancelada
- **THEN** el borrador anterior no cambia

#### Scenario: Huecos libres
- **GIVEN** un curso con menos carga que franjas
- **THEN** las franjas que sobran no tienen entrada

### Requirement: Progreso y latido
El worker MUST guardar `placed`, `total` y `heartbeat_at` como mucho cada 2 segundos (reloj inyectado), no en cada llamada de progreso, y MUST informar del máximo de sesiones colocadas.

#### Scenario: Escrituras acotadas
- **GIVEN** mil llamadas de progreso en un segundo
- **THEN** el repositorio recibe una sola escritura de progreso

#### Scenario: El progreso no baja
- **WHEN** la búsqueda retrocede
- **THEN** el `progress` que ve la pantalla no disminuye

### Requirement: Cancelar una generación
`DELETE /api/schedule/generate/{id}` MUST, para un `ADMIN`, marcar `cancel_requested` en una generación `QUEUED` o `RUNNING` y responder `200` con la generación; si estaba `QUEUED`, pasarla directamente a `CANCELLED`. El worker MUST leer la marca en cada escritura de progreso, detener la búsqueda y dejar la generación en `CANCELLED` sin guardar ningún horario, como mucho 2 segundos después. Una generación terminada MUST responder `409 GENERATION_NOT_CANCELLABLE`.

#### Scenario: Cancelar en curso
- **GIVEN** una generación `RUNNING`
- **WHEN** el administrador la cancela
- **THEN** responde `200`, el worker la deja `CANCELLED` sin horario y se puede generar de nuevo

#### Scenario: Cancelar antes de empezar
- **GIVEN** una generación `QUEUED`
- **THEN** pasa a `CANCELLED` y, si el worker llega después, no la reclama

#### Scenario: Ya terminada
- **THEN** responde `409 GENERATION_NOT_CANCELLABLE` y no cambia nada

### Requirement: Generación atascada
Una generación `RUNNING` con el latido de hace más de 90 segundos, o `QUEUED` creada hace más de 90 segundos, MUST marcarse `FAILED` con `INTERNAL` y el mensaje «la generación se interrumpió», con una transición condicional, al leerla o al intentar generar.

#### Scenario: Se interrumpió
- **GIVEN** una generación `RUNNING` con el latido de hace 5 minutos
- **WHEN** alguien consulta su estado
- **THEN** ve `FAILED` con `INTERNAL` y puede generar de nuevo

#### Scenario: Latido reciente
- **GIVEN** un latido de hace 10 segundos
- **THEN** la generación sigue `RUNNING`

### Requirement: Solo administradores y aislamiento por colegio
`POST` y `DELETE` MUST exigir el rol `ADMIN` (un `MEMBER` recibe `403 FORBIDDEN` sin cambiar nada). El colegio y el usuario MUST salir siempre de la sesión y nunca del cliente, y todas las consultas MUST filtrarse por el colegio. Sin sesión, `401`.

#### Scenario: Un miembro
- **WHEN** un `MEMBER` llama a `POST` o `DELETE`
- **THEN** responde `403 FORBIDDEN` y no se crea ni se cambia nada, y sus `GET` funcionan

#### Scenario: Otro colegio
- **WHEN** un administrador cancela la generación de otro colegio
- **THEN** responde `404` y la generación no cambia

### Requirement: Observabilidad
Cada generación MUST emitir los eventos `SCHEDULE_GENERATION_STARTED`, `SCHEDULE_GENERATION_COMPLETED`, `SCHEDULE_GENERATION_FAILED` y `SCHEDULE_GENERATION_CANCELLED` con `school_id`, `actor_id`, id de la generación, `placed`, `total`, duración y `error_code`, y MUST NOT incluir nombres de profesores, cursos ni asignaturas.

#### Scenario: Un evento por resultado
- **WHEN** una generación termina con éxito, error o cancelación
- **THEN** se registra el evento correspondiente con esos campos y ningún nombre

### Requirement: Configuración y ejecución en local
`loadConfig` MUST leer `SCHEDULE_MAX_SECONDS` (entero entre 5 y 240, 120 por defecto) y `SCHEDULE_WORKER_FUNCTION_NAME` (opcional). Sin éste, `composeApp` MUST usar un lanzador en memoria que ejecuta `runGeneration` en el mismo proceso, sin bloquear la respuesta del `POST`; con él, `LambdaGenerationLauncher` (`InvokeCommand`, `InvocationType: 'Event'`). `createApp()` MUST seguir sin leer `process.env`.

#### Scenario: Valores por defecto y rango
- **THEN** sin la variable el límite es 120 s y un valor fuera de 5–240 hace fallar la carga de la configuración con un mensaje claro

#### Scenario: En local
- **WHEN** no hay función de worker configurada
- **THEN** el `POST` responde `202` y la generación avanza en el mismo proceso hasta terminar

### Requirement: Infraestructura del worker
La plantilla de CDK MUST declarar `ScheduleWorkerFunction` (Node 24, el mismo código y la misma configuración que la API, otro punto de entrada), con **timeout de 5 minutos**, **2 GB** de memoria, **`retryAttempts: 0`** en su invocación asíncrona y el grupo de logs; y MUST dar a la función de la API `lambda:InvokeFunction` **solo** sobre ella y su nombre en `SCHEDULE_WORKER_FUNCTION_NAME`.

#### Scenario: Plantilla
- **WHEN** se sintetiza el stack
- **THEN** hay dos funciones, el worker con 300 s y 2048 MB, un `EventInvokeConfig` con cero reintentos y una política de invocación limitada al ARN del worker

### Requirement: Panel de generación en «Generar horarios»
`/horarios` MUST mostrar, solo a un `ADMIN` y sin bloqueantes, el botón «Generar horarios» y el panel `components/ScheduleGenerationPanel`; un `MEMBER` MUST NOT ver el botón (puede ver el estado de una generación en curso o la última), y con bloqueantes MUST NOT haber botón y la página lo explica. Al montar el panel pide `GET /api/schedule/generate`; el sondeo cada 2 segundos MUST usar un temporizador encadenado, detenerse al desmontar o al terminar y descartar respuestas tardías. El panel MUST mostrar:
- **Generando:** «Generando horarios…», un `role="progressbar"` con el valor y el texto «{placed} de {total} sesiones» y un botón «Cancelar»; el botón «Generar» deshabilitado;
- **Completada:** «Horario borrador generado: {n} sesiones en {m} clases», la nota de que verlo llega más adelante y el botón para generar de nuevo;
- **Fallida:** el texto del `errorCode`, con la lección y su enlace para `INFEASIBLE` (diciendo que la restricción es orientativa salvo `NO_FREE_CELLS`), el motivo de `TIMEOUT` con qué relajar, y «Error interno durante la generación. Inténtalo de nuevo o contacta con soporte (ID: {id})» para `INTERNAL`; con `NOT_READY` vuelve a mostrar la comprobación;
- **Cancelada:** «Generación cancelada» y el botón para generar de nuevo.

`services/scheduleGenerationService.ts` (`start`, `current`, `get`, `cancel`) MUST devolver resultados por caso, validar la forma y no lanzar.

#### Scenario: Generar y seguir el progreso
- **GIVEN** un administrador en `/horarios` sin bloqueantes
- **WHEN** pulsa «Generar horarios»
- **THEN** ve «Generando horarios…», la barra con «N de M sesiones» y «Cancelar», y al terminar el resumen

#### Scenario: Un miembro
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** no ve «Generar horarios» ni «Cancelar»

#### Scenario: Con bloqueantes
- **THEN** no hay botón y la página dice que hay que corregirlos primero

#### Scenario: Recargar en mitad de una generación
- **WHEN** el administrador recarga la página con una generación `RUNNING`
- **THEN** el panel retoma su progreso sin pulsar nada

#### Scenario: Sondeo que se detiene
- **WHEN** la generación termina o el panel se desmonta
- **THEN** no se hacen más peticiones y una respuesta tardía no cambia la pantalla

#### Scenario: Errores
- **THEN** cada `errorCode` muestra su texto; `INFEASIBLE` enlaza a donde se corrige y `INTERNAL` muestra el id y nunca la traza

### Requirement: Accesibilidad e i18n de la generación
Los textos del panel MUST estar en `schedule.generation.*` de `es.json` y `en.json`. El progreso MUST anunciarse sin depender del color; el cambio de estado (generando, terminada, error) MUST comunicarse en una región `role="status"` o `role="alert"`; el foco MUST NOT perderse al deshabilitar el botón; y la página MUST usarse a 360 px y pasar `axe` sin violaciones.

#### Scenario: Accesibilidad
- **WHEN** el panel está en cada uno de sus estados
- **THEN** `axe` no da violaciones y la barra tiene su nombre accesible, valor mínimo, máximo y actual

### Requirement: Generación de extremo a extremo
La suite de Cypress MUST recorrer, con el lanzador en memoria, que un administrador genera, ve el progreso y el resumen, que un colegio con un bloqueante no ofrece el botón, que un `MEMBER` no lo ve y que la página se usa a 360 px.

#### Scenario: Recorrido completo
- **GIVEN** un colegio con una asignatura asignada
- **WHEN** el administrador pulsa «Generar horarios»
- **THEN** llega al resumen «Horario borrador generado» y, tras recargar, lo sigue viendo
