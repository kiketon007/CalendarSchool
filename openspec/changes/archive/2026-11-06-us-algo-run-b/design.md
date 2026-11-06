## Context

- **Motor actual (US-ALGO-RUN):** `BacktrackingSolver` (`domain/schedule/backtrackingSolver.ts`) resuelve HC1–HC8 con *forward checking*, dom/wdeg y reinicios con semilla fija; para en el primer horario válido, lo valida con `validateSchedule` y devuelve `solved`, `infeasible`, `timeout` o `cancelled`. Prueba los valores por día y sesión ascendentes, así que tiende a llenar las primeras sesiones y los primeros días.
- **Preferencias que nadie usa:** `ProblemSubject.preferredCells` (US19_d) llega en la foto del problema, pero `generationInputOf` no la pasa a `GenerationInput`.
- **Ejecución (US-ALGO-RUN):** `RunGeneration` llama al motor con `limitMs = SCHEDULE_MAX_SECONDS · 1000` (5–240 s, 120 por defecto); `isCancelled()` dispara `saveIfDue` (progreso, latido y lectura de `cancel_requested` cada 2 s); `replaceDraft` guarda el borrador y marca `COMPLETED` en una transacción. Una generación sin latido en 90 s se marca atascada. El worker es una Lambda de 5 minutos.
- **Lectura (US-ALGO-VIEW/CONFIRM/CONFIRM_b):** `PrismaScheduleReadRepository` comparte el `select` de cabeceras (`HEADER`) entre `overview`, `listPrevious` y la lectura normalizada; `ScheduleDraftPage` pinta el borrador, el oficial y los anteriores.
- **Decisiones de la persona usuaria** (ficha del 2026-11-06): todo en una historia; dos fases; tope de mejora de 60 s; agotar el tiempo o cancelar tras un horario válido es éxito; pesos fijos; casilla opcional marcada por defecto; SC3 = pares de días contiguos; SC1 = celdas enteras entre dos sesiones; mejora cancelada deducida de `cancel_requested`; un fallo de la fase 2 es `FAILED/INTERNAL`.

## Goals / Non-Goals

**Goals:**
- Una puntuación pura y explicable (`scoreSchedule`) reutilizable por US-ALGO-ORTOOLS.
- Una fase de mejora que nunca rompe una dura, determinista con un reloj contado y acotada en tiempo.
- No perder nunca un horario válido por mejorarlo.
- Que el administrador elija si mejora, vea en qué fase está y entienda el resultado.

**Non-Goals:**
- Optimalidad global (perturbaciones, recocido, reinicios de la fase 2): queda para US-ALGO-ORTOOLS o una historia propia.
- Pesos configurables, SC2 (aulas), restricciones blandas de las clases.
- Cambiar el algoritmo de la fase 1 o su orden de valores.

## Decisions

### D1. Dos fases detrás del mismo puerto
`BacktrackingSolver.solve` extrae la búsqueda actual a una función privada (fase 1, sin cambios de algoritmo) y, con `solved`, llama a `improveSchedule(...)` (`domain/schedule/scheduleImprover.ts`) con la colocación de las unidades (`placement`: unidad → emplazamiento), las `SearchUnit` y el reloj. El puerto `ScheduleSolver` no cambia de firma: crecen `SolveOptions` (`improve?`, `improveMs?`, `onPhase?`, `onScore?`) y la variante `solved` (`score`, `improvement`).
- *Alternativa descartada:* un puerto `ScheduleImprover` aparte orquestado por `RunGeneration`. Duplica el reloj y la cancelación en la aplicación y obliga a reconstruir las unidades desde las entradas; además US-ALGO-ORTOOLS optimiza en un solo paso, y el puerto único le deja hacerlo.
- *Alternativa descartada:* probar primero las celdas preferidas en la fase 1. Apenas mejora SC1 y alarga la búsqueda en colegios sin huecos libres (nota de la exploración del 2026-11-04).

