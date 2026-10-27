## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-subject-b-editar-asignaturas` desde `main` actualizada, llevando el commit de la ficha de US-SUBJECT_b (`docs/User_Stories_MVP.md`) y los artefactos de este cambio (sin el fichero de bloqueo `docs/prompts/~$rarios.docx`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio y `.claude/settings.json` en Sonnet con esfuerzo medio

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `getSubject` (`GET /api/subjects/{id}`, Bearer, `ADMIN` y `MEMBER`: `200`, `401`, `404`, `500`, `503`) y `updateSubject` (`PUT /api/subjects/{id}`, Bearer, solo `ADMIN`: `200`, `400`, `401`, `403`, `404`, `409` con los dos códigos, `500`, `503`), con `Cache-Control: no-store`, el esquema `UpdateSubjectRequest` y la respuesta reutilizable `SubjectNotFound` (`NOT_FOUND`)
- [x] 1.2 Fijar en `api/schema.test.ts` las dos operaciones y `UpdateSubjectRequest` (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Backend: dominio y aplicación

- [x] 2.1 Dominio: `SubjectNotFound` en `domain/subject/subjectErrors.ts` y el puerto `SubjectRepository` con `findById` y `update` (`SubjectChanges`; devuelve `{ before, after }` o `null`)
- [x] 2.2 Tests que fallan y luego implementación de `subjectChanges(before, after)` en `domain/subject/` (`changed_fields` de cada campo, también solo mayúsculas del nombre o del código; `courses` por conjunto de `(curso, sesiones)` sin depender del orden; `courses_added`, `courses_removed` y `courses_changed`; lista vacía si nada cambia)
- [x] 2.3 Tests que fallan y luego implementación de `parseUpdateSubjectRequest` (delega en `parseCreateSubjectRequest`; recorre `test-fixtures/subject-fields.json` con el mismo resultado que el alta)
- [x] 2.4 Tests que fallan y luego implementación de `GetSubject` (`null` → `SubjectNotFound`; cursos ordenados con `byName`)
- [x] 2.5 Tests que fallan (`updateSubject.test.ts`): `400` sin llamar al repositorio ni registrar nada; `null` → `SubjectNotFound` con `SUBJECT_UPDATE_REJECTED` (`not_found`); `SubjectCoursesNotFound` → `400` con `courses[<i>].courseId` `NOT_FOUND` (`course_not_found`); `SubjectAlreadyExists` y `SubjectCodeAlreadyExists` → sus `409` (`duplicate_name`, `duplicate_code`); `SUBJECT_UPDATED` con `changed_fields` y los tres recuentos (también vacío con un `PUT` sin cambios), sin nombres, códigos ni descripciones; cursos de la respuesta ordenados con `byName`; implementar `UpdateSubject`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaSubjectRepository.int.test.ts`): `findById` (del colegio, de otro colegio e inexistente); `update` que renombra, recodifica, cambia solo mayúsculas del propio nombre y del propio código, quita el código (y otra asignatura puede usarlo después), inactiva y reactiva, cambia color y descripción; cursos con sesiones cambiadas, añadidos y quitados; asignatura sin cursos a la que se añade uno; curso inexistente o de otro colegio → `SubjectCoursesNotFound` sin cambiar nada; asignatura inexistente o de otro colegio → `null` sin cambiar nada; nombre y código de otra → `SubjectAlreadyExists` y `SubjectCodeAlreadyExists`; atomicidad con un disparador de prueba que hace fallar la inserción en `subject_courses`
- [x] 3.2 Implementar `findById` y `update` en `PrismaSubjectRepository` según el diseño (decisión 3: asignatura `FOR UPDATE`, unión de cursos pedidos y actuales `FOR SHARE` en orden de `id`, lectura de `before`, campos, `subject_courses` reemplazada y relectura, con `translateDatabaseErrors` y `violatedUniqueIndex`)
- [x] 3.3 Tests de integración de concurrencia, varias rondas: dos ediciones de la misma asignatura (las dos con éxito y el estado final igual al de una de ellas, nunca una mezcla); dos asignaturas editadas a la vez hacia el mismo nombre y hacia el mismo código (éxito y su error de dominio); edición contra el borrado de un curso pedido y de uno actual (éxito o `SubjectCoursesNotFound`, nunca otro error); edición contra un alta y contra otra edición con cursos en común; edición contra la edición de un calendario que se lleva uno de sus cursos (sin error ni interbloqueo)

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`subjectsRoute.test.ts`): `GET /:id` con `200` y `no-store` para `ADMIN` y `MEMBER`, `404` con un `id` que no es UUID sin llamar al caso de uso, `401` y `503`; `PUT /:id` con `200` y `no-store`, `403 FORBIDDEN` para un `MEMBER` sin validar el `id` ni el cuerpo ni llamar al caso de uso, `404` con un `id` que no es UUID, `400`, `404`, los dos `409`, `401` y `503`; y en `errorHandler.test.ts`, `SubjectNotFound` → `404 NOT_FOUND`
- [x] 4.2 Implementar en `subjectsRouter` `parseSubjectId` y las rutas `GET /:id` y `PUT /:id` (`requireRole('ADMIN')` solo en el `PUT`), traducir `SubjectNotFound` en `errorHandler` y conectar los casos de uso en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración por HTTP (`subjects.int.test.ts`): leer (cursos en orden natural) y editar (campos, inactivar, cursos cambiados, añadidos y quitados, cursos de la respuesta en orden natural), `PUT` idéntico con `200`, `MEMBER` (`200` al leer y `403` al editar sin cambiar nada, también con un `id` inexistente), `404` de otro colegio al leer y al editar, los dos `409`, `400`, `401`, y eventos `SUBJECT_UPDATED` y `SUBJECT_UPDATE_REJECTED` sin nombres, códigos ni descripciones

## 5. Frontend: servicio y validación

- [x] 5.1 Tests que fallan (`subjectsService.test.ts`): `get` (`loaded`, `notFound`, `unauthenticated`, `unavailable` y forma incorrecta) y `update` (`updated`, `validationError`, `alreadyExists`, `codeAlreadyExists`, `notFound`, `forbidden`, `unauthenticated` y `unavailable`), con el `id` codificado; implementar
- [x] 5.2 Tests que fallan y luego implementación de `subjectDraftFrom` y `hasSubjectChanges` en `validation/subjectValidation.ts` (`null` a `''`; compara lo que se enviaría: nombre limpio, código y descripción recortados con vacío igual a `null`, tipo, estado, color y el conjunto de cursos con sus sesiones sin depender del orden; un espacio de más o deshacer un cambio no cuentan)
- [x] 5.3 Añadir a `es.json` y `en.json` los textos de la edición: título, «Editar» y su `aria-label`, aviso «Asignatura «X» actualizada», «Esta asignatura no tiene cursos: marca al menos uno para guardarla», «Esta asignatura no existe o ya no está disponible» con el enlace a «Asignaturas», «Solo los administradores pueden modificar asignaturas» y el aviso general de la edición

## 6. Frontend: formulario, páginas y rutas

- [x] 6.1 Tests que fallan (`SubjectForm.test.tsx`, modo edición): precarga de `initialValues` (todos los campos, el color seleccionado y los cursos marcados con sus sesiones) con «Guardar» deshabilitado; «Guardar» solo con cambios reales y otra vez deshabilitado al deshacerlos; volver a marcar un curso que ya tenía recupera sus sesiones y uno nuevo empieza en 2; aviso de asignatura sin cursos ligado por `aria-describedby` y «Marca al menos un curso» al guardar; el envío lleva el estado final; `axe`; el alta sin `requireChanges` no cambia. Implementar la prop `requireChanges`, las sesiones originales y el aviso
- [x] 6.2 Tests que fallan (`EditSubjectPage.test.tsx`): carga única de la asignatura y de los cursos con `StrictMode` y sin formulario hasta tener los dos; carga, «no existe o ya no está disponible» con el enlace (`404` al cargar y al guardar, `id` que no es UUID), error con «Reintentar»; `200` que navega a `/asignaturas` con `replace` y `{ subjectUpdated }`; los dos `409` en su campo; `400` de `courses[<i>].courseId` que recarga los cursos conservando lo escrito; `403` y fallo general; implementar `pages/EditSubjectPage.tsx`
- [x] 6.3 Tests que fallan (`SubjectsPage.test.tsx`): enlace «Editar {nombre}» hacia `/asignaturas/<id>/editar` solo para `ADMIN`; aviso `subjectUpdated` como texto plano y la guarda de tipo; implementar
- [x] 6.4 Añadir la ruta `/asignaturas/:id/editar` bajo `RequireRole role="ADMIN"` en `App.tsx`, con sus tests (`App.test.tsx`: un `ADMIN` la abre, un `MEMBER` va a `/onboarding`, y `aria-current` de «Asignaturas» en la subruta)

## 7. Revisar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests de `SubjectForm`, `CreateSubjectPage`, `SubjectsPage`, `App`, `errorHandler`, `api/schema.test.ts`, el repositorio, los casos de uso y la ruta de asignaturas y `subjects.cy.ts`, y actualizarlos conservando lo que comprobaban

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidos `subjects` y `subject_courses`)
- [x] 8.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), guardando el log y leyendo el código de salida del propio comando (nunca tras una tubería) y comprobando que no hay errores «Unhandled»
- [x] 8.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 8.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 8.5 Documentar el resultado en `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: leer una asignatura (`200`, `no-store`, cursos en orden) y una de otro colegio, inexistente o con `id` mal escrito (`404`); editar (renombrar, recodificar, quitar el código, inactivar y reactivar, color, cursos cambiados, añadidos y quitados) con `200`; `PUT` idéntico; `400` de campos y de cursos (también `courses: []` en una asignatura sin cursos); los dos `409`; `403` de un `MEMBER` real (creado con una invitación) al editar, también con un `id` inexistente, y `200` al leer; `401` sin token; dos ediciones simultáneas de la misma asignatura (estado de una de ellas, entero) y edición contra borrado de un curso, varias rondas; y que el log no contiene nombres ni códigos
- [x] 9.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ampliar `cypress/e2e/subjects.cy.ts` con la edición: «Guardar» deshabilitado al abrir; renombrar y ver el aviso; inactivar y verla con el filtro «Inactiva»; cambiar las sesiones de un curso, añadir uno y quitar otro y verlo en el desplegable; nombre y código de otra asignatura; una asignatura sin cursos (tras borrar su curso) que exige marcar uno; asignatura que no existe al abrir la edición (un UUID inexistente y un id mal escrito, con el `404` real del backend) y asignatura que desaparece mientras se edita (un `cy.intercept` del `PUT` con `404`, porque aún no hay borrado de asignaturas); un `MEMBER` sin «Editar» al que `/asignaturas/<id>/editar` lleva a `/onboarding`; la edición a 360 px sin desplazamiento horizontal (cada `cy.intercept` registrado una sola vez)
- [x] 10.2 Ejecutar en modo headless `subjects.cy.ts` y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` solo si surge un patrón nuevo (reemplazar los hijos bajo el bloqueo del padre y la unión de hijos en orden ya están de US-BASE_b; posible: hijos bloqueados `FOR SHARE` en la edición, y recuperar el valor original de un hijo al volver a marcarlo)
- [x] 11.2 Actualizar `backend/CLAUDE.md` (bloqueos de la edición de asignaturas y `SUBJECT_UPDATED`), `frontend/CLAUDE.md`, `README.md` (endpoints y árbol), `docs/Modelo_de_Datos/MODELO_DATOS.md` (la edición reemplaza `subject_courses`), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: edición en la tabla de lo construido, router, casos de uso y páginas) y el resumen de épicas de `docs/User_Stories_MVP.md`
- [x] 11.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.4 Verificar con `openspec validate us-subject-b-editar-asignaturas --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [ ] 12.1 Abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático, que no hay migraciones pendientes y el smoke test
- [ ] 12.2 Comprobar en producción con `curl` que `/asignaturas/<id>/editar` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `PUT /api/subjects/{id}` sin token responden `401` (sin crear datos), y que la persona usuaria, con un navegador real, edita una asignatura (campos, estado y cursos) y la ve como `MEMBER` sin «Editar», en escritorio y en el móvil, sin violaciones de CSP
- [ ] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
