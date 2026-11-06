# schedule-solver Specification

## Purpose
TBD - created by archiving change us-algo-run-motor. Update Purpose after archive.
## Requirements
### Requirement: Entrada del motor
La función pura `generationInputOf(problem, compareNames)` (`domain/schedule/generationInput.ts`, con el orden de los nombres del castellano inyectado) MUST convertir la foto del problema (`SchedulingProblem`) en la entrada del motor:
- **Lecciones:** una por clase y asignatura **activa** del curso de la clase que tenga profesor en esa clase, con el profesor, las sesiones a la semana, el máximo al día (1 sin regla), el tamaño de bloque (o ninguno) y sus **celdas preferidas** (`preferred`): las celdas preferidas de la asignatura en el curso que existen en el calendario actual y no están prohibidas (gana la prohibida; las que ya no existen en el calendario se ignoran). No entran las asignaturas inactivas, las clases sin profesor ni los cursos sin calendario.
- **Celdas de cada curso:** las sesiones de su calendario numeradas en orden (los recreos no cuentan), con su inicio y fin en minutos y su tramo entre recreos, para los cinco días.
- **Unidades de cada lección:** con la carga `L` y el bloque `k`, `⌊L/k⌋` bloques de `k` sesiones y `L mod k` sueltas (sin bloque, `L` sueltas).
- **Dominio de cada unidad:** los emplazamientos `(día, primera sesión)` cuyas celdas son seguidas, del mismo tramo, no prohibidas para la asignatura en el curso (las celdas guardadas que ya no existen en el calendario se ignoran) y sin solape con un tramo no disponible del profesor (`[a, b)` y `[s, e)` se solapan si `a < e` y `s < b`). Las preferidas MUST NOT cambiar el dominio.

#### Scenario: Lecciones de un curso
- **GIVEN** 1º Primaria con las clases A y B, Lengua (activa, 5 sesiones, profesor en A y B) y Francés (inactiva)
- **WHEN** se construye la entrada
- **THEN** hay dos lecciones, Lengua en A y Lengua en B, y ninguna de Francés

#### Scenario: Unidades con bloque
- **GIVEN** una lección de 5 sesiones con bloques de 2
- **THEN** tiene dos bloques de 2 y una suelta

#### Scenario: Dominio con recreo, prohibidas y disponibilidad (HC3, HC4, HC8)
- **GIVEN** un calendario de 3 sesiones, un recreo y 2 sesiones, una lección con bloques de 2, el lunes prohibido y un profesor que no puede los martes de 9:00 a 10:00 (la primera sesión)
- **THEN** el dominio del bloque no tiene ningún emplazamiento el lunes, ninguno que empiece en la 3.ª sesión (cruzaría el recreo) ni ninguno el martes que incluya la 1.ª sesión

#### Scenario: Preferidas válidas (SC4 frente a HC8)
- **GIVEN** una asignatura con preferidas el lunes en la 1.ª sesión, el martes en la 1.ª y el miércoles en la 7.ª (el calendario tiene 5 sesiones), y el martes prohibido
- **WHEN** se construye la entrada
- **THEN** su lección tiene como única preferida la del lunes, y el dominio de sus unidades es el mismo que sin preferidas