### D2. La puntuación es pura y vive junto al validador
`scoreSchedule(input, entries)` en `domain/schedule/scheduleScore.ts`, con `SCORE_WEIGHTS = { preferred: 10, gap: 3, consecutiveDay: 1 }`. Recalcula desde las entradas (como `validateSchedule`), así sirve de **oráculo** en los tests de la fase 2: tras cada ejecución, la penalización incremental acumulada debe coincidir con `scoreSchedule` del resultado.
- **SC1 entre calendarios:** las celdas candidatas son las de los calendarios de los cursos del profesor, deduplicadas por intervalo `[inicio, fin)`; dos intervalos distintos que se solapan cuentan dos veces (caso raro de profesores con dos jornadas distintas; se acepta y lo fija un caso de la tabla).
- **SC3:** pares de días contiguos con alguna entrada de la lección. Penaliza también dos bloques o dos sueltas en días pegados con máximo al día; no hay un término propio para el reparto entre tramos.
- *Alternativa descartada:* SC1 en minutos libres. Es más fino, pero la persona usuaria piensa en «sesiones libres» y el desglose dice «huecos».

### D3. Búsqueda local: ascenso de colina con dos movimientos
Estado: `placement` y estructuras de ocupación iguales a las de la fase 1 (celdas por clase y día, intervalos por profesor y día, sueltas/bloque por lección y día, minutos por profesor) más los contadores de la puntuación por profesor-día y por lección. Bucle: por cada unidad en el orden de la entrada, probar (a) cada otro emplazamiento vivo de su dominio y (b) el intercambio con cada otra unidad de la misma clase y tamaño cuyo emplazamiento esté en su dominio (y viceversa); aceptar el **primer** movimiento con `Δ < 0` que pase las duras. Una pasada completa sin aceptar ninguno → `CONVERGED`.
- **Comprobación incremental:** quitar las unidades que se mueven de las estructuras, comprobar HC5/HC2/HC3/HC7 para sus emplazamientos nuevos y, si fallan, reponerlas. HC4 y HC8 ya están en el dominio; HC1 y HC6 son invariantes del movimiento.
- **Δ incremental:** solo se recalculan los profesor-día y las lecciones de las unidades movidas (antes y después) y SC4 de esas unidades.
- **Validación final:** `validateSchedule` y `scoreSchedule` sobre el resultado; si `validateSchedule` da violaciones se lanza un error (D9).
- *Alternativa descartada:* `validateSchedule` completo por intento: con 192 lecciones son cientos de miles de intentos por segundo imposibles.
- *Alternativa descartada:* intercambios entre clases distintas (cadenas de Kempe). Más potentes, pero el estado y la comprobación se complican; fuera de alcance.

### D4. Tiempo de la mejora
`improveMs` por defecto `IMPROVE_LIMIT_MS = 60_000` (constante del dominio, no variable de entorno). El presupuesto real es `min(improveMs, limitMs − transcurrido)`, medido con el mismo `now` inyectado; si es ≤ 0, `SKIPPED`. Así toda la generación cabe en `SCHEDULE_MAX_SECONDS` (≤ 240 s), por debajo de los 300 s del worker y de la regla de diseño del backtracking (≤ 120 s por defecto). El reloj y la cancelación se consultan cada 1024 evaluaciones, cediendo al bucle de eventos con `setImmediate` como en la fase 1.

### D5. Resultados y estados de la generación
| Fase 1 | Fase 2 | `SolveOutcome` | Generación |
|---|---|---|---|
| agota el tiempo | — | `timeout` | `FAILED/TIMEOUT` |
| cancelada | — | `cancelled` | `CANCELLED` |
| sin solución | — | `infeasible` | `FAILED/INFEASIBLE` |
| resuelta | converge / tiempo / cancelada / sin mejora | `solved` + `improvement.stoppedBy` | `COMPLETED` |
| resuelta | resultado inválido | excepción | `FAILED/INTERNAL` |

`improvementCancelled` de la vista = `status === 'COMPLETED' && improve && cancelRequested`. Sin columna propia: la carrera (una cancelación que llega tras el último control) solo cambia un texto.

### D6. La casilla viaja en la fila
`POST /api/schedule/generate` acepta `{ improve?: boolean }` (`parseStartGenerationRequest`, Zod `strictObject`; cuerpo ausente o vacío → `{}`), `StartGeneration` la recibe y `GenerationRepository.insert` la guarda en `schedule_generations.improve`. El worker solo recibe el id (Lambda asíncrona), así que la lee de la fila reclamada. `requireRole('ADMIN')` sigue antes del parser: un `MEMBER` con un cuerpo inválido recibe `403`.
- *Alternativa descartada:* pasar `improve` en la carga útil de la invocación. Duplica el estado, y un reintento manual o un relanzamiento perderían el valor.

