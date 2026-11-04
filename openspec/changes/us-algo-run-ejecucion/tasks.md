## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Comprobar que `us-algo-run-motor` está integrada en `main` (el motor, el validador y el puerto `ScheduleSolver` existen) y crear la rama `feature/us-algo-run-ejecucion` desde `main` actualizada, con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio

## 1. Contrato: los endpoints y los errores

- [x] 1.1 Añadir a `docs/api-spec.yml` las cuatro operaciones (`POST`, `GET`, `GET {id}`, `DELETE {id}` bajo `/api/schedule/generate`), los esquemas `Generation` y `GenerationErrorDetails`, y los tres códigos en `ErrorCode`
- [x] 1.2 Añadir los tres códigos a `ERROR_CODES` de `presentation/http/appError.ts` (`appError.test.ts` falla hasta que coinciden) y fijar el contrato en `api/schema.test.ts` (test que falla)
- [x] 1.3 Regenerar los tipos con `npm run api:types -w frontend`

## 2. Base de datos: las tres tablas

- [x] 2.1 Test de integración que falla (`scheduleTables.int.test.ts`) con: una generación en curso por colegio, un borrador por colegio (un `OFFICIAL` no cuenta), `SET NULL` al borrar un profesor, una clase un hueco, `CHECK start < end` y rango del día, y cascadas desde el colegio, el curso, la clase y la asignatura
- [x] 2.2 Añadir los modelos `Schedule`, `ScheduleEntry` y `ScheduleGeneration` a `schema.prisma` y crear la migración con `prisma migrate dev`; revisar el SQL y escribir a mano los dos índices únicos parciales y los `CHECK`
- [x] 2.3 Añadir `resetDatabase()` y `scripts/e2eData.mjs` las tablas nuevas si hace falta (hay un test que compara las dos listas) y actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (sin `rooms` ni `roleType`)

## 3. Backend: dominio, puertos y configuración

- [x] 3.1 Definir en `domain/schedule/` los tipos `Generation` (estados, códigos de error y detalles) y `ScheduleDraft`, y los puertos `GenerationRepository` (insertar, reclamar, guardar progreso con lectura de la marca de cancelación, terminar, marcar como atascadas, leer la actual, leer por id, pedir cancelación), `ScheduleRepository` (`replaceDraft`) y `GenerationLauncher`
- [x] 3.2 Tests que fallan e implementación de `SCHEDULE_MAX_SECONDS` (por defecto 120, entre 5 y 240) y `SCHEDULE_WORKER_FUNCTION_NAME` (opcional) en `loadConfig`

## 4. Backend: repositorios de Prisma

- [x] 4.1 Tests de integración que fallan e implementación de `PrismaGenerationRepository`: el `INSERT` que traduce la violación de unicidad, la reclamación idempotente (`UPDATE … WHERE status='QUEUED'`), el progreso con latido y lectura de `cancel_requested`, terminar, cancelar (directa si `QUEUED`), marcar atascadas con transición condicional y las lecturas filtradas por colegio
- [x] 4.2 Tests de integración que fallan e implementación de `PrismaScheduleRepository.replaceDraft`: sustituye al borrador anterior en una transacción, deja intacto el borrador si falla a mitad y no toca los `OFFICIAL`

## 5. Backend: casos de uso

- [x] 5.1 Tests que fallan e implementación de `StartGeneration` (comprueba `readinessOf`, marca atascadas, inserta, lanza, y si el lanzamiento falla deja `FAILED/INTERNAL`) con sus eventos
- [x] 5.2 Tests que fallan e implementación de `GetGeneration` y `GetCurrentGeneration` (marcan antes las atascadas; `progress` calculado y que no baja)
- [x] 5.3 Tests que fallan e implementación de `CancelGeneration` (200, directa si `QUEUED`, `GENERATION_NOT_CANCELLABLE`, 404)
- [x] 5.4 Tests que fallan e implementación de `RunGeneration`: reclamación (un reintento no hace nada), `NOT_READY`, `COMPLETED` con el borrador, `INFEASIBLE` con los detalles, `TIMEOUT`, `CANCELLED` por la marca, `INTERNAL` con la traza solo en el log, progreso acotado a una escritura cada 2 s con reloj inyectado, y los eventos sin nombres

## 6. Backend: lanzadores, composición y worker

- [x] 6.1 Tests que fallan e implementación de `InMemoryGenerationLauncher` (ejecuta `runGeneration` sin bloquear la respuesta) y `LambdaGenerationLauncher` (`InvokeCommand` con `InvocationType: 'Event'` y `{ generationId }`, con un cliente falso); añadir `@aws-sdk/client-lambda`
- [x] 6.2 Componer todo en `composeApp.ts` (`runGeneration` devuelto junto a `app`, lanzador según `SCHEDULE_WORKER_FUNCTION_NAME`) y crear `scheduleWorker.ts` (sin lógica, fuera de cobertura, con `POOL_MAX` 2), con el cableado en `server.ts` para ejecutar en local

## 7. Backend: rutas

- [x] 7.1 Tests de ruta que fallan e implementación de las cuatro rutas en `scheduleRouter.ts` (`requireRole('ADMIN')` en `POST` y `DELETE`, `no-store` en los `GET`, UUID inválido a 404, colegio y usuario de la sesión)
- [x] 7.2 Tests de integración (`scheduleGeneration.int.test.ts`) con PostgreSQL: generar y llegar a `COMPLETED` con el lanzador en memoria, bloqueante, ya en curso, dos `POST` simultáneos, cancelar, atascada, `MEMBER`, otro colegio y sustitución del borrador

## 8. Infraestructura: el worker