### Requirement: Horario que cumple las restricciones duras
El motor (`ScheduleSolver.solve(input, options)`, asíncrono porque cede el control al bucle de eventos al consultar el tiempo y la cancelación, implementado por `BacktrackingSolver` en `domain/schedule/`) MUST devolver, cuando encuentra solución, `{ status: 'solved', entries }`, con una entrada `{ courseId, classId, subjectId, professorId, dayOfWeek, sessionNumber, startMinute, endMinute }` por sesión, que cumpla:
- **HC1 Carga exacta:** cada lección tiene exactamente sus sesiones a la semana.
- **HC2 Un profesor, un sitio:** dos entradas de un profesor el mismo día no se solapan en hora, aunque sean de cursos con calendarios distintos; que solo se toquen no es un choque.
- **HC3 Reparto diario:** cada día, una lección tiene como mucho un bloque de `k` sesiones seguidas del mismo tramo y, si lo tiene, ninguna suelta; si no, como mucho su máximo al día de sueltas (1 sin regla).
- **HC4 Disponibilidad:** ninguna entrada se solapa con un tramo no disponible de su profesor.
- **HC5 Una asignatura por clase y hueco:** no hay dos entradas con la misma clase, día y sesión.
- **HC6 Profesor de la asignación:** cada entrada lleva el profesor asignado a esa asignatura en esa clase.
- **HC7 Máximo de 23 horas:** la suma de los minutos de las entradas de cada profesor no pasa de 1380.
- **HC8 Franjas prohibidas:** ninguna entrada está en una celda prohibida de su asignatura en su curso.

Las celdas que no necesita ninguna lección quedan **sin entrada** (huecos libres). Los nombres solo se usan para ordenar y explicar: el motor no los guarda en las entradas.

#### Scenario: Colegio pequeño resuelto (HC1, HC5, HC6)
- **GIVEN** un curso de una clase con un calendario de 5 sesiones al día, Lengua (5 sesiones) y Matemáticas (5), cada una con su profesor
- **WHEN** se resuelve
- **THEN** el resultado es `solved` con 10 entradas, 5 de cada asignatura, ninguna en la misma celda y cada una con su profesor
- **AND** quedan 15 celdas sin entrada

#### Scenario: Calendarios distintos (HC2, HC7)
- **GIVEN** un profesor que da clase en un curso con sesiones de 45 minutos y en otro con sesiones de 60 minutos
- **WHEN** se resuelve
- **THEN** sus entradas no se solapan en hora ningún día y la suma de sus minutos no pasa de 1380

#### Scenario: El tutor libre da clase en otra clase a esa hora (HC2)
- **GIVEN** un calendario de 1 sesión al día (5 a la semana), 1º A con Lengua (3 sesiones, Luis, su tutor) e Inglés (2, Eva, especialista), y 1º B con Matemáticas (2, Luis)
- **WHEN** se resuelve
- **THEN** las 2 sesiones de Matemáticas de Luis en 1º B caen en los dos días en que Eva da Inglés en 1º A (son los únicos en que Luis no está en 1º A)
- **AND** las entradas no llevan ninguna marca del tutor

#### Scenario: Bloques y máximo al día (HC3)
- **GIVEN** una lección de 4 sesiones con bloques de 2 y otra de 4 sesiones con un máximo de 2 al día
- **WHEN** se resuelve
- **THEN** la primera tiene dos días con un bloque de 2 seguidas del mismo tramo y nada más esos días
- **AND** la segunda no tiene más de 2 sesiones ningún día

#### Scenario: Disponibilidad y franjas prohibidas (HC4, HC8)
- **GIVEN** una lección cuyo profesor no puede los lunes y cuya asignatura tiene prohibidos los viernes
- **WHEN** se resuelve
- **THEN** ninguna de sus entradas está en lunes ni en viernes

### Requirement: Problema sin solución
Cuando la búsqueda termina sin encontrar un horario, el motor MUST devolver `{ status: 'infeasible', cause }` y ninguna entrada. La causa lleva la lección (curso, clase, asignatura y profesor, con id y nombre) y un motivo:
- `NO_FREE_CELLS`: antes de buscar, una unidad ya no tenía ningún emplazamiento (franjas prohibidas, disponibilidad y recreos no dejan sitio);
- si no, al agotar la búsqueda, la lección que más veces se quedó sin opciones y la restricción que más valores le quitó: `CLASS_BUSY` (HC5), `PROFESSOR_BUSY` (HC2), `DAILY_RULE` (HC3) o `MAX_HOURS` (HC7). Esta segunda causa es orientativa y el texto que la muestre MUST decirlo.

