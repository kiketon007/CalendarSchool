## MODIFIED Requirements

### Requirement: Contrato de la generación en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`:
- `POST /api/schedule/generate` (`ADMIN`, con un cuerpo **opcional** `StartGenerationRequest` `{ improve?: boolean }`, `additionalProperties: false`): `202` con `{ generation }`; `400 VALIDATION_ERROR` (con el error en el campo `improve`), `401`, `403 FORBIDDEN`, `409 SCHEDULE_NOT_READY` y `409 GENERATION_IN_PROGRESS`.
- `GET /api/schedule/generate` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`): `200` con `{ generation: Generation | null }`.
- `GET /api/schedule/generate/{id}` (`ADMIN` y `MEMBER`, `no-store`): `200` con `{ generation }` y `404`.
- `DELETE /api/schedule/generate/{id}` (`ADMIN`): `200` con `{ generation }`, `403`, `404` y `409 GENERATION_NOT_CANCELLABLE`.

El esquema `Generation` MUST ser `{ id, status (QUEUED|RUNNING|COMPLETED|FAILED|CANCELLED), progress (0–100), placed, total, improve (booleano), phase (GenerationPhase: SEARCHING|IMPROVING), score (ScheduleScore|null), improvementCancelled (booleano), errorCode (NOT_READY|INFEASIBLE|TIMEOUT|INTERNAL|null), errorMessage (string|null), errorDetails (objeto|null), scheduleId (uuid|null), createdAt, startedAt, finishedAt }`. `errorDetails` de `INFEASIBLE` MUST llevar el motivo (`NO_FREE_CELLS`, `CLASS_BUSY`, `PROFESSOR_BUSY`, `DAILY_RULE` o `MAX_HOURS`) y la lección con sus referencias (curso, clase, asignatura y profesor, cada uno con `id` y `name`). Los tres códigos (`SCHEDULE_NOT_READY`, `GENERATION_IN_PROGRESS`, `GENERATION_NOT_CANCELLABLE`) MUST estar a la vez en el enum `ErrorCode` y en `ERROR_CODES` de `appError.ts`; esta historia no añade códigos.

#### Scenario: Contrato y tipos
- **WHEN** se lee `docs/api-spec.yml` y se regeneran los tipos con `npm run api:types -w frontend`
- **THEN** existen las cuatro operaciones, `StartGenerationRequest`, `GenerationPhase`, `Generation` con sus campos nuevos y los tres códigos de error, y `api:types:check` y `appError.test.ts` pasan

### Requirement: Iniciar una generación
`POST /api/schedule/generate` MUST, para un `ADMIN`: leer el cuerpo opcional (sin cuerpo o sin `improve`, `improve` es `true`; un `improve` que no sea booleano o un campo desconocido es `400 VALIDATION_ERROR` sin crear nada; el rol se comprueba **antes** que el cuerpo); comprobar que no hay bloqueantes con `readinessOf` sobre la foto del colegio de la sesión (con bloqueantes, `409 SCHEDULE_NOT_READY` sin crear nada); marcar como interrumpidas las generaciones atascadas del colegio; insertar la generación en `QUEUED` con su `improve` (si el índice único parcial la rechaza, `409 GENERATION_IN_PROGRESS`); lanzar el worker de forma asíncrona con el id; y responder `202` con la generación. Si el lanzamiento falla, MUST marcar la generación `FAILED` con `INTERNAL` y responder `500`, de modo que no quede ninguna `QUEUED`.

#### Scenario: Generar
- **GIVEN** un administrador y un colegio sin bloqueantes
- **WHEN** llama a `POST /api/schedule/generate` sin cuerpo
- **THEN** responde `202` con una generación `QUEUED`, `progress` 0, los totales a cero, `improve` `true`, `phase` `SEARCHING` y `score` `null`, y el worker recibe su id

#### Scenario: Generar sin mejorar
- **WHEN** llama con `{ "improve": false }`
- **THEN** responde `202` con `improve` `false` y la fila lo guarda

#### Scenario: Cuerpo inválido
- **WHEN** llama con `{ "improve": "si" }` o con `{ "other": true }`
- **THEN** responde `400 VALIDATION_ERROR` con el error en `improve` (o en el campo desconocido) y no hay ninguna fila nueva

#### Scenario: Un miembro con cuerpo inválido
- **WHEN** un `MEMBER` llama con `{ "improve": "si" }`
- **THEN** responde `403 FORBIDDEN`

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

### Requirement: Ejecución en segundo plano
`runGeneration(generationId)` MUST, en este orden: reclamar la fila con una actualización condicional `QUEUED → RUNNING` (si no afecta a ninguna fila, termina sin hacer nada, de modo que un reintento no la ejecuta dos veces); repetir la comprobación previa (con bloqueantes, `FAILED` con `NOT_READY`); construir la entrada y llamar al motor con el límite `SCHEDULE_MAX_SECONDS`, el `improve` de la fila, un reloj, la señal de cancelación, el progreso, el aviso de fase y la puntuación; y, según el resultado, terminar en `COMPLETED` (guardando el borrador con su puntuación, también cuando la mejora se detuvo por tiempo o por cancelación), `FAILED` con `INFEASIBLE` (con el motivo y la lección en `errorDetails`), `FAILED` con `TIMEOUT` (solo si la fase 1 agotó el tiempo sin horario), `CANCELLED` (solo si se canceló antes de tener un horario válido) o, ante cualquier excepción, `FAILED` con `INTERNAL`. Una generación que termina MUST dejar `finished_at`, y una `FAILED` o `CANCELLED` MUST NOT modificar el borrador anterior.

#### Scenario: Éxito
- **GIVEN** un colegio con solución
- **WHEN** corre el worker
- **THEN** la generación pasa por `RUNNING` a `COMPLETED`, con `scheduleId`, `placed` igual a `total`, `score` igual al del borrador y un borrador con una entrada por sesión

#### Scenario: Éxito sin mejorar
- **GIVEN** una generación con `improve` `false`
- **WHEN** corre el worker
- **THEN** no pasa nunca por `IMPROVING`, termina `COMPLETED` y su `score` tiene `initialTotal` igual a `total`

#### Scenario: Se acaba el tiempo mientras mejora
- **GIVEN** un horario válido encontrado y la mejora sin terminar al agotar el límite
- **THEN** termina `COMPLETED` con el mejor horario encontrado, no `FAILED` con `TIMEOUT`

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
- **GIVEN** un reloj que agota el límite antes de tener un horario válido
- **THEN** termina `FAILED` con `TIMEOUT` y un mensaje que dice que puede existir un horario

#### Scenario: Error interno
- **GIVEN** una excepción durante la ejecución (también si la mejora entregara un horario que no pasa el validador)
- **THEN** termina `FAILED` con `INTERNAL`, el mensaje no contiene la traza y la traza queda en el log

### Requirement: Progreso y latido
El worker MUST guardar `placed`, `total`, `phase`, `score` y `heartbeat_at` como mucho cada 2 segundos (reloj inyectado), no en cada llamada de progreso o de puntuación, y MUST informar del máximo de sesiones colocadas. Al empezar la mejora MUST pasar `phase` a `IMPROVING` en la siguiente escritura, y durante la mejora MUST seguir escribiendo el latido aunque la penalización no baje, para que la generación no se marque como atascada.

#### Scenario: Escrituras acotadas
- **GIVEN** mil llamadas de progreso o de puntuación en un segundo
- **THEN** el repositorio recibe una sola escritura de progreso

#### Scenario: El progreso no baja
- **WHEN** la búsqueda retrocede
- **THEN** el `progress` que ve la pantalla no disminuye

#### Scenario: Mejorando
- **GIVEN** una generación en la fase de mejora durante más de 2 segundos
- **WHEN** se lee la generación
- **THEN** es `RUNNING` con `phase` `IMPROVING`, `placed` igual a `total` y la `score` de la última escritura

#### Scenario: Una mejora larga no se atasca
- **GIVEN** una mejora que dura 60 segundos sin bajar la penalización
- **THEN** el latido sigue escribiéndose y la generación no pasa a `FAILED` por atascada

### Requirement: Cancelar una generación
`DELETE /api/schedule/generate/{id}` MUST, para un `ADMIN`, marcar `cancel_requested` en una generación `QUEUED` o `RUNNING` y responder `200` con la generación; si estaba `QUEUED`, pasarla directamente a `CANCELLED`. El worker MUST leer la marca en cada escritura de progreso y, como mucho 2 segundos después: en la **fase 1**, detener la búsqueda y dejar la generación en `CANCELLED` sin guardar ningún horario; en la **fase de mejora**, detener la mejora, guardar el mejor horario encontrado y dejar la generación en `COMPLETED`. La vista de la generación MUST exponer `improvementCancelled`, verdadero si y solo si la generación está `COMPLETED`, tenía `improve` y se marcó `cancel_requested`. Una generación terminada MUST responder `409 GENERATION_NOT_CANCELLABLE`.

#### Scenario: Cancelar en curso
- **GIVEN** una generación `RUNNING` en la fase 1
- **WHEN** el administrador la cancela
- **THEN** responde `200`, el worker la deja `CANCELLED` sin horario y se puede generar de nuevo

#### Scenario: Detener la mejora
- **GIVEN** una generación `RUNNING` con `phase` `IMPROVING`
- **WHEN** el administrador la cancela
- **THEN** responde `200`, el worker guarda el borrador con su puntuación y deja la generación `COMPLETED` con `improvementCancelled` `true`

#### Scenario: Cancelar antes de empezar
- **GIVEN** una generación `QUEUED`
- **THEN** pasa a `CANCELLED` y, si el worker llega después, no la reclama

#### Scenario: Ya terminada
- **THEN** responde `409 GENERATION_NOT_CANCELLABLE` y no cambia nada

### Requirement: Observabilidad
Cada generación MUST emitir los eventos `SCHEDULE_GENERATION_STARTED` (con `improve`), `SCHEDULE_GENERATION_COMPLETED` (con `score_total`, `initial_score_total`, `improvement_stopped_by`, `improvement_moves` e `improvement_ms`), `SCHEDULE_GENERATION_FAILED` y `SCHEDULE_GENERATION_CANCELLED`, todos con `school_id`, `actor_id`, id de la generación, `placed`, `total`, duración y `error_code`, y MUST NOT incluir nombres de profesores, cursos ni asignaturas.

#### Scenario: Un evento por resultado
- **WHEN** una generación termina con éxito, error o cancelación
- **THEN** se registra el evento correspondiente con esos campos y ningún nombre

#### Scenario: La mejora en el log
- **WHEN** una generación con mejora termina con éxito
- **THEN** `SCHEDULE_GENERATION_COMPLETED` lleva la penalización final y la inicial, el motivo de parada, los movimientos y la duración de la mejora

### Requirement: Panel de generación en «Generar horarios»
`/horarios` MUST mostrar, solo a un `ADMIN` y sin bloqueantes, el botón «Generar horarios», la casilla «Mejorar el horario con las preferencias» y el panel `components/ScheduleGenerationPanel`; un `MEMBER` MUST NOT ver el botón ni la casilla (puede ver el estado de una generación en curso o la última), y con bloqueantes MUST NOT haber botón ni casilla y la página lo explica. La casilla MUST estar **marcada por defecto** al montar el panel, tener un texto de ayuda enlazado con `aria-describedby` («Tarda más, hasta un minuto más, y reduce los huecos de los profesores y respeta las franjas preferidas»), estar junto a «Generar horarios» y al botón para generar de nuevo, deshabilitarse mientras no se puede iniciar una generación y enviar su valor como `improve` en el `POST`; no se recuerda entre visitas. Al montar el panel pide `GET /api/schedule/generate`; el sondeo cada 2 segundos MUST usar un temporizador encadenado, detenerse al desmontar o al terminar y descartar respuestas tardías. El panel MUST mostrar:
- **Generando, `phase` `SEARCHING`:** «Buscando un horario válido…», un `role="progressbar"` con el valor y el texto «{placed} de {total} sesiones» y un botón «Cancelar»; el botón «Generar» y la casilla deshabilitados;
- **Generando, `phase` `IMPROVING`:** «Mejorando el horario…», un `role="progressbar"` sin valor (sin `aria-valuenow`), «Penalización: {score.total}» y el botón «Detener y guardar el horario», que cancela la generación (el horario válido se guarda);
- **Completada:** «Horario borrador generado: {n} sesiones colocadas» (el `placed` de la respuesta, que no lleva el número de clases), el desglose (`ScheduleScoreSummary`, capacidad `schedule-score`) si `score` no es `null`, «Generado sin mejorar: las preferencias no se han aplicado» si `improve` es `false`, «Se detuvo la mejora: el horario válido se ha guardado» si `improvementCancelled`, y el botón para generar de nuevo, y según lo que sea hoy el `scheduleId` de la generación en el resumen de los horarios (`GET /api/schedule/overview`, que la página pasa al panel):
  - **el borrador vigente:** un enlace «Ver horario» a `/horarios/borrador` (también para un `MEMBER`) y, solo para un `ADMIN`, «Confirmar como oficial», que abre el diálogo de confirmar (capacidad `schedule-confirmation`) tras pedir el borrador para calcular sus desfases;
  - **el oficial vigente:** «Este horario es el oficial» y un enlace «Ver horario oficial» a `/horarios/oficial`;
  - **`null` u otro** (se descartó o lo sustituyó otra generación): «Este borrador ya no existe», sin enlace;
  solo el estado completado ofrece estos enlaces;
- **Fallida:** el texto del `errorCode`, con la lección y su enlace para `INFEASIBLE` (diciendo que la restricción es orientativa salvo `NO_FREE_CELLS`), el motivo de `TIMEOUT` con qué relajar, y «Error interno durante la generación. Inténtalo de nuevo o contacta con soporte (ID: {id})» para `INTERNAL`; con `NOT_READY` vuelve a mostrar la comprobación;
- **Cancelada:** «Generación cancelada» y el botón para generar de nuevo.

`services/scheduleGenerationService.ts` (`start(fetch, { improve })`, `current`, `get`, `cancel`) MUST devolver resultados por caso, validar la forma (también `improve`, `phase`, `score` e `improvementCancelled`) y no lanzar. Cuando una generación termina mientras se ve el panel, la página MUST volver a pedir el resumen de los horarios para saber qué es su nuevo `scheduleId`.

#### Scenario: Generar y seguir el progreso
- **GIVEN** un administrador en `/horarios` sin bloqueantes
- **WHEN** pulsa «Generar horarios» con la casilla marcada
- **THEN** el `POST` lleva `improve: true`, ve «Buscando un horario válido…» con la barra y «Cancelar», después «Mejorando el horario…» con la penalización y «Detener y guardar el horario», y al terminar el resumen con el desglose, «Ver horario» y «Confirmar como oficial»

#### Scenario: Casilla marcada por defecto
- **WHEN** un administrador abre `/horarios` sin bloqueantes
- **THEN** la casilla «Mejorar el horario con las preferencias» está marcada y tiene su texto de ayuda

#### Scenario: Generar sin mejorar
- **WHEN** desmarca la casilla y pulsa «Generar horarios»
- **THEN** el `POST` lleva `improve: false`, el panel no muestra «Mejorando el horario…» y el resumen dice «Generado sin mejorar: las preferencias no se han aplicado»

#### Scenario: Detener la mejora
- **GIVEN** una generación en `IMPROVING`
- **WHEN** el administrador pulsa «Detener y guardar el horario» y confirma
- **THEN** el resumen dice «Se detuvo la mejora: el horario válido se ha guardado» y ofrece «Ver horario»

#### Scenario: Un miembro
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** no ve «Generar horarios», la casilla, «Cancelar», «Detener y guardar el horario» ni «Confirmar como oficial»

#### Scenario: Con bloqueantes
- **THEN** no hay botón ni casilla y la página dice que hay que corregirlos primero

#### Scenario: Recargar en mitad de una generación
- **WHEN** el administrador recarga la página con una generación `RUNNING`
- **THEN** el panel retoma su progreso, en la fase en la que esté, sin pulsar nada

#### Scenario: Sondeo que se detiene
- **WHEN** la generación termina o el panel se desmonta
- **THEN** no se hacen más peticiones de la generación y una respuesta tardía no cambia la pantalla

#### Scenario: Errores
- **THEN** cada `errorCode` muestra su texto; `INFEASIBLE` enlaza a donde se corrige y `INTERNAL` muestra el id y nunca la traza

#### Scenario: Ver el horario desde el resumen
- **GIVEN** una generación completada cuyo horario es el borrador vigente
- **WHEN** un `ADMIN` o un `MEMBER` abre `/horarios`
- **THEN** el resumen ofrece «Ver horario», que lleva a `/horarios/borrador`; una generación en curso, fallida o cancelada no lo ofrece

#### Scenario: Su horario ya es el oficial
- **GIVEN** una generación completada cuyo borrador se confirmó
- **WHEN** se abre `/horarios`
- **THEN** el resumen dice «Este horario es el oficial» y enlaza a `/horarios/oficial`

#### Scenario: Su borrador ya no existe
- **GIVEN** una generación completada cuyo borrador se descartó
- **WHEN** se abre `/horarios`
- **THEN** el resumen dice «Este borrador ya no existe», sin enlace ni «Confirmar como oficial»

### Requirement: Accesibilidad e i18n de la generación
Los textos del panel MUST estar en `schedule.generation.*` de `es.json` y `en.json`. El progreso y la fase MUST anunciarse sin depender del color; el cambio de estado (buscando, mejorando, terminada, error) MUST comunicarse en una región `role="status"` o `role="alert"`; el foco MUST NOT perderse al deshabilitar el botón o la casilla; la casilla MUST tener su etiqueta asociada; y la página MUST usarse a 360 px y pasar `axe` sin violaciones.

#### Scenario: Accesibilidad
- **WHEN** el panel está en cada uno de sus estados, incluida la fase de mejora
- **THEN** `axe` no da violaciones, la barra de la fase 1 tiene su nombre accesible, valor mínimo, máximo y actual, y la de la mejora su nombre accesible sin valor

### Requirement: Generación de extremo a extremo
La suite de Cypress MUST recorrer, con el lanzador en memoria, que un administrador genera con la casilla marcada, ve el progreso y el resumen con el desglose, que genera con la casilla desmarcada y ve «Generado sin mejorar», que un colegio con un bloqueante no ofrece el botón, que un `MEMBER` no ve el botón ni la casilla y que la página se usa a 360 px.

#### Scenario: Recorrido completo
- **GIVEN** un colegio con una asignatura asignada que tiene franjas preferidas
- **WHEN** el administrador pulsa «Generar horarios» con la casilla marcada
- **THEN** llega al resumen «Horario borrador generado» con «Franjas preferidas» en el desglose y, tras recargar, lo sigue viendo

#### Scenario: Sin mejorar
- **WHEN** el administrador desmarca la casilla y genera de nuevo
- **THEN** el resumen dice «Generado sin mejorar: las preferencias no se han aplicado»

## ADDED Requirements

### Requirement: Columnas de la mejora en la generación
La migración MUST añadir a `schedule_generations` `improve` (`boolean NOT NULL DEFAULT true`), `phase` (enum `GenerationPhase`: `SEARCHING`, `IMPROVING`; `NOT NULL DEFAULT 'SEARCHING'`) y `score` (`jsonb`, nulo). Las generaciones existentes MUST quedar con `improve` `true`, `phase` `SEARCHING` y `score` nulo, y verse así en la API (con `improvementCancelled` `false` salvo que fueran `COMPLETED` con `cancel_requested`, lo que hasta ahora no ocurría). Al leer, `score` MUST validarse con el mismo guardia que el del horario (`isScheduleScore`) y leerse como `null` si no lo cumple.

#### Scenario: Generación anterior a la migración
- **GIVEN** una generación `COMPLETED` guardada antes de la migración
- **WHEN** se lee con `GET /api/schedule/generate/{id}`
- **THEN** responde con `improve` `true`, `phase` `SEARCHING`, `score` `null` e `improvementCancelled` `false`

#### Scenario: Puntuación guardada inválida
- **GIVEN** una generación con un `score` guardado a mano sin `total`
- **THEN** se lee con `score` `null`
