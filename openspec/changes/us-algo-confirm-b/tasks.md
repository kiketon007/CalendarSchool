## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-confirm-b` desde `main` actualizada, con los artefactos de este cambio y la nota de la exploración y la ficha enriquecida de US-ALGO-CONFIRM_b en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar

## 1. Contrato

- [x] 1.1 Añadir en `docs/api-spec.yml` `GET /api/schedule/previous` (`{ schedules: ScheduleSummary[] }`, `401`, `503`, `no-store`) y el `get` de `/api/schedule/{id}` (`{ schedule: ScheduleDetail }`, `401`, `404`, `503`, `no-store`), sin esquemas ni códigos nuevos
- [x] 1.2 Fijar el contrato en `frontend/src/api/schema.test.ts` (test de tipos que falla) y regenerar los tipos con `npm run api:types -w frontend`, con `typecheck` en verde

## 2. Backend: dominio e infraestructura de lectura

- [x] 2.1 Ampliar `ScheduleSelector` a `'draft' | 'official' | { id: string }` y añadir `listPrevious(schoolId)` al puerto `ScheduleReadRepository` en `domain/schedule/scheduleRead.ts` (con la constante del tope, 100), ajustando los dobles de los tests existentes
- [x] 2.2 Tests de integración que fallan de `find(…, { id })` en `prismaScheduleReadRepository.int.test.ts` (un sustituido con su `confirmedBy` y `replacedAt`; el vigente; `null` con el id del borrador, de otro colegio o inexistente; un profesor borrado da `professorId: null`) e implementarlo con el `where` del design D1, sin duplicar el `select`
- [x] 2.3 Tests de integración que fallan de `listPrevious` (solo sustituidos, sin el vigente ni el borrador; orden por `replacedAt` descendente y `id`; tope de 100 con 101; otro colegio; vacía) e implementarlo con la cabecera compartida con `overview`

## 3. Backend: casos de uso

- [x] 3.1 Test que falla de `GetSchedule` con el selector `{ id }` (pasa el selector al repositorio y devuelve el horario ordenado, o `null`) e implementarlo
- [x] 3.2 Test que falla del caso de uso `ListPreviousSchedules` (devuelve las cabeceras del repositorio en su orden; lista vacía) e implementarlo en `application/schedule/listPreviousSchedules.ts`

## 4. Backend: rutas y composición

- [x] 4.1 Tests que fallan de las rutas en `scheduleRouter` (`GET /previous` y `GET /:id` para los dos roles con `no-store`; `GET /:id` con `null` → `404 NOT_FOUND`; un id que no es UUID → `404` sin llegar al caso de uso; `401` sin sesión; `/draft`, `/official`, `/overview`, `/previous` y `/readiness` no caen en `/:id`) e implementarlas, con `GET /:id` después de las literales
- [x] 4.2 Cablear `ListPreviousSchedules` en `composeApp.ts`, `app.ts` y `test/support/appDoubles.ts` hasta que pasen
- [x] 4.3 Tests de integración HTTP (en `src/scheduleConfirmation.int.test.ts` o uno nuevo `src/schedulePrevious.int.test.ts`): confirmar tres veces, la lista con dos en orden, abrir un sustituido y el vigente por id (`200`), el borrador por id (`404`), un `MEMBER` (`200`), otro colegio (`404` y lista vacía) y sin token (`401`)

## 5. Frontend: servicios

- [x] 5.1 Test que falla de `scheduleDraftService.getById` (`loaded` con un oficial vigente o sustituido; `notFound` en un `404`; `unauthenticated`; `unavailable` con un `DRAFT`, una confirmación incoherente o un fallo de red; el id codificado en la URL) e implementarlo reutilizando la validación existente
- [x] 5.2 Test que falla de `scheduleService.previous` (`loaded` con la lista validada; `unavailable` si alguna cabecera no es un `OFFICIAL` con `replacedAt`; `unauthenticated`; sin lanzar) e implementarlo

## 6. Frontend: exportación

- [x] 6.1 Test que falla de la exportación de un oficial sustituido («Horario oficial confirmado el … · sustituido el …» en Markdown y HTML; el vigente sigue con «Horario oficial confirmado el …»; el nombre de fichero no cambia) y adaptar `buildExportModel` con la clave `schedule.export.document.confirmedAndReplacedAt`

## 7. Frontend: páginas y resumen

