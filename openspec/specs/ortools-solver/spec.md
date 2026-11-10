# ortools-solver Specification

## Purpose
El segundo motor de generación de horarios (US-ALGO-ORTOOLS): CP-SAT de OR-Tools en Python, que busca un horario que cumple las restricciones duras y al que `OrToolsSolver` (detrás del puerto `ScheduleSolver`) aplica la misma mejora que al motor de backtracking. Cubre el contrato JSON con el proceso de Python, el modelo de CP-SAT, la espera cancelable, el diagnóstico de un problema sin solución, la alternativa ante un fallo, la equivalencia con el motor actual y, en AWS, la Lambda con imagen de contenedor y su transporte. El motor lo elige cada despliegue con `SCHEDULE_ENGINE` (capacidad `schedule-generation`).
## Requirements
### Requirement: Contrato JSON del motor de OR-Tools
El motor de Python (`solver-ortools/`) MUST recibir una petición JSON y devolver una respuesta JSON, las dos con `version: 1`, descritas en `solver-ortools/README.md`:
- **Petición:** `{ version, limitSeconds, courses: [{ id, cells: [{ sessionNumber, startMinute, endMinute }] }], lessons: [{ index, courseId, classId, professorId, maxPerDay, blockSize }], units: [{ index, lessonIndex, size, placements: [{ dayOfWeek, firstSession }] }] }`.
  - Sale del `GenerationInput` sin nombres de cursos, clases, asignaturas ni profesores, y sin las preferidas.
  - `limitSeconds` es un número positivo.
- **Respuesta:** una de estas cuatro.
  - `{ version, status: 'solved', placements: [{ unitIndex, dayOfWeek, firstSession }] }`, con un emplazamiento por unidad.
  - `{ version, status: 'infeasible' }`
  - `{ version, status: 'timeout' }`
  - `{ version, status: 'cancelled' }`

Una petición con otra `version` o con una forma inválida MUST terminar con un código de salida distinto de 0 y un mensaje en `stderr`, sin respuesta en `stdout`. `OrToolsSolver` MUST validar la respuesta con una guarda de tipo antes de usarla.

#### Scenario: Petición sin nombres
- **GIVEN** un `GenerationInput` con nombres de curso, clase, asignatura y profesor
- **WHEN** `OrToolsSolver` construye la petición
- **THEN** el JSON no contiene ninguno de esos nombres ni las celdas preferidas

#### Scenario: Versión desconocida
- **WHEN** `cli.py` recibe una petición con `version: 2`
- **THEN** termina con un código distinto de 0, explica el error en `stderr` y no escribe nada en `stdout`

### Requirement: Modelo de CP-SAT de las restricciones duras
`solver.py` MUST resolver la petición con CP-SAT, sin función objetivo, y su horario MUST cumplir las mismas restricciones duras que el de `BacktrackingSolver`:
- **HC1 Carga exacta:** una variable booleana por unidad y emplazamiento, y exactamente un emplazamiento por unidad.
- **HC2 Un profesor, un sitio:** dos unidades del mismo profesor el mismo día no se solapan en hora (por minutos de inicio y fin de las celdas), aunque sean de cursos con calendarios distintos. Que solo se toquen no es un choque.
- **HC3 Reparto diario:** cada día, una lección tiene como mucho un bloque y, si lo tiene, ninguna suelta; sin bloque, como mucho `maxPerDay` sueltas.
- **HC5 Una asignatura por clase y hueco:** como mucho una sesión por clase, día y sesión.
- **HC4 Disponibilidad y HC8 Franjas prohibidas:** se cumplen porque solo se usan los emplazamientos de la petición, que ya las descuentan.
- **HC7 Máximo de 23 horas:** para cada profesor, la suma de los minutos de las unidades colocadas no pasa de 1380 (los minutos de una unidad dependen de dónde se coloque, porque las sesiones de un calendario pueden durar distinto). Si ya la carga mínima lo supera, el problema es `infeasible` sin buscar.
- **HC6 Profesor de la asignación:** se cumple porque cada lección lleva su profesor.

El motor MUST parar en la primera solución y ser determinista (semilla fija y `num_workers` fijo): la misma petición da la misma respuesta.

