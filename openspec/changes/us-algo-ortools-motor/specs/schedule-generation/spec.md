## MODIFIED Requirements

### Requirement: Tablas del horario y de la generación
La migración de Prisma MUST crear, con UUIDv7 generados por la aplicación y `ON DELETE CASCADE` desde el colegio:
- `schedules`: `id`, `school_id`, `status` (`DRAFT`|`OFFICIAL`), `engine` (`BACKTRACKING`|`ORTOOLS`: el valor `ORTOOLS` lo añade una migración de US-ALGO-ORTOOLS, sin tocar las filas existentes), `placed_sessions`, `generated_at`, `created_by`. **Índice único parcial `(school_id) WHERE status = 'DRAFT'`**.
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

#### Scenario: Horario de OR-Tools
- **WHEN** se inserta un horario con `engine` `ORTOOLS`
- **THEN** la base lo acepta, y los horarios anteriores siguen con `BACKTRACKING`

### Requirement: Guardar el borrador
Al resolverse, el horario MUST guardarse en **una transacción** que borra el `DRAFT` anterior del colegio, inserta el horario `DRAFT` (`engine` el del resultado `solved` del motor, `placed_sessions`, `created_by` del `POST`) y sus entradas, enlaza el horario con la generación y la marca `COMPLETED`. Si la transacción falla, MUST NOT quedar un horario a medias ni perderse el borrador anterior. Las entradas MUST llevar el curso, la clase, la asignatura, el profesor, el día, el número de sesión y los minutos de inicio y fin. Los horarios `OFFICIAL` MUST NOT tocarse.

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

#### Scenario: Motor del borrador
- **GIVEN** un motor que devuelve `solved` con `engine: 'ORTOOLS'`, y otro con `engine: 'BACKTRACKING'` tras una alternativa
- **WHEN** se guarda cada borrador
- **THEN** `schedules.engine` es `ORTOOLS` en el primero y `BACKTRACKING` en el segundo

### Requirement: Observabilidad
Cada generación MUST emitir los eventos `SCHEDULE_GENERATION_STARTED` (con `improve` y `engine`, el motor configurado), `SCHEDULE_GENERATION_COMPLETED` (con `engine`, el motor que produjo el horario, `score_total`, `initial_score_total`, `improvement_stopped_by`, `improvement_moves` e `improvement_ms`), `SCHEDULE_GENERATION_FAILED` y `SCHEDULE_GENERATION_CANCELLED`, todos con `school_id`, `actor_id`, id de la generación, `placed`, `total`, duración y `error_code`. MUST NOT incluir nombres de profesores, cursos ni asignaturas. Los logs del motor de OR-Tools (`ortools_fallback`, `ortools_infeasible_undiagnosed` y `ortools_infeasible_contradicted`) MUST llevar el id de la generación y `elapsed_ms`.

#### Scenario: Un evento por resultado
- **WHEN** una generación termina con éxito, error o cancelación
- **THEN** se registra el evento correspondiente con esos campos y ningún nombre

#### Scenario: La mejora en el log
- **WHEN** una generación con mejora termina con éxito
- **THEN** `SCHEDULE_GENERATION_COMPLETED` lleva la penalización final y la inicial, el motivo de parada, los movimientos y la duración de la mejora

#### Scenario: El motor en el log
- **GIVEN** `SCHEDULE_ENGINE=ORTOOLS` y un fallo de OR-Tools que pasa a la alternativa
- **WHEN** la generación termina con éxito
- **THEN** `SCHEDULE_GENERATION_STARTED` lleva `engine` `ORTOOLS`, `SCHEDULE_GENERATION_COMPLETED` lleva `engine` `BACKTRACKING` y hay un log `ortools_fallback` con el id de la generación

### Requirement: Configuración y ejecución en local
`loadConfig` MUST leer estas variables:
- `SCHEDULE_MAX_SECONDS`: entero entre 5 y 240, 120 por defecto.
- `SCHEDULE_WORKER_FUNCTION_NAME`: opcional.
- `SCHEDULE_ENGINE`: `BACKTRACKING` u `ORTOOLS`, `BACKTRACKING` por defecto.
- `SCHEDULE_ORTOOLS_PYTHON`: el ejecutable de Python, `python3` por defecto.

Sin `SCHEDULE_WORKER_FUNCTION_NAME`, `composeApp` MUST usar un lanzador en memoria que ejecuta `runGeneration` en el mismo proceso, sin bloquear la respuesta del `POST`. Con ella, MUST usar `LambdaGenerationLauncher` (`InvokeCommand`, `InvocationType: 'Event'`).

`composeApp` MUST construir `BacktrackingSolver` con `BACKTRACKING`, y `OrToolsSolver` con `ChildProcessOrToolsTransport` y `BacktrackingSolver` como diagnóstico y alternativa con `ORTOOLS`. `createApp()` MUST seguir sin leer `process.env`.

#### Scenario: Valores por defecto y rango
- **THEN** sin la variable el límite es 120 s y un valor fuera de 5–240 hace fallar la carga de la configuración con un mensaje claro

#### Scenario: En local
- **WHEN** no hay función de worker configurada
- **THEN** el `POST` responde `202` y la generación avanza en el mismo proceso hasta terminar

#### Scenario: Motor por defecto
- **WHEN** no hay `SCHEDULE_ENGINE`
- **THEN** la configuración da `BACKTRACKING` y `composeApp` construye `BacktrackingSolver`

#### Scenario: Motor desconocido
- **WHEN** `SCHEDULE_ENGINE` vale `FOO`
- **THEN** la carga de la configuración falla con un mensaje que nombra la variable y los valores admitidos

#### Scenario: Generar con OR-Tools en local
- **GIVEN** `SCHEDULE_ENGINE=ORTOOLS`, Python con `ortools` instalado y un colegio listo
- **WHEN** un administrador genera
- **THEN** la generación termina `COMPLETED` con un borrador `ORTOOLS` que pasa `validateSchedule`, y `heartbeat_at` ha avanzado mientras CP-SAT buscaba
