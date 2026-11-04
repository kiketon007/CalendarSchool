## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-run` desde `main` actualizada (`7a9831a`, con US-ALGO-CHECK archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene:
  - los artefactos de este cambio;
  - la ficha enriquecida de US-ALGO-RUN y las notas de US-ALGO-CHECK y US-ALGO-VIEW en `docs/User_Stories_MVP.md`;
  - las correcciones de HC5, HC8, CA8 y CA10 en `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` y de HC5 y HC6 en `docs/arquitectura/ARQUITECTURA_COMPLETA.md`;
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.

## 1. Contrato: el aviso de huecos libres

- [x] 1.1 Añadir `WORKLOAD_BELOW_SLOTS` a `ReadinessIssueCode` en `docs/api-spec.yml` (con `course`, `assigned` y `available` en la descripción y en el ejemplo)
- [x] 1.2 Fijar el código nuevo en `api/schema.test.ts` (test que falla) y regenerar los tipos con `npm run api:types -w frontend`

## 2. Backend: el aviso en la comprobación previa

- [x] 2.1 Añadir a `test-fixtures/schedule-readiness.json` los casos de `WORKLOAD_BELOW_SLOTS`: menos carga que franjas, igual, sin calendario, sin clases, sin asignaturas activas y con una inactiva que no cuenta (test que falla)
- [x] 2.2 Implementar el aviso en `readinessOf` y añadirlo a `WARNING_CODES` tras `COURSE_WITHOUT_SUBJECTS`

## 3. Backend: la entrada del motor

- [x] 3.1 Definir en `domain/schedule/scheduleSolver.ts` los tipos de la entrada (`GenerationInput`, lecciones, celdas, unidades y dominios), de las entradas del horario y de `SolveOutcome`, y el puerto `ScheduleSolver` con sus opciones (límite, reloj, cancelación y progreso)
- [x] 3.2 Tests que fallan e implementación de `generationInputOf` (`generationInput.ts`): lecciones (sin inactivas, sin clases sin profesor, sin cursos sin calendario), celdas en minutos con su tramo, unidades por bloque y sueltas, y dominios sin prohibidas, sin celdas fuera del calendario, sin solape con la disponibilidad y sin cruzar recreos

## 4. Backend: el validador

- [x] 4.1 Tests que fallan e implementación de `validateSchedule` con un horario válido y horarios construidos a mano que rompen cada una de las reglas (HC1 a HC8 y una celda que no existe en el calendario), cada uno con exactamente su violación

## 5. Backend: el motor

- [x] 5.1 Crear `test-fixtures/schedule-generation.json` con problemas pequeños calculados a mano y su resultado: al menos uno por restricción, calendarios de 45 y 60 minutos, bloques con recreo, máximo al día, inactivas, huecos libres, el tutor libre que da clase en otra clase y los dos casos `infeasible` (`NO_FREE_CELLS` y `PROFESSOR_BUSY`)
- [x] 5.2 Test que falla (recorre la tabla) e implementación mínima de `BacktrackingSolver`: estado, MRV con sus desempates, valores en orden estable, *forward checking* sobre HC2, HC3 y HC5 y deshacer los cambios
- [x] 5.3 Tests que fallan e implementación de la cota de HC7 (minutos colocados más la duración mínima de las unidades pendientes) y de la poda de simetrías entre unidades iguales de una lección
- [x] 5.4 Tests que fallan e implementación de la causa de `infeasible` (`NO_FREE_CELLS` antes de buscar; si no, la lección que más se quedó sin opciones y la restricción que más valores le quitó)
- [x] 5.5 Tests que fallan e implementación del límite de tiempo, la cancelación (consultados cada 1024 nodos, con reloj y señal inyectados) y `onProgress` (máximo alcanzado, nunca baja)
- [x] 5.6 Validación del resultado dentro del motor antes de devolver `solved` (error si hay violaciones), con su test
- [x] 5.7 Tests de propiedades con un generador con semilla fija en `test/support` (todo `solved` pasa el validador; dos ejecuciones dan lo mismo) y el caso de tamaño real (12 cursos de 2 clases, 15 profesores, dos calendarios) dentro del tiempo del test

## 6. Frontend: el aviso de huecos libres

- [x] 6.1 Tests que fallan y añadir `WORKLOAD_BELOW_SLOTS` a `WARNING_CODES` y a la validación de referencias de `scheduleReadinessService`
- [x] 6.2 Tests que fallan e implementación del texto y el enlace en `ReadinessIssueItem` («{curso} tiene {assigned} sesiones para {available} franjas: quedarán {n} huecos libres en cada clase», con plural sobre `n`, y enlace a la carga del curso), con los textos en `es.json` y `en.json`
- [x] 6.3 Actualizar los tests de `ScheduleReadinessPage` que cuentan los avisos (ocho tipos) y los de `axe`

## 7. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 7.1 Revisar los tests que enumeran los códigos de la comprobación (`readiness.test.ts`, servicio, componente y página) para que sigan comprobando lo mismo con el código nuevo
- [x] 7.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 8. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 8.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 8.2 Ejecutar los tests de los módulos cambiados
- [x] 8.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 8.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 8.5 Crear `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend contra `calendarschool` migrada
- [x] 9.2 Preparar por la API un colegio con un curso con menos carga que franjas, otro con la carga igual y otro con una asignatura inactiva que no cuenta
- [x] 9.3 Comprobar `GET /api/schedule/readiness`: el aviso `WORKLOAD_BELOW_SLOTS` con sus cifras y en su orden, que no sale en los otros dos cursos, que no cambia `ready` y que desaparece al completar la carga
- [x] 9.4 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-9-curl-manual-testing.md` (el motor no tiene endpoint en este cambio: se anota en el informe)

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Añadir a `cypress/e2e/scheduleReadiness.cy.ts` el aviso de huecos libres con su texto, su enlace a la carga del curso y que desaparece al completar la carga
- [x] 10.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 10.3 Crear `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación técnica (MANDATORY)

- [x] 11.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: la entrada del motor, `BacktrackingSolver`, `validateSchedule`, la numeración HC1–HC8 y el aviso nuevo;
  - `frontend/CLAUDE.md`: el aviso nuevo en la página;
  - la arquitectura (`ARQUITECTURA_COMPLETA.md`: el motor pasa a implementado en la tabla de la sección 0, y la sección 5 deja de ser solo objetivo; diagramas C4: el componente del motor);
  - la limpieza de `roomId`, las aulas y la pseudo-restricción `TIMESLOT_COVERAGE` en las secciones objetivo de `ARQUITECTURA_COMPLETA.md`, el diagrama C4 y la especificación de US-ALGO;
  - `docs/api-spec.yml` ya actualizado en 1.1;
  - la ficha de US-ALGO-RUN (estado parcial: motor hecho, ejecución pendiente) y la fila de la épica.
- [x] 11.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.3 Verificar con `openspec validate us-algo-run-motor --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [x] 12.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–11 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 12.2 Comprobar en producción:
  - **Con `curl`:** el bundle contiene el texto nuevo y `GET /api/schedule/readiness` sin token responde `401`;
  - **La persona usuaria, con un navegador real**, abre «Horarios» y ve el aviso de huecos libres en un curso con menos carga que franjas (si lo hay).
- [x] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