#### Scenario: Sin sitio por restricciones contradictorias (HC4 y HC8)
- **GIVEN** una lección de 1 sesión cuya asignatura tiene prohibidos lunes a jueves y cuyo profesor no puede el viernes
- **WHEN** se resuelve
- **THEN** el resultado es `infeasible` con esa lección y el motivo `NO_FREE_CELLS`

#### Scenario: Dos lecciones para el único hueco del profesor (HC2)
- **GIVEN** un profesor que solo puede en una celda de la semana y da dos lecciones de 1 sesión en dos clases con el mismo calendario
- **WHEN** se resuelve
- **THEN** el resultado es `infeasible` con una de esas lecciones y el motivo `PROFESSOR_BUSY`

### Requirement: Tiempo máximo y cancelación
El motor MUST recibir en `options` el límite de tiempo de toda la resolución (`limitMs`, 120 000 por defecto), un reloj (`now()`) y una señal de cancelación (`isCancelled()`), y consultarlos al menos cada 1024 nodos de la búsqueda de la fase 1 y cada 1024 evaluaciones de la fase de mejora. En la **fase 1** (aún sin horario válido) MUST devolver `{ status: 'timeout', placed, total }` al agotar el límite o `{ status: 'cancelled' }` al ver la señal, sin entradas. En la **fase de mejora** (ya hay un horario válido) agotar el tiempo o ver la señal MUST terminar la mejora y devolver `solved` con el mejor horario encontrado (ver «Fase de mejora»). Puede recibir `onProgress(placed, total)`, que MUST informar en sesiones del **máximo** colocado hasta el momento (nunca baja), `onPhase(phase)`, llamado con `'IMPROVING'` al empezar la mejora, y `onScore(score)`, llamado con la puntuación de partida y cada vez que la mejora baja la penalización.

#### Scenario: Se acaba el tiempo
- **GIVEN** un reloj que ya pasó el límite al empezar la búsqueda de un problema no trivial
- **WHEN** se resuelve
- **THEN** el resultado es `timeout` con las sesiones colocadas y el total, y no hay fase de mejora

#### Scenario: Cancelación
- **GIVEN** una señal que pasa a cancelada tras los primeros nodos de la fase 1
- **THEN** el resultado es `cancelled`

#### Scenario: Progreso que no baja
- **WHEN** se resuelve un problema que obliga a retroceder
- **THEN** los valores que recibe `onProgress` nunca bajan y el último, en `solved`, es el total

#### Scenario: Aviso de las fases
- **WHEN** se resuelve con mejora un problema con solución
- **THEN** `onPhase` recibe `'IMPROVING'` una vez, después del último `onProgress`, y los valores de `onScore` nunca suben

### Requirement: Determinismo
El motor MUST devolver el mismo resultado para la misma entrada y la misma secuencia del reloj: el orden de las variables y de los valores es estable (curso, clase y asignatura por nombre con el comparador inyectado, índice de unidad, y día y sesión ascendentes), el único azar es el de los reinicios, con una semilla fija, y la fase de mejora recorre las unidades y los movimientos en un orden fijo.

#### Scenario: Dos ejecuciones
- **WHEN** se resuelve dos veces la misma entrada, con mejora y con un reloj contado
- **THEN** las dos entradas son idénticas, en el mismo orden, y la puntuación es la misma

### Requirement: Validador independiente
La función pura `validateSchedule(input, entries)` (`domain/schedule/validateSchedule.ts`) MUST comprobar HC1–HC8 y que cada entrada sea una celda real del calendario de su curso, sin usar el estado del motor, y devolver la lista de violaciones (`{ rule: 'HC1' … 'HC8', … referencias }`), vacía si el horario es válido. El motor MUST validar el horario que devuelve en `solved` —el de la fase 1 y, si hubo mejora, el mejorado— y lanzar un error si hay violaciones (es un fallo del motor), de modo que nunca entrega un horario inválido.

