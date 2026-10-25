## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-base-c-borrar-calendario` desde `main` actualizada, llevando los artefactos de este cambio y la ficha de US-BASE_c de `docs/User_Stories_MVP.md` (sin el fichero de bloqueo `docs/prompts/~$rarios.docx`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `deleteCalendar` (`DELETE /api/calendars/{id}`, Bearer, solo `ADMIN`, sin cuerpo: `200`, `401`, `403`, `404` con `CalendarNotFound`, `500`, `503`, con `Cache-Control: no-store`) y el esquema `DeleteCalendarResponse` (`{ deleted: { id, courseCount } }`)
- [x] 1.2 Fijar en `api/schema.test.ts` la operación y `DeleteCalendarResponse` (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Backend: dominio y aplicación

- [x] 2.1 Dominio: el puerto `CalendarRepository` gana `delete(schoolId, calendarId)`, que devuelve `{ courseCount }` o `null`
- [x] 2.2 Tests que fallan (`deleteCalendar.test.ts`): `null` → `CalendarNotFound` sin registrar nada; éxito → `{ id, courseCount }` y `CALENDAR_DELETED` (`school_id`, `actor_id`, `calendar_id`, `course_count`) sin nombres; un fallo de la base de datos se deja pasar sin evento; implementar `DeleteCalendar`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaCalendarRepository.int.test.ts`): `delete` borra el calendario y sus periodos, deja sus cursos sin calendario y vivos, devuelve el recuento (también `0`), no toca otros calendarios ni sus cursos; calendario de otro colegio o inexistente → `null` sin borrar nada; atomicidad con un disparador de prueba que hace fallar el borrado de los periodos
- [x] 3.2 Implementar `delete` en `PrismaCalendarRepository` según el diseño (decisión 3: calendario `FOR UPDATE`, sus cursos `FOR UPDATE` en orden de `id`, recuento y `DELETE` con la cascada y el `SET NULL` de la base de datos, con `translateDatabaseErrors`)
- [x] 3.3 Tests de integración de concurrencia, varias rondas: dos borrados del mismo calendario (uno con `{ courseCount }` y otro `null`); borrado contra edición del mismo calendario (la edición con éxito o `null`); borrado contra la edición de otro calendario que se lleva uno de sus cursos (los dos con éxito y el curso en el otro calendario); borrado contra el borrado de uno de sus cursos (los dos con éxito); sin errores ni interbloqueos

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`calendarsRoute.test.ts`): `DELETE /:id` con `200`, `{ deleted: { id, courseCount } }` y `no-store`, el `id` y el colegio de la identidad al caso de uso, `403 FORBIDDEN` para un `MEMBER` sin mirar el `id` (también uno que no es UUID) ni llamar al caso de uso, `404` con un `id` que no es UUID, `404` si no está, `401` y `503`
- [x] 4.2 Implementar en `calendarsRouter` la ruta `DELETE /:id` (`requireRole('ADMIN')` antes de `parseCalendarId`) y conectar `DeleteCalendar` en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración por HTTP (`calendars.int.test.ts`): borrar con cursos (los cursos siguen y no aparecen en ningún calendario, el listado ya no lo trae y `GET /api/calendars/{id}` da `404`) y sin cursos, `404` de otro colegio, inexistente, no UUID y ya borrado, `MEMBER` (`403` sin borrar nada, también con un `id` inexistente), `401`, el evento `CALENDAR_DELETED` sin nombres y sin evento en el `404`, y dos `DELETE` a la vez (`200` y `404`)

## 5. Frontend: servicio y textos

- [x] 5.1 Tests que fallan (`calendarsService.test.ts`): `delete` (`DELETE` sin cuerpo con el `id` codificado; `deleted` con `{ id, courseCount }`, `notFound`, `forbidden`, `unauthenticated`, `unavailable` y formas incorrectas, también un `courseCount` negativo o no entero); implementar
- [x] 5.2 Añadir a `es.json` y `en.json` los textos del borrado: «Borrar», `aria-label` «Borrar {nombre}», título del diálogo, cursos afectados y «ningún curso», «Esta acción no se puede deshacer», «Borrar calendario», «Borrando…», el error del diálogo, el aviso «eliminado» con y sin cursos (plural) y «Ese calendario ya no existe»

## 6. Frontend: diálogo y listado

- [x] 6.1 Tests que fallan (`DeleteCalendarModal.test.tsx`): título, cursos afectados y «ningún curso», «no se puede deshacer», foco inicial en «Cancelar», sin «X», no pide nada al abrirse, cancelar y Escape, una sola petición con doble pulsación, «Borrando…» con los botones deshabilitados y sin cerrarse con Escape mientras borra, `404` → `onGone`, fallo con `role="alert"` y reintento, `onDeleted` con la respuesta del servidor, `axe`; implementar `components/DeleteCalendarModal.tsx`
- [x] 6.2 Tests que fallan (`CalendarsPage.test.tsx`, a 1280 y 360 px): «Borrar {nombre}» solo para `ADMIN`; al confirmar, la tarjeta desaparece sin volver a pedir la lista, aviso con el `courseCount` del servidor (con y sin cursos, plural) en un `role="status"` con prioridad sobre el de llegada; estado vacío al borrar el último; `onGone` con aviso y recarga; `axe` con el diálogo abierto; implementar en `pages/CalendarsPage.tsx` (incluido el foco al `h1` un turno después de `onExited`)

## 7. Revisar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests de `CalendarsPage`, `calendarsService`, `api/schema.test.ts`, el repositorio y la ruta de calendarios y `calendars.cy.ts`, y actualizarlos conservando lo que comprobaban

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidos `calendars` y `calendar_periods`), vaciando antes los restos de ejecuciones sueltas en `test_<n>`
- [x] 8.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), guardando el log y leyendo el código de salida del propio comando (nunca tras una tubería) y comprobando que no hay errores «Unhandled»
- [x] 8.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 8.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 8.5 Documentar el resultado en `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: borrar con cursos (`200`, `no-store`, `courseCount`, los cursos siguen sin calendario, el listado y `GET /{id}` ya no lo traen) y sin cursos; `404` de otro colegio, inexistente, no UUID y ya borrado; `403` de un `MEMBER` real (creado con una invitación), también con un `id` inexistente; `401` sin token; concurrencia varias rondas (dos borrados a la vez, borrado contra edición del mismo, contra la edición de otro que se lleva un curso y contra el borrado de un curso); y que el log no contiene nombres (normalizando los CRLF de `jq.exe` antes de comparar)
- [x] 9.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ampliar `cypress/e2e/calendars.cy.ts` con el borrado: el diálogo con los cursos afectados y el foco en «Cancelar»; cancelar (el foco vuelve a «Borrar»); confirmar un calendario con cursos (aviso con el recuento, foco en el título, los cursos siguen existiendo sin calendario en `/cursos` o en el formulario de otro calendario); borrar el último (estado vacío); un `MEMBER` sin «Borrar»; el diálogo a 360 px sin desplazamiento horizontal (cada `cy.intercept` registrado una sola vez, sin encadenar tras `clear()` y buscando el `input` de una casilla por el `for` de su etiqueta)
- [x] 10.2 Ejecutar en modo headless `calendars.cy.ts` y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (contar lo que liberará un `SET NULL` con los hijos bloqueados antes del borrado) y `docs/frontend-standards.md` si surge algo nuevo respecto al patrón de borrado de US18
- [x] 11.2 Actualizar `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (módulo 2, endpoints y árbol), `docs/Modelo_de_Datos/MODELO_DATOS.md` (el borrado y sus efectos), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y el resumen del backlog
- [x] 11.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.4 Verificar con `openspec validate us-base-c-borrar-calendario --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [ ] 12.1 Repetir `npm run lint`, `typecheck` y `api:types:check` con su código de salida, abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático, que no hay migraciones pendientes y el smoke test
- [ ] 12.2 Comprobar en producción con `curl` que `/calendarios` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `DELETE /api/calendars/{id}` sin token responde `401` (sin borrar datos), y que la persona usuaria, con un navegador real, borra un calendario con cursos y otro sin cursos, cancela y lo ve como `MEMBER` sin «Borrar», en escritorio y en el móvil, sin violaciones de CSP
- [ ] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
