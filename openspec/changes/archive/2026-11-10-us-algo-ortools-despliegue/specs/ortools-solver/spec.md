## ADDED Requirements

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
