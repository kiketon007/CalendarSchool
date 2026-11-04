## ADDED Requirements

### Requirement: Entrada del motor
La función pura `generationInputOf(problem, compareNames)` (`domain/schedule/generationInput.ts`, con el orden de los nombres del castellano inyectado) MUST convertir la foto del problema (`SchedulingProblem`) en la entrada del motor:
- **Lecciones:** una por clase y asignatura **activa** del curso de la clase que tenga profesor en esa clase, con el profesor, las sesiones a la semana, el máximo al día (1 sin regla) y el tamaño de bloque (o ninguno). No entran las asignaturas inactivas, las clases sin profesor ni los cursos sin calendario.
- **Celdas de cada curso:** las sesiones de su calendario numeradas en orden (los recreos no cuentan), con su inicio y fin en minutos y su tramo entre recreos, para los cinco días.
- **Unidades de cada lección:** con la carga `L` y el bloque `k`, `⌊L/k⌋` bloques de `k` sesiones y `L mod k` sueltas (sin bloque, `L` sueltas).
- **Dominio de cada unidad:** los emplazamientos `(día, primera sesión)` cuyas celdas son seguidas, del mismo tramo, no prohibidas para la asignatura en el curso (las celdas guardadas que ya no existen en el calendario se ignoran) y sin solape con un tramo no disponible del profesor (`[a, b)` y `[s, e)` se solapan si `a < e` y `s < b`).

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
El motor MUST recibir en `options` el límite de tiempo (`limitMs`, 120 000 por defecto), un reloj (`now()`) y una señal de cancelación (`isCancelled()`), consultarlos al menos cada 1024 nodos de la búsqueda y devolver `{ status: 'timeout', placed, total }` al agotar el límite o `{ status: 'cancelled' }` al ver la señal, sin entradas. Puede recibir `onProgress(placed, total)`, que MUST informar en sesiones del **máximo** colocado hasta el momento (nunca baja).

#### Scenario: Se acaba el tiempo
- **GIVEN** un reloj que ya pasó el límite al empezar la búsqueda de un problema no trivial
- **WHEN** se resuelve
- **THEN** el resultado es `timeout` con las sesiones colocadas y el total

#### Scenario: Cancelación
- **GIVEN** una señal que pasa a cancelada tras los primeros nodos
- **THEN** el resultado es `cancelled`

#### Scenario: Progreso que no baja
- **WHEN** se resuelve un problema que obliga a retroceder
- **THEN** los valores que recibe `onProgress` nunca bajan y el último, en `solved`, es el total

### Requirement: Determinismo
El motor MUST devolver el mismo resultado para la misma entrada: el orden de las variables y de los valores es estable (curso, clase y asignatura por nombre con el comparador inyectado, índice de unidad, y día y sesión ascendentes) y no usa azar.

#### Scenario: Dos ejecuciones
- **WHEN** se resuelve dos veces la misma entrada
- **THEN** las dos entradas son idénticas, en el mismo orden

### Requirement: Validador independiente
La función pura `validateSchedule(input, entries)` (`domain/schedule/validateSchedule.ts`) MUST comprobar HC1–HC8 y que cada entrada sea una celda real del calendario de su curso, sin usar el estado del motor, y devolver la lista de violaciones (`{ rule: 'HC1' … 'HC8', … referencias }`), vacía si el horario es válido. El motor MUST validar su resultado antes de devolver `solved` y lanzar un error si hay violaciones (es un fallo del motor), de modo que nunca entrega un horario inválido.

#### Scenario: Cada regla rota
- **GIVEN** horarios construidos a mano, cada uno con una sola violación (una sesión de menos, un profesor en dos sitios con calendarios distintos, dos sueltas un día sin regla, un bloque que cruza el recreo, una sesión en un tramo no disponible, dos asignaturas en el mismo hueco de una clase, otro profesor, 1395 minutos, una celda prohibida)
- **WHEN** se validan
- **THEN** cada uno da exactamente su violación (`HC1` … `HC8`)

#### Scenario: Lo que entrega el motor siempre es válido
- **GIVEN** problemas generados con una semilla fija
- **WHEN** el motor devuelve `solved`
- **THEN** `validateSchedule` no devuelve violaciones

### Requirement: Rendimiento y tablas de casos
El motor MUST resolver un colegio de tamaño real (12 cursos de 2 clases, 15 profesores y dos calendarios) dentro del tiempo del test. El backend MUST recorrer `test-fixtures/schedule-generation.json`, con problemas pequeños calculados a mano y su resultado (`solved`, con el horario exacto en los más pequeños, o `infeasible` con su causa), con al menos un caso por restricción, calendarios distintos, bloques con recreo, máximo al día, inactivas, huecos libres y el tutor libre.

#### Scenario: Tamaño real
- **WHEN** se resuelve el caso de tamaño real
- **THEN** el resultado es `solved` antes del límite del test y pasa el validador
