## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-confirm` desde `main` actualizada, con los artefactos de este cambio, la nota de la exploración, la ficha enriquecida de US-ALGO-CONFIRM y la nueva US-ALGO-CONFIRM_b de `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar

## 1. Contrato

- [x] 1.1 Renombrar en `docs/api-spec.yml` `ScheduleDraft` a `ScheduleDetail` (con `status` `DRAFT | OFFICIAL` y `confirmedAt`, `confirmedBy` y `replacedAt`) y añadir `ScheduleSummary`, `GET /api/schedule/official`, `GET /api/schedule/overview`, `POST /api/schedule/{id}/confirm`, `DELETE /api/schedule/{id}` y `SCHEDULE_NOT_DRAFT` en `ErrorCode`
- [x] 1.2 Fijar el contrato en `frontend/src/api/schema.test.ts` (test de tipos que falla), regenerar los tipos con `npm run api:types -w frontend` y adaptar los usos de `ScheduleDraft` del frontend (servicio, vistas, exportación y sus tests) al nombre nuevo, con `typecheck` en verde
- [x] 1.3 Test que falla de `appError.test.ts` con `SCHEDULE_NOT_DRAFT` y añadirlo a `ERROR_CODES`

## 2. Base de datos

- [x] 2.1 Test de integración que falla de las restricciones nuevas (`schedules_official_key`, los tres `CHECK`) en `backend/src/infrastructure/prisma/`
- [x] 2.2 Crear la migración con `prisma migrate dev --name confirm_schedules` (columnas `confirmed_at`, `confirmed_by_id`, `replaced_at`), añadir a mano los `CHECK` y el índice parcial, revisar el SQL y aplicarla a las bases de desarrollo y de test hasta que pase 2.1
- [x] 2.3 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (columnas, `CHECK`, índice y qué es un oficial vigente o sustituido)

## 3. Backend: lectura generalizada

- [x] 3.1 Generalizar el dominio de lectura: `StoredScheduleDraft` → `StoredSchedule` (con `confirmedAt`, `confirmedBy`, `replacedAt`) y `ScheduleDraftRepository.findDraft` → `ScheduleReadRepository.find(schoolId, 'draft' | 'official')`, con los tests existentes adaptados (deben seguir pasando)
- [x] 3.2 Tests de integración que fallan de `find(…, 'official')` (vigente con su `confirmedBy`, sin oficial, un sustituido no cuenta, otro colegio) e implementarlo en `PrismaScheduleReadRepository` con la misma consulta única
- [x] 3.3 `GetScheduleDraft` → `GetSchedule` (`which`), con test que falla de los campos de confirmación y de la lectura del oficial
- [x] 3.4 Test que falla de `GetScheduleOverview` (borrador, oficial vigente, `previousCount`) y de su lectura en el repositorio (cabeceras sin entradas), e implementarlos

## 4. Backend: confirmar y descartar

- [x] 4.1 Test que falla del caso de uso `ConfirmSchedule` con dobles (confirmado; `NOT_FOUND`; `NOT_DRAFT`; eventos `SCHEDULE_CONFIRMED` y `SCHEDULE_CONFIRM_REJECTED` sin nombres) e implementarlo
- [x] 4.2 Tests de integración que fallan de `confirm` en el repositorio (primer oficial; sustituye y conserva el anterior con sus entradas; `404` de otro colegio o inexistente; `409` si ya no es borrador; dos confirmaciones en paralelo: una gana; con una generación `RUNNING` que guarda después) e implementarlo con la transacción del design D2
- [x] 4.3 Test que falla del caso de uso `DiscardScheduleDraft` (descartado; `NOT_FOUND`; `NOT_DRAFT` de un oficial; eventos) e implementarlo
- [x] 4.4 Tests de integración que fallan de `discard` (borra el horario y sus entradas; la generación queda con `schedule_id` nulo; un oficial vigente o sustituido no se borra; otro colegio) e implementarlo con el `DELETE` condicionado del design D3

## 5. Backend: rutas y composición

- [x] 5.1 Tests que fallan de las rutas en `scheduleRouter` (`GET /official` y `/overview` para los dos roles con `no-store`; `POST /:id/confirm` y `DELETE /:id` solo `ADMIN`; id que no es UUID → `404` sin llegar al caso de uso; `409` y `404` con su código; `401` sin sesión), con las rutas literales antes que `/:id`
- [x] 5.2 Cablear los casos de uso en `composeApp.ts`, `app.ts` y `test/support/appDoubles.ts` hasta que pasen
- [x] 5.3 Tests de integración HTTP (`src/scheduleConfirmation.int.test.ts`): generar, confirmar, leer el oficial y el resumen, regenerar y confirmar de nuevo (sustituye), descartar, `MEMBER` (`403` al escribir, `200` al leer), otro colegio y carrera de dos `POST` en paralelo

## 6. Frontend: servicios

- [x] 6.1 Test que falla de `scheduleDraftService` generalizado (`getDraft` y `getOfficial`: el estado que toca, los campos de confirmación, `unavailable` con un estado o una confirmación incoherentes) e implementarlo
- [x] 6.2 Test que falla de `services/scheduleService.ts` (`overview`, `confirm`, `discard`, con resultados `loaded`, `confirmed`, `discarded`, `notFound`, `notDraft`, `forbidden`, `unauthenticated` y `unavailable`, validando la forma y sin lanzar) e implementarlo

## 7. Frontend: desfases y exportación