### D7. Progreso de la mejora
`Generation` gana `improve`, `phase`, `score` y `cancelRequested` (este último solo para la vista). `saveProgress(id, { placed, total, phase, score }, now)` escribe además `phase` y `score`; `onPhase`/`onScore` del motor solo actualizan variables locales de `RunGeneration`, y la escritura sigue saliendo de `saveIfDue` (≤ 1 cada 2 s), que también mantiene el latido durante la mejora. `placed` no se toca en la fase 2 (ya es `total`).
- El panel pinta en `IMPROVING` una barra **sin valor** (no se sabe cuándo converge) y la penalización actual.

### D8. Dónde se guarda la puntuación
- `schedules.score` (`jsonb`): la del horario; `replaceDraft` la recibe en `ScheduleDraft` y, en la misma transacción, escribe también `schedule_generations.score` y `phase` al marcar `COMPLETED`. Confirmar promueve la fila, así que el oficial y los anteriores la conservan sin código.
- `schedule_generations.score` (`jsonb`): la que ve el panel durante la mejora y al terminar.
- Lectura con `isScheduleScore` (`domain/schedule/scheduleScore.ts`) en los dos repositorios; un valor inválido es `null`. En el frontend, el mismo guardia en `utils/scheduleScore.ts` lo usan los tres servicios.
- *Alternativa descartada:* columnas tipadas (`score_total`, `preferred_misses`…). Seis columnas en dos tablas para una forma que puede crecer (otro criterio, pesos); el JSON se valida al leer y no se consulta por sus campos.
- *Alternativa descartada:* calcular la puntuación al leer. Exigiría reconstruir la entrada del motor desde los datos de hoy, que pueden haber cambiado; la puntuación es la del momento de generar.

### D9. Un fallo de la fase 2 no se esconde
Si el horario mejorado no pasa `validateSchedule`, el motor lanza (como la fase 1) y la generación es `FAILED/INTERNAL`. La propiedad con problemas aleatorios y el oráculo de D2 deben impedir que ocurra.
- *Alternativa descartada:* volver en silencio al horario de la fase 1. Taparía un fallo del motor que solo se vería en producción.

### D10. Capas
- **domain:** `scheduleSolver.ts` (tipos), `generationInput.ts` (`preferred`), `scheduleScore.ts`, `scheduleImprover.ts`, `backtrackingSolver.ts`, `generation.ts` (`GenerationPhase`, campos), `generationRepository.ts`, `scheduleRepository.ts`, `scheduleRead.ts` (`score` en la cabecera).
- **application:** `startGeneration.ts` (`improve`), `runGeneration.ts` (fases, puntuación, evento), `generationView.ts` (`improvementCancelled`), la lectura de horarios (copiar `score`).
- **infrastructure:** `prismaGenerationRepository.ts`, `prismaScheduleRepository.ts`, `prismaScheduleReadRepository.ts` y la migración.
- **presentation:** `scheduleRouter.ts` y `startGenerationRequest.ts` (parser).

### D11. Contrato y modelo de datos
- **API:** `ScheduleScore`, `GenerationPhase`, `StartGenerationRequest`; `Generation` + `improve`, `phase`, `score`, `improvementCancelled`; `ScheduleSummary`/`ScheduleDetail` + `score`; el `POST` gana `requestBody` opcional y `400`. Sin códigos nuevos.
- **Migración** (`prisma migrate dev --create-only`, revisando el SQL): `CREATE TYPE "GenerationPhase"`, `ALTER TABLE schedules ADD COLUMN score jsonb`, `ALTER TABLE schedule_generations ADD COLUMN improve boolean NOT NULL DEFAULT true, ADD COLUMN phase "GenerationPhase" NOT NULL DEFAULT 'SEARCHING', ADD COLUMN score jsonb`. Sin `CHECK` ni índices; las filas existentes toman los valores por defecto. Comprobar que el SQL generado no toca los `CHECK` e índices parciales escritos a mano.