#### Scenario: Cada regla rota
- **GIVEN** horarios construidos a mano, cada uno con una sola violación (una sesión de menos, un profesor en dos sitios con calendarios distintos, dos sueltas un día sin regla, un bloque que cruza el recreo, una sesión en un tramo no disponible, dos asignaturas en el mismo hueco de una clase, otro profesor, 1395 minutos, una celda prohibida)
- **WHEN** se validan
- **THEN** cada uno da exactamente su violación (`HC1` … `HC8`)

#### Scenario: Lo que entrega el motor siempre es válido
- **GIVEN** problemas generados con una semilla fija
- **WHEN** el motor devuelve `solved`, con mejora y sin ella
- **THEN** `validateSchedule` no devuelve violaciones

### Requirement: Rendimiento y tablas de casos
El motor MUST resolver un colegio de tamaño real (12 cursos de 2 clases, 15 profesores y dos calendarios) dentro del tiempo del test, y también un colegio **sin ningún hueco libre**: 6 cursos de 2 clases con 30 sesiones para 30 franjas cada una, un tutor por clase y especialistas compartidos entre las 12 clases (dos de inglés, dos de educación física, música y religión). Para no quedarse atascado en una mala decisión temprana, la búsqueda MUST ordenar las unidades por dominio y peso (las que más veces se han quedado sin opciones, antes) y MUST reiniciarse con un límite de retrocesos creciente, probando los valores en otro orden obtenido con una semilla fija, de modo que siga siendo determinista y que `infeasible` siga significando que se agotó el árbol. El backend MUST recorrer `test-fixtures/schedule-generation.json`, con problemas pequeños calculados a mano y su resultado (`solved`, con el horario exacto en los más pequeños, o `infeasible` con su causa), con al menos un caso por restricción, calendarios distintos, bloques con recreo, máximo al día, inactivas, huecos libres y el tutor libre.

#### Scenario: Tamaño real
- **WHEN** se resuelve el caso de tamaño real
- **THEN** el resultado es `solved` antes del límite del test y pasa el validador

#### Scenario: Colegio sin huecos libres
- **GIVEN** 12 clases de 30 sesiones para 30 franjas, con seis especialistas compartidos
- **WHEN** se resuelve
- **THEN** el resultado es `solved` con 360 entradas, pasa el validador y es el mismo en dos ejecuciones

### Requirement: Fase de mejora
Tras encontrar un horario válido, y salvo que `options.improve` sea `false`, el motor MUST mejorarlo con una búsqueda local (`improveSchedule`, `domain/schedule/scheduleImprover.ts`) que parte de la colocación de las unidades de la fase 1 y acepta un cambio solo si cumple HC1–HC8 y baja **estrictamente** la penalización de `scoreSchedule` (capacidad `schedule-score`):
- **Movimientos:** mover una unidad a otro emplazamiento de su dominio, o intercambiar los emplazamientos de dos unidades de la **misma clase y el mismo tamaño** (cada una debe tener en su dominio el emplazamiento de la otra). Recorre las unidades en el orden de la entrada y acepta el primer movimiento que mejora (ascenso de colina).
- **Comprobación incremental:** HC5 (celdas ocupadas de la clase), HC2 (intervalos del profesor en ese día), HC3 (sueltas y bloques de la lección en ese día) y HC7 (minutos del profesor) MUST comprobarse sobre el estado del horario sin recalcularlo entero; HC4 y HC8 ya los garantiza el dominio, y HC1 y HC6 no cambian con los movimientos. La variación de la penalización MUST calcularse solo con los profesores, días y lecciones afectados.
- **Parada:** cuando una pasada completa por todas las unidades no mejora nada (`CONVERGED`); cuando se agota su tiempo, el menor entre `options.improveMs` (por defecto `IMPROVE_LIMIT_MS`, 60 000) y lo que quede de `limitMs` (`TIME_LIMIT`); o al ver la cancelación (`CANCELLED`). Si no queda tiempo al terminar la fase 1, o con `improve` `false`, no hay mejora (`SKIPPED`).
- **Resultado:** `{ status: 'solved', entries, score, improvement: { stoppedBy, moves, elapsedMs } }`, con el horario mejorado (o el de la fase 1 si no mejoró nada), su `score` con `initialTotal` igual a la penalización del horario de la fase 1, `moves` (movimientos aceptados) y `elapsedMs` (duración de la mejora). Sin mejora, `score` es la puntuación del horario de la fase 1 y `initialTotal` es igual a `total`.

