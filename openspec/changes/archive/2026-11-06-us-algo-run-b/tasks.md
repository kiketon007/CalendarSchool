## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-run-b` desde `main` actualizada, con los artefactos de este cambio y las notas de la exploración y la ficha enriquecida de US-ALGO-RUN_b en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar

## 1. Contrato

- [x] 1.1 Añadir en `docs/api-spec.yml` los esquemas `ScheduleScore`, `GenerationPhase` y `StartGenerationRequest`; `improve`, `phase`, `score` e `improvementCancelled` en `Generation` (y en sus ejemplos); `score` en `ScheduleSummary` y `ScheduleDetail`; y en `POST /api/schedule/generate` el `requestBody` opcional y la respuesta `400`
- [x] 1.2 Fijar el contrato en `frontend/src/api/schema.test.ts` (test de tipos que falla) y regenerar los tipos con `npm run api:types -w frontend`, con `typecheck` en verde

## 2. Backend: dominio de la puntuación

- [x] 2.1 Test que falla de `generationInputOf` con las preferidas (la del calendario, sin las prohibidas ni las que no existen; el dominio no cambia; una lección sin preferidas tiene `[]`) e implementar `GenerationLesson.preferred`, ajustando los constructores de entradas de los tests existentes
- [x] 2.2 Crear `test-fixtures/schedule-score.json` con casos calculados a mano (SC4 con y sin preferidas; SC1 con recreo, antes de la primera y tras la última, entre calendarios distintos y con intervalos repetidos, entradas sin profesor; SC3 sueltas, bloques y máximo al día; penalización ponderada) y un test que lo recorre y falla
- [x] 2.3 Implementar `scoreSchedule` y `SCORE_WEIGHTS` en `domain/schedule/scheduleScore.ts` hasta que pase la tabla
- [x] 2.4 Test que falla de `isScheduleScore` (los seis enteros no negativos; falta un campo, negativo, decimal, texto, `null`, array, campo de más) e implementarlo en `scheduleScore.ts`

## 3. Backend: fase de mejora

- [x] 3.1 Ampliar los tipos del puerto en `scheduleSolver.ts` (`SolveOptions.improve`, `improveMs`, `onPhase`, `onScore`; `solved` con `score` e `improvement`; `IMPROVE_LIMIT_MS`) y ajustar los dobles del motor en los tests de la aplicación
- [x] 3.2 Tests que fallan de `improveSchedule` (`domain/schedule/scheduleImprover.ts`) con casos pequeños: mejora las preferidas (SC4), junta las dos sesiones de un especialista en una clase **sin celdas libres** con un intercambio (SC1), separa los días seguidos (SC3) y converge sin movimientos (`CONVERGED`)
- [x] 3.3 Implementar el estado incremental (ocupación de clases, intervalos de profesores, reparto diario de lecciones, minutos) y el movimiento de una unidad hasta que pasen los casos de SC4 y SC3
- [x] 3.4 Implementar el intercambio de dos unidades de la misma clase y tamaño hasta que pase el caso de SC1
- [x] 3.5 Tests que fallan de la parada y de las duras: `TIME_LIMIT` con un reloj contado, `CANCELLED` con la señal, preferidas en tramos no disponibles (HC4 gana), HC2 entre calendarios distintos, HC3 con bloques y máximo al día y HC7 al límite de 1380 minutos; implementarlos
- [x] 3.6 Integrar la mejora en `BacktrackingSolver.solve` (fase 1 extraída sin cambiar el algoritmo; `improve`, `SKIPPED` sin tiempo restante o con `improve` falso; `onPhase` y `onScore`; `validateSchedule` y `scoreSchedule` del resultado; error si el mejorado no es válido), con tests que fallan primero
- [x] 3.7 Propiedad con el generador de semilla fija (`test/support/randomSchedulingProblem.ts`): con mejora, `validateSchedule` vacío, `score.total` ≤ `score.initialTotal` y la penalización igual a `scoreSchedule` del resultado (oráculo); y determinismo de dos ejecuciones con un reloj contado
- [x] 3.8 Medir con el reloj contado el colegio de tamaño real (la penalización baja) y el colegio sin huecos libres (360 entradas, no empeora), y anotar las cifras de antes y después en la sección «Medición» de `design.md`

## 4. Backend: aplicación de la generación

