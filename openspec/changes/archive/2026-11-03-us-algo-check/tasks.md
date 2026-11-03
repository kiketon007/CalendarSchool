## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-check` desde `main` actualizada (`22043f1`, con US-PROF-SUMMARY_b archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene:
  - los artefactos de este cambio;
  - las fichas y notas de la épica 7 y US-SUBJECT_d en `docs/User_Stories_MVP.md`;
  - la nota de `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md`;
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `GET /api/schedule/readiness` (`getScheduleReadiness`: `200` con `no-store`, `401`, `500` y `503`) y los esquemas `ScheduleReadinessResponse`, `ScheduleReadiness`, `ReadinessIssue` y `ReadinessIssueCode`, con un ejemplo con bloqueantes y avisos
- [x] 1.2 Fijar la operación y los esquemas en `api/schema.test.ts` (test que falla) y regenerar los tipos con `npm run api:types -w frontend`

## 2. Backend: dominio

- [x] 2.1 Definir `SchedulingProblem` y el puerto `SchedulingProblemRepository.read(schoolId)` en `domain/schedule/`
- [x] 2.2 Tests que fallan e implementación de `unavailableCellsOf` (los tramos de un profesor en las celdas de un calendario, con la regla de solape)
- [x] 2.3 Crear `test-fixtures/schedule-readiness.json` con al menos un caso por código, los órdenes, «listo para generar», las inactivas que no cuentan y la combinación asignatura-profesor que cabe y la que no
- [x] 2.4 Test que falla (recorre la tabla) e implementación de `readinessOf` en `domain/schedule/readiness.ts`, reutilizando `workloadWarnings`, `subjectWarnings`, `preferredSlotsWarnings`, `sessionGroupsOf` y `teachingLoadOf`

## 3. Backend: aplicación

- [x] 3.1 Tests que fallan e implementación de `GetScheduleReadiness` (`application/schedule/`): lee la foto del colegio de la identidad y llama a `readinessOf` con `compareText`; un fallo de la base llega al manejador

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan e implementación de `PrismaSchedulingProblemRepository.read`: dos consultas como mucho, sin bloqueos, con `translateDatabaseErrors`; cursos con y sin calendario y clases, asignaturas activas e inactivas con reglas y celdas, asignaciones, profesores con tramos, aislamiento por colegio y base caída
- [x] 4.2 Cablear el repositorio y el caso de uso en `composeApp` y en `AppDependencies` (dobles en `test/support/appDoubles.ts`)

## 5. Backend: presentación

- [x] 5.1 Tests que fallan e implementación de `scheduleRouter` (`GET /readiness`) montado en `/schedule` en `app.ts`: `200` con la forma del contrato para `ADMIN` y `MEMBER`, `no-store`, `401` sin token y `503` con la base caída
- [x] 5.2 Test de integración HTTP (`scheduleReadiness.int.test.ts`) con datos creados por la API: un colegio con varios bloqueantes y avisos, uno listo para generar, uno vacío, el aislamiento entre colegios y `401`

## 6. Frontend: servicio

- [x] 6.1 Tests que fallan e implementación de `services/scheduleReadinessService.ts` (`get`): `loaded`, `unauthenticated` y `unavailable`; valida los códigos, las referencias de cada uno y que `ready` coincida con `blocking` vacío; nunca lanza

## 7. Frontend: página y navegación

- [x] 7.1 Tests que fallan e implementación de `ScheduleReadinessPage` (carga): una sola petición con `StrictMode`, `role="status"` mientras carga y `role="alert"` con «Reintentar»
- [x] 7.2 Tests que fallan e implementación del veredicto («Se puede generar» o «No se puede generar todavía: {n} problemas», con icono y texto) y de la nota fija
- [x] 7.3 Tests que fallan e implementación de `ReadinessIssueItem`: el texto y los enlaces de cada uno de los dieciséis códigos, con plurales
- [x] 7.4 Tests que fallan e implementación de los dos grupos (bloqueantes y avisos) con sus encabezados y recuentos, en el orden de la respuesta
- [x] 7.5 Ruta `/horarios` en `App.tsx` dentro de `AuthenticatedLayout` sin `RequireRole` y entrada «Horarios» en `AppHeader` para los dos roles, con sus tests
- [x] 7.6 Textos en `es.json` y `en.json` (`schedule.readiness.*` y `header.schedule`, con plurales) y tests de `axe` (lista, con problemas, cargando, con error, en inglés y a 360 px)

## 8. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `AppHeader`, `App` (rutas), `appDoubles` y los que enumeran las rutas de la API para que sigan comprobando lo mismo con la ruta y la entrada nuevas
- [x] 8.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 9. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 9.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 9.2 Ejecutar los tests de los módulos cambiados
- [x] 9.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 9.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 9.5 Crear `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend contra `calendarschool` migrada
- [x] 10.2 Preparar por la API un colegio con un problema de cada código posible y otro listo para generar
- [x] 10.3 Comprobar `GET /api/schedule/readiness` como `ADMIN` y como `MEMBER`: `ready`, los bloqueantes y avisos con sus referencias y cifras, el orden y `no-store`; que un bloqueante desaparece al corregirlo
- [x] 10.4 Comprobar los errores: `401` sin token y que otro colegio no ve estos problemas
- [x] 10.5 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Crear `cypress/e2e/scheduleReadiness.cy.ts` con los datos creados por la API: bloqueantes y avisos de varios tipos con sus enlaces, corregir uno y verlo desaparecer, un colegio listo para generar, la entrada «Horarios» y 360 px sin desplazamiento horizontal
- [x] 11.2 Actualizar los E2E existentes que comprueban los enlaces de la cabecera, si la entrada nueva cambia lo que comprueban
- [x] 11.3 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 11.4 Crear `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación técnica (MANDATORY)

- [x] 12.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: la foto del problema, `readinessOf`, la regla de las inactivas, el router `/schedule` y la fila de la tabla de features;
  - `frontend/CLAUDE.md`: la página y la presentación de los problemas;
  - el `CLAUDE.md` raíz (estado del repositorio);
  - la arquitectura (`ARQUITECTURA_COMPLETA.md` y diagramas: el primer componente de la generación pasa a implementado);
  - `docs/api-spec.yml` ya actualizado en 1.1;
  - la ficha de US-ALGO-CHECK y la fila de la épica.
- [x] 12.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 12.3 Verificar con `openspec validate us-algo-check --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–12 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 13.2 Comprobar en producción:
  - **Con `curl`:** el bundle contiene los textos nuevos y `GET /api/schedule/readiness` sin token responde `401`;
  - **La persona usuaria, con un navegador real**, abre «Horarios», ve el veredicto, los problemas de su colegio con sus enlaces y comprueba que un bloqueante desaparece tras corregirlo.
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
