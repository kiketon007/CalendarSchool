## MODIFIED Requirements

### Requirement: Contrato de la generación en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`:
- `POST /api/schedule/generate` (`ADMIN`, con un cuerpo **opcional** `StartGenerationRequest` `{ improve?: boolean }`, `additionalProperties: false`): `202` con `{ generation }`; `400 VALIDATION_ERROR` (con el error en el campo `improve`), `401`, `403 FORBIDDEN`, `409 SCHEDULE_NOT_READY` y `409 GENERATION_IN_PROGRESS`.
- `GET /api/schedule/generate` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`): `200` con `{ generation: Generation | null }`.
- `GET /api/schedule/generate/{id}` (`ADMIN` y `MEMBER`, `no-store`): `200` con `{ generation }` y `404`.
- `DELETE /api/schedule/generate/{id}` (`ADMIN`): `200` con `{ generation }`, `403`, `404` y `409 GENERATION_NOT_CANCELLABLE`.

El esquema `Generation` MUST ser `{ id, status (QUEUED|RUNNING|COMPLETED|FAILED|CANCELLED), progress (0–100), placed, total, improve (booleano), phase (GenerationPhase: SEARCHING|IMPROVING), engine (ScheduleEngine: BACKTRACKING|ORTOOLS), score (ScheduleScore|null), improvementCancelled (booleano), errorCode (NOT_READY|INFEASIBLE|TIMEOUT|INTERNAL|null), errorMessage (string|null), errorDetails (objeto|null), scheduleId (uuid|null), createdAt, startedAt, finishedAt }`.
- `engine` es el motor que busca, o que encontró, el horario (US-ALGO-ORTOOLS).
- `errorDetails` de `INFEASIBLE` MUST llevar el motivo (`NO_FREE_CELLS`, `CLASS_BUSY`, `PROFESSOR_BUSY`, `DAILY_RULE` o `MAX_HOURS`) y la lección con sus referencias (curso, clase, asignatura y profesor, cada uno con `id` y `name`).
- Los tres códigos (`SCHEDULE_NOT_READY`, `GENERATION_IN_PROGRESS`, `GENERATION_NOT_CANCELLABLE`) MUST estar a la vez en el enum `ErrorCode` y en `ERROR_CODES` de `appError.ts`. Esta historia no añade códigos.

#### Scenario: Contrato y tipos
- **WHEN** se lee `docs/api-spec.yml` y se regeneran los tipos con `npm run api:types -w frontend`
- **THEN** existen las cuatro operaciones, `StartGenerationRequest`, `GenerationPhase`, `ScheduleEngine`, `Generation` con sus campos nuevos y los tres códigos de error, y `api:types:check` y `appError.test.ts` pasan

## ADDED Requirements

### Requirement: Motor de la generación
`schedule_generations` MUST tener `engine` (`ScheduleEngine`, `NOT NULL`, `DEFAULT 'BACKTRACKING'`, que es lo que reciben las filas anteriores en la migración). Su valor se fija y se mantiene así:
- **Al crear la generación:** `StartGeneration` MUST guardar el motor configurado (`SCHEDULE_ENGINE`).
- **Al pasar a la alternativa:** si el motor avisa con `onEngine`, `RunGeneration` MUST escribir el nuevo en la siguiente escritura del progreso.
- **Al guardar el borrador:** `replaceDraft` MUST dejar en la generación el `engine` del resultado `solved`, en la misma transacción.

`toGenerationView` MUST devolverlo como `engine`.

#### Scenario: Generación nueva
- **GIVEN** `SCHEDULE_ENGINE=ORTOOLS`
- **WHEN** un administrador inicia una generación
- **THEN** el `202` y la fila llevan `engine` `ORTOOLS`

#### Scenario: Alternativa durante la búsqueda
- **GIVEN** una generación `ORTOOLS` cuyo motor llama a `onEngine('BACKTRACKING')`
- **WHEN** se escribe el progreso siguiente
- **THEN** la fila lleva `engine` `BACKTRACKING`

#### Scenario: Borrador del motor actual
- **GIVEN** una generación `ORTOOLS` cuyo resultado es `solved` con `engine` `BACKTRACKING`
- **WHEN** se guarda el borrador
- **THEN** la generación y el horario llevan `BACKTRACKING`

#### Scenario: Filas anteriores
- **WHEN** se aplica la migración sobre generaciones existentes
- **THEN** todas tienen `engine` `BACKTRACKING`

### Requirement: Motor elegido en AWS
El contexto de CDK `scheduleEngine` (`BACKTRACKING` por defecto, u `ORTOOLS`; cualquier otro valor MUST hacer fallar la síntesis con un mensaje claro) MUST llegar como `SCHEDULE_ENGINE` a `ApiFunction` y a `ScheduleWorkerFunction`.
- `deploy.yml` MUST pasarlo con `-c scheduleEngine=…` desde la variable `SCHEDULE_ENGINE` del entorno `prod` de GitHub, o `BACKTRACKING` si no existe.
- El worker MUST recibir `SCHEDULE_ORTOOLS_FUNCTION_NAME`, y `loadConfig` MUST leerla como opcional.
- Con ella, `createScheduleSolver` MUST usar `LambdaOrToolsTransport`; sin ella, `ChildProcessOrToolsTransport`.
- `docs/despliegue/PUESTA_EN_MARCHA.md` MUST explicar que el motor se cambia con esa variable del entorno `prod` de GitHub, cómo definirla (desde la web y con `gh variable set`), que solo tiene efecto al volver a desplegar, cómo comprobar en los logs qué motor se usó y cómo volver a `BACKTRACKING`.

#### Scenario: Por defecto
- **WHEN** se sintetiza el stack sin contexto
- **THEN** las dos funciones llevan `SCHEDULE_ENGINE` `BACKTRACKING`

#### Scenario: Con OR-Tools
- **WHEN** se sintetiza con `-c scheduleEngine=ORTOOLS`
- **THEN** las dos funciones llevan `SCHEDULE_ENGINE` `ORTOOLS`, y el worker lleva `SCHEDULE_ORTOOLS_FUNCTION_NAME` con el nombre de la Lambda de OR-Tools

#### Scenario: Valor inválido
- **WHEN** se sintetiza con `-c scheduleEngine=FOO`
- **THEN** la síntesis falla nombrando `scheduleEngine` y sus valores

#### Scenario: Cambiar el motor en producción está documentado
- **WHEN** se lee `docs/despliegue/PUESTA_EN_MARCHA.md`
- **THEN** hay una sección que lleva, paso a paso, de `BACKTRACKING` a `ORTOOLS` con la variable `SCHEDULE_ENGINE` del entorno `prod` y un nuevo despliegue, cómo comprobarlo y cómo volver atrás, y el encabezado de `deploy.yml` la enlaza

#### Scenario: Transporte según el entorno
- **WHEN** se construye el motor `ORTOOLS` con y sin `SCHEDULE_ORTOOLS_FUNCTION_NAME`
- **THEN** usa el transporte de Lambda en el primer caso y el proceso hijo en el segundo

### Requirement: Infraestructura del motor de OR-Tools
La plantilla de CDK MUST declarar `ScheduleOrToolsFunction` con estas características:
- Un `DockerImageFunction` desde `solver-ortools/`, en `x86_64`, con 2048 MB, 5 minutos de timeout y su grupo de logs con un mes de retención.
- Sin variables de entorno de secretos ni políticas sobre SSM o la base de datos.
- Se despliega con cualquier valor de `scheduleEngine`.

Solo `ScheduleWorkerFunction` MUST tener `lambda:InvokeFunction` sobre su ARN, y la API no. El rol de despliegue no MUST cambiar, porque ya asume los roles del *bootstrap*, entre ellos el de publicar imágenes.

#### Scenario: Plantilla
- **WHEN** se sintetiza el stack
- **THEN** hay tres funciones: la de OR-Tools con `PackageType: Image`, 2048 MB y 300 s, y una política del worker que permite invocarla limitada a su ARN; la política de la API solo permite invocar al worker

### Requirement: Progreso con el motor de OR-Tools
Mientras una generación está en curso con `engine` `ORTOOLS` y `phase` `SEARCHING`, `ScheduleGenerationPanel` MUST mostrar estas tres cosas:
- el texto «Buscando un horario válido…»;
- un `role="progressbar"` **sin valor** (sin `aria-valuenow`), con el nombre «Buscando con un motor que no informa del avance» (`schedule.generation.searchingIndeterminate.label`), como la barra de la mejora;
- «Cancelar», como siempre.

Y MUST NOT mostrar «{placed} de {total} sesiones», porque CP-SAT no coloca las sesiones de una en una. Con `engine` `BACKTRACKING` el panel MUST seguir como hasta ahora. El panel MUST NOT mostrar el motor. `scheduleGenerationService` MUST rechazar como `unavailable` una `Generation` sin `engine` o con un valor desconocido.

#### Scenario: Buscando con OR-Tools
- **GIVEN** una generación `RUNNING` con `engine` `ORTOOLS` y `phase` `SEARCHING`
- **WHEN** se ve `/horarios`
- **THEN** la barra no tiene valor y tiene nombre, no aparece «N de M sesiones», está «Cancelar» y `axe` no da errores

#### Scenario: OR-Tools falla y sigue el motor actual
- **GIVEN** una generación que pasa de `engine` `ORTOOLS` a `BACKTRACKING` mientras busca
- **WHEN** el panel recibe la siguiente respuesta del sondeo
- **THEN** vuelve a la barra con valor y «{placed} de {total} sesiones»

#### Scenario: Respuesta sin motor
- **WHEN** el servicio recibe una `Generation` sin `engine`
- **THEN** devuelve `unavailable`