#### Scenario: Cada restricción forzada (HC1, HC2, HC3, HC5, HC7)
- **GIVEN** un problema mínimo por restricción en el que la única solución obliga a respetarla (un profesor en dos cursos con sesiones de 45 y 60 minutos para HC2; un bloque que no puede cruzar el recreo y un máximo de 2 al día para HC3; dos lecciones de una clase con una sola celda libre cada día para HC5; un profesor con más de 1380 minutos de carga para HC7, que es `infeasible`)
- **WHEN** se resuelve con `pytest`
- **THEN** la respuesta es `solved` y su horario respeta la restricción

#### Scenario: Problema imposible
- **GIVEN** un profesor con dos lecciones de 1 sesión cuyas unidades solo tienen el mismo emplazamiento, en dos clases con el mismo calendario
- **WHEN** se resuelve
- **THEN** la respuesta es `infeasible`

#### Scenario: Se acaba el tiempo
- **GIVEN** un problema grande y `limitSeconds` de 0,001
- **WHEN** se resuelve
- **THEN** la respuesta es `timeout`

#### Scenario: Determinismo
- **WHEN** se resuelve dos veces la misma petición
- **THEN** las dos respuestas son idénticas

### Requirement: Espera cancelable de OR-Tools
`OrToolsSolver` (`domain/schedule/orToolsSolver.ts`, implementa `ScheduleSolver`) MUST enviar la petición por el puerto `OrToolsTransport`, que recibe la petición y una `AbortSignal`. Mientras espera, MUST llamar a `options.isCancelled()` cada 500 ms, de modo que `RunGeneration` siga escribiendo el latido y leyendo la cancelación. Si la señal se activa, MUST abortar el transporte y devolver `{ status: 'cancelled' }`.

El tiempo de CP-SAT MUST ser el menor entre `ORTOOLS_LIMIT_MS` (60 000) y lo que quede de `limitMs`. Lo que sobra del límite queda para el diagnóstico, la alternativa o la mejora.

`ChildProcessOrToolsTransport` (`infrastructure/`) MUST ejecutar `SCHEDULE_ORTOOLS_PYTHON solver-ortools/cli.py`, escribir la petición en `stdin`, leer la respuesta de `stdout` y matar el proceso al abortar.

#### Scenario: Latido mientras busca
- **GIVEN** un transporte que tarda 2 segundos en responder
- **WHEN** se resuelve con un `isCancelled` contado
- **THEN** `isCancelled` se ha llamado al menos 3 veces antes de la respuesta

#### Scenario: Cancelar mientras busca
- **GIVEN** un transporte que no responde y un `isCancelled` que pasa a verdadero a los 1,2 segundos
- **WHEN** se resuelve
- **THEN** el resultado es `cancelled` antes de 2 segundos y la señal del transporte está abortada

#### Scenario: Proceso hijo cancelado
- **GIVEN** `ChildProcessOrToolsTransport` resolviendo un problema grande
- **WHEN** se aborta su señal
- **THEN** el proceso de Python termina y la promesa se rechaza con un error de cancelación

### Requirement: Validación y mejora del horario de OR-Tools
Con `solved`, `OrToolsSolver` MUST hacer lo siguiente:
- construir las entradas a partir de los emplazamientos con la misma función que `BacktrackingSolver` (`entriesOfPlacements`);
- validarlas con `validateSchedule`;
- si son válidas, aplicar la misma mejora que `BacktrackingSolver` (ver la capacidad `schedule-solver`, «Fase de mejora»), con `onPhase`, `onScore` y el mismo cálculo del presupuesto.

El resultado MUST ser `solved` con `engine: 'ORTOOLS'`. Durante la búsqueda de CP-SAT, `OrToolsSolver` MUST NOT llamar a `onProgress`. Al terminar, MUST llamarlo una vez con el total.

#### Scenario: Horario de OR-Tools mejorado (SC1–SC4)
- **GIVEN** un transporte que responde `solved` con un horario válido que la mejora puede bajar
- **WHEN** se resuelve con `improve`
- **THEN** el resultado es `solved` con `engine: 'ORTOOLS'`, `score.total` menor que `score.initialTotal`, y `onPhase` ha recibido `'IMPROVING'`

#### Scenario: Sin mejora
- **WHEN** se resuelve con `improve` `false` y el transporte responde `solved`
- **THEN** el resultado es `solved` con `engine: 'ORTOOLS'` y `stoppedBy` `SKIPPED`

