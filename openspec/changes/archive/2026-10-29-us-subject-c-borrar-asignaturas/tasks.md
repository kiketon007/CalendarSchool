## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-subject-c-borrar-asignaturas` desde `main` actualizada, llevando el commit de la ficha de US-SUBJECT_c de `docs/User_Stories_MVP.md` y los artefactos de este cambio (sin el fichero de bloqueo `docs/prompts/~$rarios.docx`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio y `.claude/settings.json` en Sonnet con esfuerzo medio

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `deleteSubject` (`DELETE /api/subjects/{id}`, Bearer, solo `ADMIN`, sin cuerpo: `200`, `401`, `403`, `404` con `SubjectNotFound`, `500`, `503`, con `Cache-Control: no-store`) y el esquema `DeleteSubjectResponse` (`{ deleted: { id } }`)
- [x] 1.2 Fijar en `api/schema.test.ts` la operación y `DeleteSubjectResponse` (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Backend: dominio y aplicación

- [x] 2.1 Dominio: el puerto `SubjectRepository` gana `delete(schoolId, subjectId)`, que devuelve `true` si borró la asignatura y `false` si no es del colegio
- [x] 2.2 Tests que fallan (`deleteSubject.test.ts`): `false` → `SubjectNotFound` sin registrar nada; éxito → `{ id }` y `SUBJECT_DELETED` (`school_id`, `actor_id`, `subject_id`) sin nombres ni códigos; un fallo de la base de datos se deja pasar sin evento; implementar `DeleteSubject`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaSubjectRepository.int.test.ts`): `delete` borra la asignatura y sus filas de `subject_courses`, deja los cursos intactos y no toca otras asignaturas ni sus filas (también una que comparte cursos), con y sin cursos; el nombre y el código quedan libres (se puede crear otra igual); asignatura de otro colegio o inexistente → `false` sin borrar nada; atomicidad con un disparador de prueba que hace fallar el borrado de las filas de `subject_courses`; `DatabaseUnavailable` con la base de datos inalcanzable
- [x] 3.2 Implementar `delete` en `PrismaSubjectRepository` según el diseño (decisión 3: la asignatura `FOR UPDATE` filtrada por colegio y `subject.delete` con la cascada de la base de datos, con `translateDatabaseErrors`)
- [x] 3.3 Tests de integración de concurrencia, varias rondas: dos borrados de la misma asignatura (uno `true` y otro `false`); borrado contra edición de la misma (la edición con éxito o `null`, nunca otro error); borrado contra el borrado de uno de sus cursos (los dos con éxito); sin errores ni interbloqueos

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`subjectsRoute.test.ts`): `DELETE /:id` con `200`, `{ deleted: { id } }` y `no-store`, el `id` y el colegio de la identidad al caso de uso, `403 FORBIDDEN` para un `MEMBER` sin mirar el `id` (también uno que no es UUID) ni llamar al caso de uso, `404` con un `id` que no es UUID, `404` si no está, `401` y `503`
- [x] 4.2 Implementar en `subjectsRouter` la ruta `DELETE /:id` (`requireRole('ADMIN')` antes de `parseSubjectId`) y conectar `DeleteSubject` en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración por HTTP (`subjects.int.test.ts`): borrar con cursos (los cursos siguen, el listado ya no la trae y `GET /api/subjects/{id}` da `404`) y sin cursos, nombre y código libres para otra asignatura, `404` de otro colegio, inexistente, no UUID y ya borrada, edición de una borrada (`404`), `MEMBER` (`403` sin borrar nada, también con un `id` inexistente), `401`, el evento `SUBJECT_DELETED` sin nombres ni códigos y sin evento en el `404`, y dos `DELETE` a la vez (`200` y `404`)

## 5. Frontend: servicio y textos

- [x] 5.1 Tests que fallan (`subjectsService.test.ts`): `delete` (`DELETE` sin cuerpo con el `id` codificado; `deleted` con `{ id }`, `notFound`, `forbidden`, `unauthenticated`, `unavailable` y formas incorrectas); implementar
- [x] 5.2 Añadir a `es.json` y `en.json` los textos del borrado: «Borrar», `aria-label` «Borrar {nombre}», título del diálogo, «Se imparte en: …» y «No se imparte en ningún curso», el recordatorio de inactivar, «Esta acción no se puede deshacer», «Borrar asignatura», «Borrando…», el error del diálogo, el aviso «eliminada» y «Esa asignatura ya no existe»

## 6. Frontend: diálogo y listado

- [x] 6.1 Tests que fallan (`DeleteSubjectModal.test.tsx`): título, cursos y «ningún curso», el recordatorio de inactivar (sin ningún botón extra), «no se puede deshacer», foco inicial en «Cancelar», sin «X», no pide nada al abrirse, cancelar y Escape, una sola petición con doble pulsación, «Borrando…» con los botones deshabilitados y sin cerrarse con Escape mientras borra, `404` → `onGone`, fallo (también un `403`) con `role="alert"` y reintento, `onDeleted`, `axe`; implementar `components/DeleteSubjectModal.tsx`
- [x] 6.2 Tests que fallan (`SubjectsPage.test.tsx`): «Borrar {nombre}» solo para `ADMIN`; al confirmar, la tarjeta desaparece sin volver a pedir la lista y los filtros y la búsqueda siguen, aviso «eliminada» en un `role="status"` con prioridad sobre el de llegada; «No hay asignaturas que coincidan» si era la única visible; estado vacío al borrar la última; `onGone` con aviso y recarga; `axe` con el diálogo abierto; implementar en `pages/SubjectsPage.tsx` (incluido el foco al `h1` un turno después de `onExited`)

## 7. Revisar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests de `SubjectsPage`, `subjectsService`, `api/schema.test.ts`, el repositorio, los casos de uso y la ruta de asignaturas y `subjects.cy.ts` (incluido el `cy.intercept` del `404` de la edición, que pasa a ser un borrado real), y actualizarlos conservando lo que comprobaban

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidos `subjects` y `subject_courses`), vaciando antes los restos de ejecuciones sueltas en `test_<n>`
- [x] 8.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), guardando el log y leyendo el código de salida del propio comando (nunca tras una tubería) y comprobando que no hay errores «Unhandled»
- [x] 8.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 8.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 8.5 Documentar el resultado en `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: borrar con cursos (`200`, `no-store`, `{ deleted: { id } }`, los cursos siguen, el listado y `GET /{id}` ya no la traen, nombre y código libres) y sin cursos; `404` de otro colegio, inexistente, no UUID y ya borrada (también al editarla); `403` de un `MEMBER` real (creado con una invitación), también con un `id` inexistente; `401` sin token; concurrencia varias rondas (dos borrados a la vez, borrado contra edición de la misma y contra el borrado de uno de sus cursos); y que el log no contiene nombres ni códigos
- [x] 9.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ampliar `cypress/e2e/subjects.cy.ts` con el borrado: el diálogo con los cursos, el recordatorio de inactivar y el foco en «Cancelar»; cancelar (el foco vuelve a «Borrar»); confirmar una asignatura con cursos (aviso, foco en el título y que los cursos siguen existiendo en `/cursos`); que el nombre y el código quedan libres (crear otra igual); borrar la única visible con un filtro puesto («No hay asignaturas que coincidan») y la última (estado vacío); sustituir el `cy.intercept` del `404` de la edición por un borrado real por la API mientras se edita; un `MEMBER` sin «Borrar»; el diálogo a 360 px sin desplazamiento horizontal (cada `cy.intercept` registrado una sola vez)
- [x] 10.2 Ejecutar en modo headless `subjects.cy.ts` y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` solo si surge un patrón nuevo (el borrado de un registro cuyos hijos caen por cascada bloqueando solo el padre, y el diálogo que recuerda una alternativa con un texto)
- [x] 11.2 Actualizar `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (módulo 3, endpoints y árbol), `docs/Modelo_de_Datos/MODELO_DATOS.md` (el borrado y sus efectos), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y el resumen de épicas de `docs/User_Stories_MVP.md`
- [x] 11.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.4 Verificar con `openspec validate us-subject-c-borrar-asignaturas --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [x] 12.1 Repetir `npm run lint`, `typecheck` y `api:types:check` con su código de salida, abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático, que no hay migraciones pendientes y el smoke test
- [x] 12.2 Comprobar en producción con `curl` que `/asignaturas` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `DELETE /api/subjects/{id}` sin token responde `401` (sin borrar datos), y que la persona usuaria, con un navegador real, borra una asignatura con cursos y otra sin cursos, cancela y la ve como `MEMBER` sin «Borrar», en escritorio y en el móvil, sin violaciones de CSP
- [x] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