- [x] 4.1 Ampliar `Generation` (`improve`, `phase`, `score`, `cancelRequested`), `GenerationPhase` y los puertos (`GenerationRepository.insert` con `improve`, `saveProgress` con `phase` y `score`; `ScheduleDraft` de `replaceDraft` con `score`; la cabecera de lectura con `score`), ajustando los dobles
- [x] 4.2 Test que falla de `toGenerationView` (`improvementCancelled` solo con `COMPLETED`, `improve` y `cancelRequested`; sin `cancelRequested` en la vista) e implementarlo
- [x] 4.3 Test que falla de `StartGeneration` con `improve` (lo pasa a `insert`; `true` por defecto; `SCHEDULE_GENERATION_STARTED` con `improve`) e implementarlo
- [x] 4.4 Tests que fallan de `RunGeneration`: pasa `improve` de la fila al motor; `onPhase`/`onScore` se escriben con el progreso como mucho cada 2 s y el latido sigue durante la mejora; `solved` guarda el borrador con `score`; `TIME_LIMIT` y `CANCELLED` de la mejora terminan `COMPLETED`; `SCHEDULE_GENERATION_COMPLETED` con `score_total`, `initial_score_total`, `improvement_stopped_by`, `improvement_moves` e `improvement_ms`; e implementarlo
- [x] 4.5 Copiar `score` en la lectura de horarios (`GetSchedule`, `GetScheduleOverview`, `ListPreviousSchedules`) con tests que fallan primero

## 5. Backend: infraestructura

- [x] 5.1 Crear la migración con `prisma migrate dev --create-only` (`GenerationPhase`, `schedules.score`, `schedule_generations.improve`, `phase` y `score`), revisar que el SQL no toca los `CHECK` ni los índices parciales escritos a mano y aplicarla; actualizar `schema.prisma` con sus comentarios
- [x] 5.2 Tests de integración que fallan de `PrismaGenerationRepository` (`insert` guarda `improve`; `saveProgress` escribe `phase` y `score`; las lecturas devuelven `improve`, `phase`, `score` y `cancelRequested`; una fila antigua con los valores por defecto; un `score` inválido se lee como `null`) e implementarlo
- [x] 5.3 Tests de integración que fallan de `PrismaScheduleRepository.replaceDraft` (guarda `schedules.score` y, al marcar `COMPLETED`, `schedule_generations.score`; la confirmación lo conserva) e implementarlo
- [x] 5.4 Tests de integración que fallan de `PrismaScheduleReadRepository` (`score` en el borrador, el oficial, por id, en `listPrevious` y en `overview`; `null` en uno antiguo y en uno inválido) e implementarlo en `HEADER` con `isScheduleScore`

## 6. Backend: presentación

- [x] 6.1 Test que falla del parser `parseStartGenerationRequest` (sin cuerpo y `{}` → `improve: true`; `true`; `false`; no booleano y campo desconocido → `ValidationError` con su campo) e implementarlo en `presentation/schedule/startGenerationRequest.ts`
- [x] 6.2 Tests que fallan de la ruta `POST /generate` (pasa `improve` al caso de uso; `400` con cuerpo inválido sin llamar al caso de uso; un `MEMBER` con cuerpo inválido recibe `403`) e implementarla
- [x] 6.3 Tests de integración HTTP en `scheduleGeneration.int.test.ts`: generar con y sin `improve`, `400` con un cuerpo inválido, la generación terminada con `improve`, `phase`, `score` e `improvementCancelled`, el `score` del borrador y, tras confirmar, el del oficial

## 7. Frontend: servicios

- [x] 7.1 Test que falla de `isScheduleScore` en `utils/scheduleScore.ts` (los mismos casos que el backend) e implementarlo
- [x] 7.2 Test que falla de `scheduleGenerationService` (`start(fetch, { improve })` envía el cuerpo; valida `improve`, `phase`, `score` e `improvementCancelled`; `unavailable` con una forma inválida) e implementarlo, ajustando sus llamadas
- [x] 7.3 Tests que fallan de `scheduleDraftService` y `scheduleService` con `score` (lo aceptan con un `ScheduleScore` o `null`; `unavailable` con uno inválido) e implementarlos

## 8. Frontend: componentes y páginas