### Requirement: Diagnóstico de un problema sin solución
Cuando CP-SAT responde `infeasible`, `OrToolsSolver` MUST ejecutar `BacktrackingSolver` con las mismas `options` y lo que quede de `limitMs`, para obtener la causa:
- **`infeasible`:** el resultado es ese `infeasible`, con su motivo y su lección, como hoy.
- **`timeout`:** el resultado es `timeout`, y se registra el log `warn` `ortools_infeasible_undiagnosed`.
- **`solved`:** los motores se contradicen. El resultado es ese horario, con `engine: 'BACKTRACKING'` y mejorado si se pidió, y se registra el log `error` `ortools_infeasible_contradicted`.

En ningún caso cambia el contrato del error `INFEASIBLE`.

#### Scenario: Causa del motor actual (HC2)
- **GIVEN** el problema «Dos lecciones para el único hueco del profesor» y un transporte que responde `infeasible`
- **WHEN** se resuelve
- **THEN** el resultado es `infeasible` con una de esas lecciones y el motivo `PROFESSOR_BUSY`

#### Scenario: Sin tiempo para diagnosticar
- **GIVEN** un transporte que responde `infeasible` cuando ya no queda tiempo
- **WHEN** se resuelve
- **THEN** el resultado es `timeout` y se registra `ortools_infeasible_undiagnosed`

#### Scenario: Los motores se contradicen
- **GIVEN** un problema resoluble y un transporte que responde `infeasible`
- **WHEN** se resuelve
- **THEN** el resultado es `solved` con `engine: 'BACKTRACKING'` y se registra `ortools_infeasible_contradicted`

### Requirement: Alternativa ante un fallo de OR-Tools
`OrToolsSolver` MUST pasar a `BacktrackingSolver`, con lo que quede de `limitMs`, con la mejora si se pidió y con las mismas `options`, en estos casos:
- el transporte se rechaza sin que se haya cancelado (`reason: 'invoke_error'`);
- la respuesta no supera la guarda de tipo (`reason: 'bad_response'`);
- `validateSchedule` rechaza el horario de OR-Tools (`reason: 'invalid_schedule'`).

En los tres casos MUST registrar un log `warn` con `event: 'ortools_fallback'`, el `reason` y `elapsed_ms`, sin nombres ni datos del colegio. El resultado de la alternativa MUST llevar `engine: 'BACKTRACKING'`. Con `timeout` de CP-SAT MUST NOT haber alternativa: el resultado es `timeout`.

#### Scenario: El proceso hijo falla
- **GIVEN** un transporte que se rechaza con un error
- **WHEN** se resuelve un problema resoluble
- **THEN** el resultado es `solved` con `engine: 'BACKTRACKING'` y se registra `ortools_fallback` con `reason` `invoke_error`

#### Scenario: Horario inválido de OR-Tools
- **GIVEN** un transporte que responde `solved` con dos unidades de un profesor en la misma celda
- **WHEN** se resuelve
- **THEN** el resultado es `solved` con `engine: 'BACKTRACKING'` y un horario válido, y se registra `ortools_fallback` con `reason` `invalid_schedule`

#### Scenario: Respuesta con otra forma
- **GIVEN** un transporte que responde `{ status: 'ok' }`
- **WHEN** se resuelve
- **THEN** se usa la alternativa y se registra `ortools_fallback` con `reason` `bad_response`

#### Scenario: Se acaba el tiempo en OR-Tools
- **GIVEN** un transporte que responde `timeout`
- **WHEN** se resuelve
- **THEN** el resultado es `timeout`, sin alternativa

### Requirement: Mismas restricciones en los dos motores
Un test de integración (`*.int.test.ts`, con el proceso hijo real) MUST resolver con `BacktrackingSolver` y con `OrToolsSolver`, sin mejora, estos problemas: los de `test-fixtures/schedule-generation.json`, el colegio de tamaño real y el colegio sin huecos libres de la capacidad `schedule-solver`.
- Si el resultado esperado es `solved`, `validateSchedule` MUST aceptar los dos horarios.
- Si es `infeasible`, los dos MUST devolver `infeasible`.

Los tiempos de los dos motores en estos problemas MUST anotarse en un informe del cambio. Son informativos y no bloquean.

#### Scenario: Los dos motores cumplen HC1–HC8
- **WHEN** se resuelve cada problema resoluble con los dos motores
- **THEN** `validateSchedule` no da violaciones en ninguno

#### Scenario: Los dos motores ven el imposible
- **WHEN** se resuelve cada problema imposible de la tabla con los dos motores
- **THEN** los dos devuelven `infeasible`