#### Scenario: Mejora las preferidas (SC4)
- **GIVEN** una clase con una sola lección, de 2 sesiones y sin regla, cuyas preferidas son la última sesión del lunes y del miércoles, que la fase 1 coloca en la primera sesión del lunes y del martes
- **WHEN** se resuelve con mejora
- **THEN** las 2 sesiones quedan en sus preferidas, `total` es 0 e `initialTotal` es 21 (2 fuera de sus preferidas y lunes-martes seguidos)

#### Scenario: Quita un hueco intercambiando (SC1)
- **GIVEN** una clase **sin celdas libres** y un especialista con dos sesiones en ella el lunes que la fase 1 deja separadas por una sesión
- **WHEN** se resuelve con mejora
- **THEN** un intercambio dentro de la clase las junta, `professorGaps` baja y la clase sigue sin celdas libres

#### Scenario: Separa los días seguidos (SC3)
- **GIVEN** una lección de 3 sesiones sin regla que la fase 1 coloca lunes, martes y miércoles, en una clase con sitio el viernes
- **WHEN** se resuelve con mejora
- **THEN** queda en lunes, miércoles y viernes y `consecutiveDays` de esa lección es 0

#### Scenario: Nunca rompe una restricción dura (HC1–HC8)
- **GIVEN** problemas aleatorios generados con una semilla fija
- **WHEN** se resuelven con mejora
- **THEN** `validateSchedule` no da violaciones y `score.total` nunca es mayor que `score.initialTotal`

#### Scenario: Restricciones contradictorias entre blandas y duras
- **GIVEN** una asignatura cuyas preferidas caen todas en tramos en los que su profesor no puede (HC4)
- **WHEN** se resuelve con mejora
- **THEN** ninguna sesión va a esas celdas, el horario es válido y `preferredMisses` es igual a `preferredTotal`

#### Scenario: Se acaba el tiempo de la mejora
- **GIVEN** un reloj contado que agota `improveMs` a mitad de la mejora
- **THEN** el resultado es `solved` con `stoppedBy` `TIME_LIMIT` y el mejor horario encontrado, nunca `timeout`

#### Scenario: Se cancela durante la mejora
- **GIVEN** una señal que pasa a cancelada durante la mejora
- **THEN** el resultado es `solved` con `stoppedBy` `CANCELLED` y lo mejorado hasta entonces

#### Scenario: Sin mejora
- **WHEN** se resuelve con `improve` `false`
- **THEN** el resultado es `solved` con el horario de la fase 1, `stoppedBy` `SKIPPED`, `moves` 0 y `initialTotal` igual a `total`

#### Scenario: Converge
- **GIVEN** un horario de la fase 1 en el que ningún movimiento baja la penalización
- **THEN** la mejora termina con `stoppedBy` `CONVERGED` y `moves` 0 sin esperar al tiempo

### Requirement: Mejora medida en un colegio de tamaño real
La mejora MUST probarse sobre el colegio de tamaño real (192 lecciones) y sobre el colegio **sin ningún hueco libre** de «Rendimiento y tablas de casos», con un reloj contado: en el primero la penalización MUST bajar respecto a la de la fase 1, y en los dos el resultado MUST pasar el validador. Las cifras de antes y después MUST anotarse en el `design.md` del cambio.

#### Scenario: Tamaño real
- **WHEN** se resuelve con mejora el caso de tamaño real
- **THEN** `score.total` es menor que `score.initialTotal` y el horario pasa el validador

#### Scenario: Colegio sin huecos libres
- **WHEN** se resuelve con mejora el colegio sin huecos libres
- **THEN** el resultado es `solved` con 360 entradas, pasa el validador y `score.total` no es mayor que `score.initialTotal`

