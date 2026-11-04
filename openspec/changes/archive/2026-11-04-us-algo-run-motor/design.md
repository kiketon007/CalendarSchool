## Context

US-ALGO-CHECK dejó en `domain/schedule/` la foto del problema (`SchedulingProblem`, leída de una vez por `PrismaSchedulingProblemRepository`) y `readinessOf`, que reutiliza las reglas ya implementadas: `workloadWarnings` y `subjectWarnings` (reparto diario y bloques, US19_b), `sessionGroupsOf`, `unavailableCellsOf` (solape `[a, b)` contra `[s, e)`) y `teachingLoadOf` (minutos por calendario, máximo de 1380). Este cambio añade el motor que coloca las sesiones con esas mismas reglas y un validador que las comprueba de forma independiente, todo puro. La ejecución en segundo plano, las tablas y la pantalla son de `us-algo-run-ejecucion`.

La regla del reparto diario, tal como la aplica hoy `subjectWarnings`: con la carga `L`, el máximo `m` (1 sin regla) y el bloque `k`, la asignatura tiene `⌊L/k⌋` bloques de `k` sesiones seguidas de un mismo tramo (sin recreo entre ellas) y `L mod k` sueltas (sin bloque, `L` sueltas); un día lleva como mucho un bloque y, si lo lleva, ninguna suelta; si no, hasta `m` sueltas.

## Goals / Non-Goals

**Goals:**
- Un motor determinista que encuentre un horario que cumpla HC1–HC8 en un colegio típico (unas 30 clases y 800 sesiones) en pocos segundos, o diga por qué no puede (`infeasible` con una causa) o que se le acabó el tiempo (`timeout`).
- Un validador independiente del motor, que servirá también para OR-Tools (US-ALGO-ORTOOLS) y como red de seguridad antes de guardar.
- El aviso `WORKLOAD_BELOW_SLOTS` en la comprobación previa.

**Non-Goals:**
- Guardar el horario, endpoints, la Lambda del worker y la pantalla de generación (`us-algo-run-ejecucion`).
- Optimizar las preferencias SC1–SC4 (US-ALGO-RUN_b): aquí el horario solo tiene que ser válido.
- Mostrar el horario (US-ALGO-VIEW).

## Decisions

### D1. Todo en `domain/schedule/`, sin dependencias de infraestructura
`generationInput.ts`, `scheduleSolver.ts` (el puerto y sus tipos), `backtrackingSolver.ts` y `validateSchedule.ts` son funciones y clases puras: reciben datos y, para el tiempo y la cancelación, un reloj (`now(): number`, en ms) y una señal (`isCancelled(): boolean`) inyectados. `solve` es **asíncrono** (devuelve una promesa): una búsqueda síncrona bloquearía el bucle de eventos y el worker no podría guardar el progreso ni leer la marca de cancelación mientras tanto, así que cada 1024 nodos, al consultar el reloj y la señal, cede el control con `setImmediate`. Así se prueban sin base de datos y el caso de uso de `us-algo-run-ejecucion` solo los compone. Las referencias de nombres que necesite el motor para explicar un fallo salen de la propia foto.

### D2. La entrada del motor: lecciones y unidades
`generationInputOf(problem, compareNames): GenerationInput` (con el orden de nombres del castellano inyectado, porque `compareText` es de `application`) toma de la foto los cursos con calendario y, de cada clase, las asignaturas **activas** con profesor en esa clase (una **lección**: clase × asignatura, con su profesor, `sessionsPerWeek`, `maxPerDay` y `blockSize`). Las asignaturas inactivas, las clases sin profesor y los cursos sin calendario no entran: la comprobación previa ya bloquea lo segundo y lo tercero, y la entrada no los inventa.

Para cada curso calcula sus **celdas**: las sesiones del calendario numeradas en orden (1…n, los recreos no cuentan), con su inicio y fin en minutos y su tramo (`sessionGroupsOf`), los cinco días. Cada lección se parte en **unidades**: `⌊L/k⌋` bloques de tamaño `k` y `L mod k` sueltas de tamaño 1 (sin bloque, `L` sueltas). El **dominio** de una unidad son los emplazamientos `(día, primera sesión)` cuyas `k` celdas son seguidas, del mismo tramo, no prohibidas (HC8, las celdas guardadas que ya no existen en el calendario se ignoran) y sin solape con un tramo no disponible del profesor (HC4, `unavailableCellsOf`).

Alternativa descartada: una variable por celda (clase, día, sesión) con la asignatura como valor. Es el planteamiento CSP clásico y cumple HC5 por construcción, pero los bloques y el reparto diario se convierten en restricciones sobre muchas variables y la poda es peor. Con unidades, HC5 se cumple igual —una celda de una clase solo puede estar ocupada por una unidad— y los bloques son un único valor.