- [x] 7.1 Test que falla de `pages/PreviousSchedulesPage.tsx` (pide la lista una vez también con `StrictMode`; carga con `role="status"`; filas en orden con «Confirmado el … por …», «Vigente hasta el …», «N sesiones» y «Ver» con la fecha en su nombre accesible; sin anteriores; fallo con «Reintentar»; enlace a `/horarios`) e implementarla
- [x] 7.2 Test que falla del modo `previous` de `ScheduleDraftPage` (pide `getById` una vez; «Horario anterior», «Sustituido», «Confirmado el … por … · Sustituido el …», «Generado el …» y el aviso de los datos de hoy; tres vistas y «Exportar», sin acciones de escritura para `ADMIN`; el vigente por id con «Oficial» y sin «Sustituido el …»; `notFound` con «Este horario no existe» y el enlace a la lista; fallo con «Reintentar») e implementarlo con la unión discriminada de props del design D6
- [x] 7.3 Test que falla de las rutas `/horarios/anteriores` y `/horarios/anteriores/:id` en `App.test.tsx` (para los dos roles; pasar de un anterior a otro vuelve a pedir el horario) e implementarlas con el componente `PreviousSchedulePage` que monta la página con `key={id}`
- [x] 7.4 Test que falla de `OfficialScheduleSummary` con `previousCount` («Horarios anteriores (2)» enlaza a `/horarios/anteriores`; sin enlace con 0) y pasarle `previousCount` desde `ScheduleReadinessPage`
- [x] 7.5 Textos en `schedule.previous.*` y los nuevos de `schedule.official.summary.*` y `schedule.export.document.*` en `es.json` y `en.json` (los tests de 6 y 7 ya los usan)
- [x] 7.6 Tests a 360 px y de `axe` de la lista y de la página de un anterior, en los dos roles

## 8. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `ScheduleDraftPage`, `ScheduleReadinessPage`, `OfficialScheduleSummary`, `App`, la exportación, `GetSchedule`, el repositorio de lectura y los E2E `scheduleConfirmation.cy.ts` y `scheduleExport.cy.ts` por el selector, los textos y las rutas nuevas, y ajustarlos

## 9. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 9.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 9.2 Ejecutar los tests de los módulos cambiados
- [x] 9.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend), `npm run lint` y `typecheck`
- [x] 9.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 9.5 Crear `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend con el lanzador en memoria (sin las claves de reCAPTCHA), preparar por la API un colegio y un miembro, generar y confirmar tres veces, y comprobar `GET /api/schedule/previous` (dos, en orden) y `overview` (`previousCount: 2`)
- [x] 10.2 Comprobar `GET /api/schedule/{id}` con un sustituido y el vigente (`200`), el borrador (`404`), un id inexistente y uno que no es UUID (`404`), un `MEMBER` (`200`), otro colegio (`404` y lista vacía) y sin token (`401`)
- [x] 10.3 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir `cypress/e2e/schedulePrevious.cy.ts`: confirmar dos horarios seguidos, ver «Horarios anteriores (1)» en `/horarios`, abrir la lista y el anterior, cambiar de vista y exportarlo; un `MEMBER` ve la lista y el anterior sin acciones; la lista a 360 px
- [x] 11.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 11.3 Crear `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación técnica (MANDATORY)

- [x] 12.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: el selector `{ id }`, `listPrevious` y las dos rutas (orden de `/:id`);
  - `frontend/CLAUDE.md`: el modo `previous` de la página, `PreviousSchedulesPage` y la ruta con `key`;
  - `README.md` (módulo de generación), `ARQUITECTURA_COMPLETA.md` (tabla de la sección 0) y el `CLAUDE.md` raíz (estado actual);
  - `docs/api-spec.yml` (ya actualizado en 1.1);
  - la ficha de US-ALGO-CONFIRM_b (estado: implementada) y el resumen de la épica.
- [x] 12.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 12.3 Verificar con `openspec validate us-algo-confirm-b --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [ ] 13.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–12 tras la confirmación de la persona usuaria; tras integrarla, verificar el CI del push a `main` y el despliegue
- [ ] 13.2 Comprobar en producción:
  - **Con `curl`:** `GET /api/schedule/previous` y `GET /api/schedule/{id}` sin token responden `401`, el bundle contiene los textos nuevos y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, abre la lista de anteriores, abre uno y lo exporta.
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
