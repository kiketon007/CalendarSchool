# schedule-score Specification

## Purpose
TBD - created by archiving change us-algo-run-b. Update Purpose after archive.
## Requirements
### Requirement: Contrato de la puntuación en OpenAPI
`docs/api-spec.yml` MUST definir el esquema `ScheduleScore` (`additionalProperties: false`) con seis enteros requeridos y `minimum: 0`: `total`, `preferredMisses`, `preferredTotal`, `professorGaps`, `consecutiveDays` e `initialTotal`. `ScheduleSummary` y `ScheduleDetail` MUST ganar `score` (`ScheduleScore | null`), requerido. Los tipos del frontend MUST regenerarse (`npm run api:types -w frontend`) y `api:types:check` MUST pasar.

#### Scenario: Contrato y tipos
- **WHEN** se lee `docs/api-spec.yml` y se regeneran los tipos
- **THEN** existen `ScheduleScore` y el campo `score` en `ScheduleSummary` y `ScheduleDetail`, y `api:types:check` pasa

### Requirement: Puntuación de un horario
La función pura `scoreSchedule(input, entries)` (`domain/schedule/scheduleScore.ts`, sin E/S y sin estado del motor, para que la reutilice cualquier otro motor) MUST devolver el desglose de las restricciones blandas de un horario:
- **SC4 franjas preferidas:** `preferredTotal` son las sesiones de las lecciones que tienen alguna celda preferida válida (`GenerationLesson.preferred`, ver `schedule-solver`) y `preferredMisses`, las de esas sesiones que no están en una de sus celdas preferidas. Las lecciones sin preferidas no cuentan en ninguno de los dos.
- **SC1 huecos de los profesores:** por profesor y día, entre cada dos entradas suyas consecutivas por hora, `professorGaps` cuenta las **celdas de los calendarios de los cursos en los que da clase** que caen enteras entre el fin de la primera y el inicio de la segunda, contando una sola vez cada intervalo `[inicio, fin)` distinto. Un recreo no es una celda; antes de su primera entrada y después de la última del día no hay hueco.
- **SC3 días seguidos:** por lección, `consecutiveDays` cuenta los pares de días contiguos (lunes-martes, martes-miércoles, miércoles-jueves y jueves-viernes) en los que la lección tiene alguna entrada.
- **Penalización:** `total = 10 · preferredMisses + 3 · professorGaps + 1 · consecutiveDays`, con los pesos en una sola constante (`SCORE_WEIGHTS`); cuanto menor, mejor.

`scoreSchedule` MUST devolver `initialTotal` igual a `total`; quien mejora un horario (el motor) MUST sustituirlo por la penalización del horario de partida. Las entradas sin profesor no cuentan para SC1. SC2 (aulas) no existe.

#### Scenario: Franjas preferidas (SC4)
- **GIVEN** una lección de 3 sesiones con las primeras sesiones de lunes, martes y miércoles como preferidas, y un horario con dos de sus sesiones en esas celdas y la tercera el jueves
- **WHEN** se puntúa
- **THEN** `preferredTotal` es 3 y `preferredMisses` es 1

#### Scenario: Una lección sin preferidas no cuenta (SC4)
- **GIVEN** un horario cuyas lecciones no tienen celdas preferidas
- **THEN** `preferredTotal` y `preferredMisses` son 0

#### Scenario: Hueco y recreo (SC1)
- **GIVEN** un calendario con 3 sesiones, un recreo y 2 sesiones, y un profesor con clase el lunes en la 1.ª y la 3.ª sesión y el martes en la 3.ª y la 4.ª (separadas solo por el recreo)
- **WHEN** se puntúa
- **THEN** `professorGaps` es 1 (la 2.ª sesión del lunes) y el martes no suma

#### Scenario: Antes de la primera y después de la última (SC1)
- **GIVEN** un profesor con una única sesión el lunes, en la 4.ª
- **THEN** `professorGaps` es 0

#### Scenario: Calendarios distintos (SC1)
- **GIVEN** un profesor que da clase en dos cursos con calendarios distintos y tiene, el mismo día, una sesión que termina a las 10:00 en uno y otra que empieza a las 11:00 en el otro, con una sesión de 10:00 a 10:45 en el primer calendario y otra de 10:00 a 11:00 en el segundo
- **THEN** `professorGaps` suma 2 (dos intervalos distintos caben enteros en el hueco); si los dos calendarios tuvieran la misma sesión de 10:00 a 11:00, sumaría 1

#### Scenario: Días seguidos (SC3)
- **GIVEN** una lección con sesiones el lunes, martes y miércoles, y otra el lunes, miércoles y viernes
- **THEN** la primera suma 2 a `consecutiveDays` y la segunda 0