- [x] 8.1 Test que falla de `components/ScheduleScoreSummary` (las cuatro líneas; sin «Franjas preferidas» con `preferredTotal` 0; «antes de mejorar» solo si difiere; lista de descripción; `axe`) e implementarlo
- [x] 8.2 Test que falla de la casilla del panel (marcada por defecto; texto de ayuda con `aria-describedby`; solo para `ADMIN` y sin bloqueantes; deshabilitada mientras no se puede generar; su valor en `start` al generar y al regenerar) e implementarla
- [x] 8.3 Test que falla de las fases del panel (`SEARCHING` con «Buscando un horario válido…», la barra con valor y «Cancelar»; `IMPROVING` con «Mejorando el horario…», la barra sin valor, la penalización y «Detener y guardar el horario», que cancela tras su diálogo) e implementarlas
- [x] 8.4 Test que falla del resumen de una generación completada (desglose; «Generado sin mejorar…» con `improve` falso; «Se detuvo la mejora…» con `improvementCancelled`; sin desglose con `score` nulo) e implementarlo
- [x] 8.5 Test que falla de la cabecera de `ScheduleDraftPage` con desglose en el borrador, el oficial y un anterior, y sin él con `score` nulo, e implementarla
- [x] 8.6 Textos en `schedule.generation.*` y `schedule.score.*` en `es.json` y `en.json` (los tests de 8 ya los usan)
- [x] 8.7 Tests a 360 px y de `axe` del panel en cada fase y de la página con desglose, en los dos roles

## 9. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 9.1 Revisar los tests del motor (`backtrackingSolver.test.ts`, la tabla `schedule-generation.json`, el tamaño real y el colegio sin huecos), de `generationInput`, de `RunGeneration`, `StartGeneration`, los repositorios y las rutas de la generación y de los horarios, del panel, de `ScheduleDraftPage`, de `ScheduleReadinessPage` y los E2E `scheduleGeneration.cy.ts`, `scheduleDraft.cy.ts` y `scheduleConfirmation.cy.ts` por los campos, los textos y la nueva fase, y ajustarlos

## 10. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 10.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 10.2 Ejecutar los tests de los módulos cambiados
- [x] 10.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend), `npm run lint` y `typecheck`
- [x] 10.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 10.5 Crear `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend con el lanzador en memoria (sin las claves de reCAPTCHA), preparar por la API un colegio con una asignatura con franjas preferidas y un miembro, y generar sin cuerpo: la generación termina `COMPLETED` con `improve: true` y `score`, y el borrador lleva el mismo `score`
- [x] 11.2 Generar con `{ "improve": false }` (`initialTotal` igual a `total`), con `{ "improve": "si" }` y `{ "other": true }` (`400`), como `MEMBER` (`403`) y sin token (`401`); confirmar y comprobar el `score` en `GET /api/schedule/official` y en `overview`
- [x] 11.3 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Ampliar `cypress/e2e/scheduleGeneration.cy.ts` (o una spec nueva `schedulePreferences.cy.ts`): un colegio con franjas preferidas; generar con la casilla marcada y ver el desglose en el resumen y en `/horarios/borrador`; confirmar y verlo en `/horarios/oficial`; generar con la casilla desmarcada y ver «Generado sin mejorar»; un `MEMBER` no ve la casilla; el panel a 360 px
- [x] 12.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`; en dos tandas si falta memoria)
- [x] 12.3 Crear `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación técnica (MANDATORY)

- [x] 13.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: la fase de mejora, `scoreSchedule`, la casilla en el `POST`, las columnas nuevas y los estados (y la tabla de capacidades con `schedule-score`);
  - `frontend/CLAUDE.md`: la casilla, las fases del panel y `ScheduleScoreSummary`;
  - `docs/Modelo_de_Datos/MODELO_DATOS.md` (cuatro columnas y el enum) y `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (SC1–SC4 tal como se implementan);
  - `README.md` (módulo de generación), `ARQUITECTURA_COMPLETA.md` (tabla de la sección 0) y el `CLAUDE.md` raíz (estado actual);
  - `docs/api-spec.yml` (ya actualizado en 1.1);
  - la ficha de US-ALGO-RUN_b (estado: implementada) y el resumen de la épica.
- [x] 13.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.3 Verificar con `openspec validate us-algo-run-b --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [x] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–13 tras la confirmación de la persona usuaria; tras integrarla, verificar el CI del push a `main`, el despliegue y que la migración se aplicó
- [x] 14.2 Comprobar en producción:
  - **Con `curl`:** `POST /api/schedule/generate` y `GET /api/schedule/generate` sin token responden `401`, el bundle contiene los textos nuevos y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, genera con la casilla marcada y desmarcada, ve las dos fases y el desglose, y lo ve en el borrador.
- [x] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