- [x] 7.1 Test que falla de `draftGaps(index)` (sesiones sin profesor, fuera del calendario actual y cursos sin calendario, con las mismas reglas que `classView`) e implementarlo
- [x] 7.2 Test que falla de la exportación de un oficial («Horario oficial confirmado el …» en Markdown y HTML; el nombre de fichero no cambia) y adaptar el modelo de `scheduleExport.ts`

## 8. Frontend: diálogos

- [x] 8.1 Test que falla de `components/ConfirmScheduleModal.tsx` (texto con y sin oficial previo, aviso de desfases, carga del borrador si no se le pasa, «Confirmar» con guarda síncrona, no se cierra mientras envía, `404`, `409`, fallo con «Reintentar», `axe`) e implementarlo
- [x] 8.2 Test que falla de `components/DiscardScheduleDraftModal.tsx` (texto, guarda, `404`, `409`, fallo, `axe`) e implementarlo

## 9. Frontend: páginas y panel

- [x] 9.1 Test que falla de la página generalizada (`which`): el oficial en `/horarios/oficial` con «Oficial», «Confirmado el … por …», tres vistas y «Exportar», sin acciones; sin oficial; el borrador con «Confirmar como oficial» y «Descartar el borrador» solo para `ADMIN`; confirmar lleva a `/horarios/oficial` con el aviso y descartar a `/horarios`; e implementarlo, con la ruta en `App.tsx` y su test
- [x] 9.2 Test que falla de `components/OfficialScheduleSummary.tsx` (con y sin oficial, para los dos roles, fallo con «Reintentar» que no bloquea la página) y montarlo arriba de `ScheduleReadinessPage`, que pide el resumen una vez (también con `StrictMode`)
- [x] 9.3 Test que falla del panel en el estado completado según el resumen (borrador vigente: «Ver horario» y, para `ADMIN`, «Confirmar como oficial»; oficial: «Este horario es el oficial» y «Ver horario oficial»; ya no existe: sin enlace) y de que la página vuelve a pedir el resumen al terminar una generación; e implementarlo
- [x] 9.4 Textos en `schedule.official.*`, `schedule.confirm.*`, `schedule.discard.*` y los nuevos de `schedule.draft.*` y `schedule.generation.*` en `es.json` y `en.json` (los tests de 8 y 9 ya los usan)
- [x] 9.5 Tests a 360 px y de `axe` de la página del oficial, de los diálogos y del resumen

## 10. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 10.1 Revisar los tests de `ScheduleDraftPage`, `ScheduleGenerationPanel`, `ScheduleReadinessPage`, `App`, la exportación y los E2E `scheduleDraft.cy.ts`, `scheduleExport.cy.ts` y `scheduleGeneration.cy.ts` por los textos y las peticiones nuevas (el resumen) y ajustarlos

## 11. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 11.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 11.2 Ejecutar los tests de los módulos cambiados
- [x] 11.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend), `npm run lint` y `typecheck`
- [x] 11.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 11.5 Crear `reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 12. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Arrancar el backend con el lanzador en memoria (sin las claves de reCAPTCHA), preparar por la API un colegio y un miembro, generar y comprobar `GET /api/schedule/overview` y `/official` sin oficial
- [x] 12.2 Confirmar (`200`, el resumen y el oficial con `confirmedBy`), confirmar otra vez (`409`), generar de nuevo y confirmar (sustituye; `previousCount` 1), descartar un borrador (`204`, la generación con `scheduleId: null`), `DELETE` del oficial (`409`), un `MEMBER` (`403` al escribir, `200` al leer), otro colegio (`404`), un id que no es UUID (`404`) y sin token (`401`)
- [x] 12.3 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-12-curl-manual-testing.md`

## 13. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Añadir `cypress/e2e/scheduleConfirmation.cy.ts`: generar, confirmar desde `/horarios/borrador`, ver el oficial y el resumen de `/horarios`, generar otro borrador y confirmarlo desde el panel (sustituye), descartar un borrador, un `MEMBER` sin acciones y los diálogos a 360 px
- [x] 13.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 13.3 Crear `reports/YYYY-MM-DD-step-13-e2e-cypress.md`

## 14. Documentación técnica (MANDATORY)

- [x] 14.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: confirmar y descartar (transacción, concurrencia con `replaceDraft`), la lectura generalizada y el resumen, los eventos;
  - `frontend/CLAUDE.md`: la página generalizada, los diálogos, `draftGaps`, el resumen del oficial y el panel;
  - `README.md` (módulo de generación), `ARQUITECTURA_COMPLETA.md` (tabla de la sección 0) y el `CLAUDE.md` raíz;
  - `docs/api-spec.yml` y `MODELO_DATOS.md` (ya actualizados en 1.1 y 2.3);
  - la ficha de US-ALGO-CONFIRM (estado: implementada) y el resumen de la épica.
- [x] 14.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 14.3 Verificar con `openspec validate us-algo-confirm --strict` que el cambio es válido

## 15. Despliegue y comprobación en producción

- [x] 15.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–14 tras la confirmación de la persona usuaria; tras integrarla, verificar el CI del push a `main` y que el despliegue aplicó la migración
- [x] 15.2 Comprobar en producción:
  - **Con `curl`:** `GET /api/schedule/overview` y `/official` sin token responden `401`, el bundle contiene los textos nuevos y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, confirma su borrador, ve el oficial, lo exporta y comprueba el resumen de `/horarios`.
- [x] 15.3 Documentar el resultado en `reports/YYYY-MM-DD-step-15-production.md`