#### Scenario: Penalización ponderada
- **GIVEN** un horario con 2 sesiones fuera de sus preferidas, 3 huecos y 4 pares de días seguidos
- **THEN** `total` es `10·2 + 3·3 + 1·4 = 33` e `initialTotal` es 33

#### Scenario: Tabla de casos
- **WHEN** se recorre `test-fixtures/schedule-score.json` (casos pequeños calculados a mano: huecos con recreo, huecos entre calendarios distintos, entradas sin profesor, días seguidos con bloques y con máximo al día, lecciones sin preferidas y preferidas fuera del calendario)
- **THEN** cada caso da exactamente su desglose

### Requirement: Puntuación guardada con el horario
La migración MUST añadir `schedules.score` (`jsonb`, nulo). Al guardar el borrador de una generación resuelta (`ScheduleRepository.replaceDraft`), su `score` MUST guardarse en la misma transacción que el horario y sus entradas. Confirmar el borrador como oficial MUST conservarlo (promueve la misma fila). Al leer un horario (`ScheduleReadRepository`: borrador, oficial vigente, por id y la lista de anteriores, y el resumen de `GET /api/schedule/overview`), `score` MUST validarse con un guardia de tipos (`isScheduleScore`): un JSON que no tenga los seis enteros no negativos MUST leerse como `null` sin romper la lectura. Un horario guardado antes de esta historia MUST leerse con `score: null`.

#### Scenario: El borrador lleva su puntuación
- **GIVEN** una generación que termina con éxito
- **WHEN** se pide `GET /api/schedule/draft`
- **THEN** `schedule.score` es el desglose del horario guardado, con `initialTotal` mayor o igual que `total`

#### Scenario: La conserva al confirmarlo
- **GIVEN** ese borrador
- **WHEN** se confirma y se pide `GET /api/schedule/official`, y más tarde, ya sustituido, `GET /api/schedule/{id}` y `GET /api/schedule/previous`
- **THEN** todas devuelven el mismo `score`

#### Scenario: Horario antiguo o JSON inválido
- **GIVEN** un horario con `score` nulo y otro con un `score` guardado a mano sin `total`
- **WHEN** se leen
- **THEN** los dos responden `200` con `score: null`

### Requirement: Desglose en la página del horario
El componente `components/ScheduleScoreSummary` MUST mostrar el desglose de un `ScheduleScore` como una lista de descripción (`dl`): «Franjas preferidas: {cumplidas} de {preferredTotal}» (con `cumplidas = preferredTotal − preferredMisses`, y solo si `preferredTotal` es mayor que 0), «Huecos de profesores: {professorGaps}», «Asignaturas en días seguidos: {consecutiveDays}» y «Penalización: {total}», con «antes de mejorar: {initialTotal}» solo si es distinto de `total` y la aclaración «cuanto menos, mejor». La cabecera de `ScheduleDraftPage` MUST mostrarlo en el borrador, el oficial y los anteriores cuando `score` no es `null`, y nada cuando es `null`. Los servicios del borrador y de los horarios MUST validar `score` con el mismo guardia (`isScheduleScore`, compartido en el frontend). Los textos MUST estar en `schedule.score.*` de `es.json` y `en.json`, el desglose MUST NOT depender del color y la página MUST pasar `axe` sin violaciones y caber a 360 px sin desplazamiento horizontal.

#### Scenario: Ver el desglose del borrador
- **GIVEN** un borrador con `score` `{ total: 134, preferredMisses: 8, preferredTotal: 50, professorGaps: 18, consecutiveDays: 6, initialTotal: 220 }`
- **WHEN** se abre `/horarios/borrador`
- **THEN** la cabecera dice «Franjas preferidas: 42 de 50», «Huecos de profesores: 18», «Asignaturas en días seguidos: 6» y «Penalización: 134 (antes de mejorar: 220; cuanto menos, mejor)»

#### Scenario: Sin preferidas
- **GIVEN** un `score` con `preferredTotal` 0
- **THEN** no aparece «Franjas preferidas»

#### Scenario: Sin puntuación
- **GIVEN** un horario oficial con `score: null`
- **WHEN** se abre `/horarios/oficial`
- **THEN** la página se ve como antes, sin desglose

#### Scenario: Un miembro
- **WHEN** un `MEMBER` abre el borrador, el oficial o un anterior con puntuación
- **THEN** ve el mismo desglose que un `ADMIN`

#### Scenario: Accesibilidad y móvil
- **WHEN** se pinta el desglose a 1280 y a 360 px
- **THEN** `axe` no da violaciones y la página no se desplaza en horizontal