### Requirement: Punto de entrada de la Lambda de OR-Tools
`solver-ortools/handler.py` MUST exponer `handler(event, context)`. Recibe como `event` la misma petición JSON (versión 1) que `cli.py`, la valida con la misma función (`cli.validate`) y devuelve la respuesta de `solve` sin cambiarla. Una petición inválida MUST lanzar una excepción, que Lambda devuelve como `FunctionError` sin respuesta válida. No MUST leer variables de entorno, la base de datos ni SSM.

`solver-ortools/Dockerfile` MUST construir la imagen sobre `public.ecr.aws/lambda/python:3.12` para `linux/amd64`. Instala `requirements.txt` (solo `ortools`, no las dependencias de desarrollo), copia `solver.py`, `cli.py` y `handler.py`, y fija `handler.handler` como punto de entrada. `solver-ortools/.dockerignore` MUST excluir `.venv`, `tests`, las cachés y `requirements-dev.txt`.

#### Scenario: Misma respuesta que el proceso hijo
- **GIVEN** una petición válida
- **WHEN** se llama a `handler(petición, None)` desde `pytest`
- **THEN** la respuesta es igual a la de `solve(petición)`

#### Scenario: Petición inválida
- **WHEN** se llama a `handler` con `version: 2`
- **THEN** lanza `ValueError` con el campo que falla

#### Scenario: La imagen no lleva lo de desarrollo
- **WHEN** se lee `.dockerignore` y el `Dockerfile` en un test
- **THEN** se excluyen `.venv` y `tests`, y solo se instala `requirements.txt`

### Requirement: Transporte por Lambda
`LambdaOrToolsTransport` (`infrastructure/aws/`) MUST implementar `OrToolsTransport` invocando la función de `SCHEDULE_ORTOOLS_FUNCTION_NAME` con `InvokeCommand` (`InvocationType: 'RequestResponse'`) y la petición como `Payload`. Requisitos:
- **Sin reintentos y con tiempo acotado:** usa un cliente con `maxAttempts: 1`, porque un reintento volvería a ejecutar CP-SAT. Un tiempo de petición de `limitSeconds` + 30 s.
- **Cancelación:** se pasa la `AbortSignal` a `send`. Abortar MUST rechazar al momento con `AbortError`. La Lambda sigue hasta su límite y su resultado se descarta.
- **Errores:** MUST rechazar con `OrToolsInvokeError`, sin el contenido del error en el mensaje, si la respuesta lleva `FunctionError`, si `StatusCode` no es 200 o si el `Payload` no es JSON. Con éxito MUST resolver con el JSON leído, que `OrToolsSolver` comprueba con su guarda.

#### Scenario: Respuesta correcta
- **GIVEN** un cliente de Lambda simulado que responde `StatusCode` 200 con el JSON de una respuesta `solved`
- **WHEN** se resuelve
- **THEN** el transporte devuelve ese JSON y la invocación lleva `RequestResponse`, el nombre de la función y la petición serializada

#### Scenario: La función falla
- **GIVEN** una respuesta con `FunctionError: 'Unhandled'` y un mensaje en el `Payload`
- **WHEN** se resuelve
- **THEN** el transporte rechaza con `OrToolsInvokeError` y su mensaje no contiene el del `Payload`

#### Scenario: Cancelar
- **GIVEN** una invocación que no termina
- **WHEN** se aborta la señal
- **THEN** el transporte rechaza con `AbortError` y la señal llegó a `send`

#### Scenario: Sin reintentos
- **WHEN** se construye el transporte
- **THEN** su cliente tiene `maxAttempts` 1

### Requirement: Aviso del motor en uso
`SolveOptions` MUST admitir `onEngine(engine)`. `OrToolsSolver` MUST llamarlo con `'BACKTRACKING'` justo antes de usar el motor actual, ya sea como alternativa o para diagnosticar un `infeasible`. Así quien lo lanza sabe que la búsqueda ya no es de CP-SAT. `BacktrackingSolver` MUST NOT llamarlo.

#### Scenario: Alternativa
- **GIVEN** un transporte que falla
- **WHEN** se resuelve con `onEngine`
- **THEN** `onEngine` recibe `'BACKTRACKING'` una vez, antes del primer `onProgress` del motor actual

#### Scenario: OR-Tools resuelve
- **WHEN** el transporte responde `solved` con un horario válido
- **THEN** `onEngine` no se llama