- [x] 8.1 Tests de plantilla que fallan en `appStack.test.ts`: segunda función con 300 s y 2048 MB, `EventInvokeConfig` con cero reintentos, política `lambda:InvokeFunction` limitada al ARN del worker y `SCHEDULE_WORKER_FUNCTION_NAME` en la API
- [x] 8.2 Implementar `ScheduleWorkerFunction` en `appStack.ts` (mismo empaquetado, otro punto de entrada, mismas variables y secretos, grupo de logs, `SCHEDULE_MAX_SECONDS`) y comprobar `npm run synth -w infrastructure`

## 9. Frontend: el servicio

- [x] 9.1 Tests que fallan e implementación de `scheduleGenerationService` (`start`, `current`, `get`, `cancel`): resultado por caso (`started`, `loaded`, `notReady`, `inProgress`, `notCancellable`, `forbidden`, `notFound`, `unauthenticated`, `unavailable`), validación de la forma y que nunca lanza

## 10. Frontend: el panel y la página

- [x] 10.1 Tests que fallan e implementación de `ScheduleGenerationPanel`: sondeo con temporizador encadenado (simulado con el reloj de test), que se detiene al terminar y al desmontar y que descarta respuestas tardías
- [x] 10.2 Tests que fallan e implementación de los estados del panel: generando (barra accesible, «N de M sesiones», «Cancelar»), completada, cancelada y cada error (`INFEASIBLE` con enlace a la carga del curso, a la matriz o a la disponibilidad según el motivo; `TIMEOUT`; `INTERNAL` con el id), con los textos en `schedule.generation.*` de `es.json` y `en.json`
- [x] 10.3 Tests que fallan y montar el panel en `ScheduleReadinessPage` solo para `ADMIN` y sin bloqueantes (un `MEMBER` ve el estado sin botones; con bloqueantes, la explicación); retomar al recargar
- [x] 10.4 Tests de accesibilidad con `axe` en cada estado y a 360 px

## 11. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 11.1 Revisar los tests que dependen de lo tocado (`composeApp`, `config`, `appError`, `ScheduleReadinessPage`, plantilla de CDK, `resetDatabase`) para que sigan comprobando lo mismo
- [x] 11.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 12. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 12.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 12.2 Ejecutar los tests de los módulos cambiados
- [x] 12.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 12.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 12.5 Crear `reports/YYYY-MM-DD-step-12-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 13. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Aplicar la migración a `calendarschool`, arrancar el backend con el lanzador en memoria y preparar por la API un colegio con un curso, una asignatura asignada y un calendario
- [x] 13.2 Comprobar `POST /api/schedule/generate` (`202`), el sondeo con `GET` hasta `COMPLETED`, el segundo `POST` mientras hay una en curso (`409`), `DELETE` de una en curso (`200`) y de una terminada (`409`), y con un bloqueante (`409 SCHEDULE_NOT_READY`)
- [x] 13.3 Comprobar `MEMBER` (`403` en `POST` y `DELETE`, `200` en `GET`), otro colegio (`404`), sin token (`401`) y `no-store` en los `GET`
- [x] 13.4 Comprobar en la base que hay un solo borrador, que sustituye al anterior y que sus entradas son las esperadas
- [x] 13.5 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-13-curl-manual-testing.md`

## 14. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Añadir `cypress/e2e/scheduleGeneration.cy.ts`: un administrador genera, ve el progreso y el resumen y lo sigue viendo tras recargar; con un bloqueante no hay botón; un `MEMBER` no lo ve; y a 360 px se usa
- [x] 14.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 14.3 Crear `reports/YYYY-MM-DD-step-14-e2e-cypress.md`

## 15. Documentación técnica (MANDATORY)

- [x] 15.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: los casos de uso, los puertos, los lanzadores, `scheduleWorker.ts`, `SCHEDULE_MAX_SECONDS` y las tablas nuevas;
  - `frontend/CLAUDE.md`: el panel, el servicio y el sondeo;
  - `infrastructure`: la segunda función, su permiso y los reintentos a cero;
  - `README.md` (módulo de horarios), `ARQUITECTURA_COMPLETA.md` (ejecución en segundo plano y tabla de la sección 0 a implementado) y los diagramas C4 (la Lambda del worker);
  - `docs/api-spec.yml` y `MODELO_DATOS.md` (ya actualizados en 1.1 y 2.3);
  - la ficha de US-ALGO-RUN (estado: implementada) y la fila de la épica.
- [x] 15.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 15.3 Verificar con `openspec validate us-algo-run-ejecucion --strict` que el cambio es válido

## 16. Despliegue y comprobación en producción

- [x] 16.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–15 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main`, que la migración se aplica y que el despliegue crea el worker
- [ ] 16.2 Comprobar en producción:
  - **Con `curl`:** `POST` y `GET /api/schedule/generate` sin token responden `401`, el bundle contiene los textos nuevos y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, abre «Horarios», pulsa «Generar horarios» y ve el progreso y el resumen (o el error explicado), y comprueba que cancelar funciona.
- [x] 16.3 Documentar el resultado en `reports/YYYY-MM-DD-step-16-production.md`

## 17. Motor: colegios sin huecos libres

- [x] 17.1 Test de regresión con un colegio de 12 clases, 30 sesiones para 30 franjas y especialistas compartidos (`tightSchoolProblem`): resuelto, válido, determinista y en pocos segundos (en rojo con el motor anterior: 28 de 360 sesiones en 30 s)
- [x] 17.2 Orden dom/wdeg y reinicios con semilla fija en `BacktrackingSolver`; los 93 tests del dominio y los de integración de la generación siguen en verde
- [x] 17.3 Documentar la decisión (D12), el requisito del motor y `backend/CLAUDE.md`
