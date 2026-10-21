## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us12-editar-profesor` desde `main` actualizada (llevando los artefactos de este cambio y la ficha US12 de `docs/User_Stories_MVP.md`, hoy en `docs/us12-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US12 y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `GET /api/professors/{id}` (`getProfessor`) y `PUT /api/professors/{id}` (`updateProfessor`) con sus respuestas (`200`, `400`, `401`, `404`, `409 PROFESSOR_ALREADY_TUTOR`, `500`, `503`), los esquemas `UpdateProfessorRequest` (con la descripción de los tres estados de `classId`) y `UpdateProfessorResponse` (`professor` y `replacedTutor`)
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las dos operaciones y los esquemas en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend`

## 2. Backend: dominio y aplicación

- [x] 2.1 Añadir el error de dominio `ProfessorNotFound` y los tipos `ProfessorChanges`, `ProfessorUpdate` y `ProfessorName`, y los métodos `findById` y `update` al puerto `ProfessorRepository` (con JSDoc en castellano); ajustar los dobles de los tests existentes para que compilen
- [x] 2.2 Tests que fallan (`updateProfessorRequest.test.ts`): reglas de nombre y apellidos compartidas (recorriendo `professor-fields.json`), `position` ausente y `null` son `null`, `classId` ausente es «no tocar», `null` es «sin clase» y un UUID se acepta, `classId` mal formado es `INVALID_FORMAT`, el orden de los errores es `firstName`, `lastName`, `position`, `classId`
- [x] 2.3 Implementar `parseUpdateProfessorRequest` reutilizando los esquemas de `createProfessorRequest.ts`
- [x] 2.4 Tests que fallan (`getProfessor.test.ts` y `updateProfessor.test.ts`): `GetProfessor` devuelve el profesor o lanza `ProfessorNotFound`; `UpdateProfessor` valida, pasa los cambios al repositorio, traduce `null` a `ProfessorNotFound` y `ClassNotFound` a un `400` en `classId`, devuelve `{ professor, replacedTutor }`, registra `PROFESSOR_UPDATED` con `changed_fields`, `tutor_changed` y `replaced_tutor` solo si hay cambios, y `PROFESSOR_UPDATE_REJECTED` con `reason: not_found | class_not_found`, nunca nombres
- [x] 2.5 Implementar `GetProfessor` y `UpdateProfessor` en `application/professors/`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaProfessorRepository.int.test.ts`): `findById` del colegio, de otro colegio e inexistente; `update` de nombre y cargo sin tocar la clase (`classId` ausente); a una clase libre (la anterior queda libre); `classId: null`; la misma clase (sin cambios en la tutoría); tomar la clase de otro profesor (`replacedTutor` y el otro sin clase); clase de otro colegio (`ClassNotFound`, nada cambia); profesor de otro colegio (`null`, nada cambia); `before` y `after` correctos; atomicidad con un disparador temporal que hace fallar la asignación
- [x] 3.2 Implementar `findById` y `update` en `PrismaProfessorRepository` según el diseño (decisión 4): bloqueo de la fila del profesor y de la clase destino con `$queryRaw`, actualización del profesor, liberación de su clase y asignación de la nueva, y traducción de `classes_tutor_id_key` a `ProfessorAlreadyTutor`
- [x] 3.3 Tests de integración de concurrencia: dos ediciones de profesores distintos que piden a la vez la misma clase (un solo tutor, el del último guardado, sin `500`) y dos ediciones cruzadas (Ana pide la clase de Luis y Luis la de Ana) que no dejan nada a medias; si aparece un interbloqueo, decidir y documentar a qué código se traduce (actualizando antes la spec y el contrato si cambia)

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`professorsRoute.test.ts`): `GET /:id` y `PUT /:id` con `200`, `400`, `404` (también `id` no UUID), `401`; `Cache-Control: no-store` en la lectura; `errorHandler` traduce `ProfessorNotFound` a `404 NOT_FOUND`
- [x] 4.2 Implementar las rutas en `professorsRouter` con `parseProfessorId`, la traducción en `errorHandler` y el cableado en la raíz de composición (`createApp`)
- [x] 4.3 Tests HTTP de integración (`professors.int.test.ts`): lectura y edición con la base real, aislamiento por colegio, movimiento de tutoría visible en `GET /api/courses` y `GET /api/professors`, sin sesión `401`, base caída `503`

## 5. Frontend: servicio y validación

- [x] 5.1 Tests que fallan (`professorsService.test.ts`): `get` (`loaded`, `notFound`, `unauthenticated`, `unavailable`, codifica el id) y `update` (`updated` con `replacedTutor`, `validationError`, `notFound`, `unauthenticated`, `unavailable`; un `409` es `unavailable`; envía `classId` solo si se indica), ninguno lanza
- [x] 5.2 Implementar `professorsService.get` y `update`
- [x] 5.3 Tests que fallan y implementación de `hasProfessorChanges` en `validation/professorValidation.ts` (nombres limpios, cargo, clase; deshacer no es cambio)