### D3. El motor: backtracking con forward checking, MRV y simetrías
- **Estado:** ocupación por (clase, día, sesión) (HC5), intervalos ocupados por (profesor, día) (HC2, por minutos para cruzar calendarios), uso diario por (lección, día) (HC3: bloque sí/no y sueltas) y minutos colocados por profesor (HC7).
- **Elección de variable (MRV):** la unidad sin colocar con menos valores vivos; empates, primero la de mayor tamaño (los bloques son más difíciles), después el orden estable de la entrada (curso, clase y asignatura por nombre con el comparador inyectado, e índice de unidad).
- **Valores:** en orden estable (día y sesión ascendentes). El orden de los valores es la palanca de US-ALGO-RUN_b (preferencias); aquí basta con que sea determinista.
- **Forward checking:** al colocar una unidad se eliminan de las demás los valores que ya no caben (misma clase en esas celdas, mismo profesor en intervalos que se solapan, misma lección ese día según HC3). Si un dominio queda vacío, se deshace (registro de cambios para deshacer en orden inverso) y se prueba el siguiente valor.
- **HC7 con cota:** se lleva, por profesor, los minutos colocados más la duración mínima posible de sus unidades sin colocar; si pasa de 1380, se poda.
- **Simetrías:** las unidades del mismo tamaño de una misma lección son intercambiables; se fuerza que se coloquen en orden creciente de emplazamiento, lo que elimina las permutaciones equivalentes.
- **Tiempo y cancelación:** se consultan cada 1024 nodos; `limitMs` por defecto 120 000 (dentro del límite de 120 s de la regla de diseño para el backtracking). `onProgress(placed, total)` informa del máximo de unidades colocadas alcanzado, en sesiones.
- **Resultado** (`SolveOutcome`): `{ status: 'solved', entries }`, `{ status: 'infeasible', cause }`, `{ status: 'timeout', placed, total }` o `{ status: 'cancelled' }`. Una entrada es `{ courseId, classId, subjectId, professorId, dayOfWeek, sessionNumber, startMinute, endMinute }`, una por sesión.

Alternativas descartadas: OR-Tools/CP-SAT (decidido como mejora aparte, US-ALGO-ORTOOLS); búsqueda local o recocido sin backtracking (no puede demostrar que no hay solución); la memoización de configuraciones de la especificación original (el espacio es demasiado grande para que compense).

### D4. La causa de `infeasible`
Si antes de buscar una unidad ya tiene el dominio vacío, la causa es exacta: la lección y el motivo (`NO_FREE_CELLS`: prohibidas y no disponibles no dejan sitio). Si no, al agotar la búsqueda se informa de la lección que más veces vació un dominio y de la restricción que más valores le quitó (`CLASS_BUSY`, `PROFESSOR_BUSY`, `DAILY_RULE` o `MAX_HOURS`), con sus referencias (curso, clase, asignatura y profesor) para que la pantalla enlace a donde se corrige. Es una heurística, no una demostración de cuál es la restricción culpable; el texto lo dice así («La lección que más choca es…»).

### D5. El validador, independiente
`validateSchedule(input, entries)` no reutiliza el estado del motor: recalcula todo desde las entradas y devuelve `Violation[]` (`{ rule: 'HC1'…'HC8', … referencias }`), vacío si el horario es válido. Comprueba HC1 (cada lección, exactamente `L` entradas), HC2 (intervalos de un profesor sin solape por día), HC3 (por lección y día: un bloque de `k` seguidas del mismo tramo y nada más, o como mucho `m` sueltas; y el número total de bloques), HC4, HC5 (una entrada por clase, día y sesión), HC6 (el profesor es el de la lección), HC7 (suma de minutos ≤ 1380) y HC8, además de que cada entrada sea una celda real del calendario de su curso. El motor llama al validador antes de devolver `solved`; si encontrara violaciones (sería un error del motor), lanza un error para que el caso de uso lo trate como `INTERNAL` y nunca se guarde.

### D6. El aviso `WORKLOAD_BELOW_SLOTS`
En `readinessOf`, para cada curso con calendario, al menos una clase y al menos una asignatura activa: si las sesiones de las activas (`assigned`) son menos que las del calendario (`available`, sesiones × 5), se añade el aviso con `course`, `assigned` y `available`. Va en `WARNING_CODES` tras `COURSE_WITHOUT_SUBJECTS` (con carga 0 sale ese y no este). En el frontend, `ReadinessIssueItem` dice «{curso} tiene {assigned} sesiones para {available} franjas: quedarán {n} huecos libres en cada clase» (con plural sobre `n = available − assigned`) y enlaza a la carga del curso. El contrato solo gana el valor en `ReadinessIssueCode`.

### D7. Pruebas
- `test-fixtures/schedule-generation.json`: problemas pequeños descritos con nombres (cursos, calendarios, asignaturas con reglas, profesores con tramos), calculados a mano, con el resultado esperado: `solved` (y, en los más pequeños, el horario exacto, que fija el determinismo) o `infeasible` con su causa. Un caso por restricción, más calendarios distintos (45 y 60 minutos), bloques con recreo en medio, máximo al día, inactivas, huecos libres y el tutor libre que da clase en otra clase a la misma hora.
- Propiedades con un generador pseudoaleatorio con semilla fija (`test/support`): cualquier `solved` pasa `validateSchedule`, y dos ejecuciones dan lo mismo.
- Un caso de tamaño real (12 cursos de 2 clases, 15 profesores, dos calendarios) que debe resolverse en el tiempo del test.
- Tests propios del validador con horarios construidos a mano que violan cada regla.
- El aviso nuevo, en la tabla `schedule-readiness.json` (menos, igual y más carga que franjas; sin calendario; sin clases; con inactivas).

## Risks / Trade-offs

- **Rendimiento en colegios grandes o muy restringidos:** el backtracking puede tardar mucho en algunos casos. Lo mitigan MRV, el forward checking, la cota de HC7 y la poda de simetrías, y lo limita el `timeout`. Si no basta, el puerto permite cambiar de motor (US-ALGO-ORTOOLS) sin tocar nada más.
- **Calidad del horario:** el orden de valores ascendente tiende a llenar primero las primeras horas; es válido pero no bonito. Lo resuelve US-ALGO-RUN_b.
- **La causa de `infeasible` es orientativa** (D4), no la explicación mínima del conflicto.
- **Coste de la entrada:** `generationInputOf` duplica parte del trabajo de `readinessOf` (celdas, tramos); se acepta para mantener el motor desacoplado de la comprobación, y las dos usan las mismas funciones de base.
- **Seguridad y aislamiento:** no aplica en este cambio (no hay E/S); la foto ya llega filtrada por colegio desde US-ALGO-CHECK.