### D12. Seguridad y observabilidad
El colegio sale de la sesión y del registro reclamado; la puntuación son cifras; `SCHEDULE_GENERATION_STARTED` gana `improve` y `SCHEDULE_GENERATION_COMPLETED` gana `score_total`, `initial_score_total`, `improvement_stopped_by`, `improvement_moves` e `improvement_ms`, sin nombres.

## Risks / Trade-offs

- [Óptimo local del ascenso de colina] → se acepta; la medición de CA13 dice cuánto mejora y US-ALGO-ORTOOLS puede ir más allá.
- [Colegios sin huecos libres: los tutores siempre tienen huecos] → los intercambios dentro de la clase son el único movimiento; la ganancia está en los especialistas y puede ser pequeña. El test del colegio sin huecos solo exige que no empeore.
- [La comprobación incremental se equivoca] → oráculo (`scoreSchedule` y `validateSchedule` tras cada test), propiedad con problemas aleatorios y la red de seguridad de D9.
- [Generaciones más largas: hasta 60 s más] → la casilla deja generar sin mejorar; la mejora termina antes si converge; el total sigue acotado por `SCHEDULE_MAX_SECONDS`.
- [Tests que dependen del tiempo] → reloj contado (como la fase 1); nunca tiempo real.
- [JSON guardado que cambia de forma] → guardia al leer: `null` en lugar de un `500`.
- [SC1 cuenta dos veces dos intervalos solapados de calendarios distintos] → caso raro, documentado en la tabla de casos.
- [Carrera de `improvementCancelled`] → solo cambia el texto del resumen.

## Migration Plan

1. Desplegar como siempre (CI → CDK); la migración se aplica antes del código nuevo y es aditiva: el código anterior ignora las columnas nuevas y el nuevo lee `null`/valores por defecto en las filas antiguas.
2. **Marcha atrás:** revertir el código; las columnas pueden quedarse (el código anterior no las lee) o quitarse con una migración posterior.
3. Una generación en curso durante el despliegue sigue con el worker antiguo y termina como antes (sin fase 2).

## Medición (CA13)

Medida con el reloj contado de `backtrackingSolver.test.ts` (`describe('the measured improvement')`, un tic por consulta, sin depender de la máquina), con `improveMs` sin tope práctico para ver dónde converge. Los dos casos terminan con `CONVERGED`, el horario pasa `validateSchedule` y la penalización que lleva la búsqueda coincide con `scoreSchedule` del resultado.

| Caso | Entradas | Penalización antes → después | Desglose final | Movimientos | Tiempo real |
|---|---|---|---|---|---|
| Colegio de tamaño real (192 lecciones; semilla 7, 12 cursos × 2 clases, 8 asignaturas, 15 profesores, 50 % de asignaturas con preferidas) | 288 | **1212 → 538** (−56 %) | 52 fallos de 134 preferidas, 2 huecos, 12 pares de días seguidos | 179 | ~0,1 s |
| Colegio sin ningún hueco libre (12 clases, 30 sesiones para 30 franjas, sin preferidas) | 360 | **508 → 356** (−30 %) | 61 huecos, 173 pares de días seguidos | 62 | ~0,7 s |
| 12 problemas aleatorios pequeños (4 cursos × 2 clases, 6 asignaturas, 8 profesores, preferidas al 50 %) | 100–200 | de 499–973 a 376–677 (−24 % a −40 %) | — | 46–92 | < 0,05 s cada uno |

Conclusiones: la mejora es de decenas de milisegundos a menos de un segundo, muy por debajo de los 60 s de `IMPROVE_LIMIT_MS`, así que en la práctica termina por convergencia y no por tiempo. En el colegio sin huecos libres no hay preferidas y la ganancia viene de los huecos de los especialistas y de los días seguidos, como se esperaba. El óptimo local es una limitación asumida (ver «Risks / Trade-offs»).

## Open Questions

- Ninguna que bloquee. Si la medición muestra una mejora muy pequeña en el colegio de tamaño real, se valorará con la persona usuaria antes de archivar si basta o hace falta otra historia (perturbaciones o intercambios entre clases).