## 6. Frontend: formulario compartido, página de edición y listado

- [x] 6.1 Extraer `components/ProfessorForm.tsx` de `CreateProfessorPage` (modo `free` de la creación) sin cambiar su comportamiento: los tests de `CreateProfessorPage` deben pasar sin modificarse
- [x] 6.2 Añadir a `es.json` y `en.json` los textos de la edición (`professors.edit.*`, `professors.updated`, `professors.updatedReplacing`, `professors.actions`, `professors.editLink`, el aviso de desplazamiento y «· tutor: …»)
- [x] 6.3 Tests que fallan (`ProfessorForm.test.tsx`) del modo `any`: precarga, todas las clases agrupadas con «· tutor: …», el aviso ligado por `aria-describedby` al elegir una de otro tutor, «Guardar» solo con cambios, cursos no disponibles (campo desactivado y sin `classId`), `axe`; implementar el modo en `ProfessorForm`
- [x] 6.4 Tests que fallan (`EditProfessorPage.test.tsx`): carga única con `StrictMode`, cargando, no disponible con enlace, error con «Reintentar», guardar y volver con el aviso (y el tutor desplazado), `404` al guardar, `400` en los campos, error general conservando lo escrito, «Cancelar», `axe` y 360 px
- [x] 6.5 Implementar `pages/EditProfessorPage.tsx` y la ruta `/profesores/:id/editar` en `App.tsx`
- [x] 6.6 Tests que fallan y implementación en `ProfessorsPage`: columna «Acciones» con «Editar» por fila y por tarjeta (`aria-label` «Editar {Apellido, Nombre}»), el aviso de profesor actualizado (con el tutor desplazado) leído con una guarda de tipo, `axe`

## 7. Revisar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests de `ProfessorsPage` (columnas, «does not offer actions of future stories», enlaces), `CreateProfessorPage`, `App.test.tsx` y los dobles de `ProfessorRepository`, y `professors.cy.ts` (columnas de la tabla), y actualizarlos conservando lo que comprobaban

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 8.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 8.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 8.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 8.5 Documentar el resultado en `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend local y crear por la API dos colegios, cursos con clases y profesores (uno sin clase, dos con clase)
- [x] 9.2 Probar con `curl` `GET /api/professors/{id}` (`200`, otro colegio `404`, inexistente `404`, `abc` `404`, sin token `401`) y `PUT /api/professors/{id}`: nombre y cargo; `classId` ausente no toca la tutoría; a una clase libre; `classId: null`; tomar la clase de otro profesor (`replacedTutor`); clase de otro colegio (`400 NOT_FOUND`); validación (`400` por campo); profesor de otro colegio (`404`); dos `PUT` simultáneos a la misma clase; y comprobar el resultado en `GET /api/courses` y `GET /api/professors`
- [x] 9.3 Comprobar los eventos `PROFESSOR_UPDATED` y `PROFESSOR_UPDATE_REJECTED` en el log, sin nombres
- [x] 9.4 Borrar los datos creados, comprobar que la base de datos coincide con la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.5 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Añadir a `professors.cy.ts` los casos de la edición: desde «Editar», cambiar nombre y cargo y volver con el aviso; cambiar a una clase libre; quitar la tutoría; tomar la clase de otro profesor con el aviso previo y el posterior, y comprobarlo en el listado y en `/cursos`; un `id` inexistente; la edición a 360 px sin desplazamiento horizontal
- [x] 10.2 Ejecutar en modo headless `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (mover una relación 1:1 quitándosela a otro registro en una transacción, con el orden de bloqueos y escrituras) y `docs/frontend-standards.md` (un formulario compartido extraído al llegar la edición; una opción que desplaza a otro registro, con aviso previo y posterior)
- [x] 11.2 Actualizar `backend/CLAUDE.md` y `frontend/CLAUDE.md`, el `CLAUDE.md` raíz (estado), `README.md` (árbol), `MODELO_DATOS.md` (cómo se escribe `classes.tutor_id` desde la edición del profesor) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: endpoints, componentes y flujo)
- [x] 11.3 Añadir a las fichas de US13 y `US-PROF-ASSIGN` en `docs/User_Stories_MVP.md` las notas de lo que heredan de US12 (la página de edición y su formulario, `ProfessorNotFound`, la columna «Acciones» donde va «Borrar», y dónde irían las asignaturas en el formulario)
- [x] 11.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 11.5 Verificar con `openspec validate us12-editar-profesor --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [ ] 12.1 Abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático (sin migraciones pendientes) y su smoke test
- [ ] 12.2 Comprobar en producción con `curl` que `/profesores/<id>/editar` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `PUT /api/professors/<id>` sin token responden `401`, y que la persona usuaria, con un navegador real, edita nombre y cargo, cambia y quita la tutoría y toma la clase de otro profesor, en escritorio y en el móvil, sin violaciones de CSP
- [ ] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
