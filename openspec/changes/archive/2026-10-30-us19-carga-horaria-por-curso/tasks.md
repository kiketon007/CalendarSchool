## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us19-carga-horaria-por-curso` desde `main` actualizada (que ya lleva la ficha enriquecida de US19), con los artefactos de este cambio y sin el fichero de bloqueo `docs/prompts/~$rarios.docx`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio y `.claude/settings.json` en Sonnet con esfuerzo medio

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `getCourseWorkload` (`GET /api/courses/{id}/workload`, Bearer, los dos roles: `200` con `CourseWorkloadResponse` y `no-store`, `401`, `404` con `CourseNotFound`, `500`, `503`) y `updateCourseWorkload` (`PATCH`, solo `ADMIN`, solo las filas que cambian: `200`, `400`, `401`, `403`, `404`, `500`, `503`), con los esquemas `WorkloadWarningCode`, `WorkloadWarning`, `CourseWorkloadSubject`, `CourseWorkload`, `CourseWorkloadResponse` y `UpdateCourseWorkloadRequest`
- [x] 1.2 Fijar en `api/schema.test.ts` las dos operaciones y los esquemas (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Backend: dominio

- [x] 2.1 Tests que fallan (`domain/workload/workloadWarnings.test.ts`): sin calendario → solo `COURSE_WITHOUT_CALENDAR`; en el límite → ninguno; por encima → `WORKLOAD_EXCEEDS_SLOTS` con `assigned` y `available`; con 0 asignadas → ninguno; implementar `workloadWarnings` (pura)
- [x] 2.2 Dominio: tipos `CourseWorkload` y `CourseWorkloadChange`, y el puerto `CourseWorkloadRepository` con `findByCourse(schoolId, courseId)` (la carga o `null`) y `applyChanges(schoolId, courseId, changes)` (resultado con los recuentos `added`/`removed`/`changed`, o `courseNotFound`, o `subjectsNotFound` con los índices)

## 3. Backend: aplicación

- [x] 3.1 Tests que fallan (`updateCourseWorkloadRequest.test.ts`): cuerpo que no es objeto, `changes` ausente, no lista, vacía o con más de 200 (`REQUIRED`, `INVALID_FORMAT`, `INVALID_LENGTH` en `changes`); `subjectId` ausente o no UUID; `sessionsPerWeek` ausente, no entero, 0 o 6 (`REQUIRED`, `INVALID_FORMAT`, `OUT_OF_RANGE`) y `null` válido; repetidas (`DUPLICATE` desde la segunda); orden de los errores por índice; implementar el parser
- [x] 3.2 Tests que fallan (`getCourseWorkload.test.ts`, `updateCourseWorkload.test.ts`): `null` → `CourseNotFound`; la carga lleva los avisos de `workloadWarnings`; el `PATCH` devuelve la carga releída; `courseNotFound` → `CourseNotFound` con `COURSE_WORKLOAD_UPDATE_REJECTED` (`not_found`); `subjectsNotFound` → `ValidationError` con `NOT_FOUND` en `changes[<i>].subjectId` y el evento (`subject_not_found`); éxito con cambios → `COURSE_WORKLOAD_UPDATED` con los recuentos y sin nombres; sin cambios reales → sin evento; implementar `GetCourseWorkload` y `UpdateCourseWorkload`

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan (`prismaCourseWorkloadRepository.int.test.ts`) para `findByCourse`: con calendario (`sessionsPerDay` cuenta solo los periodos `SESSION`), sin calendario, todas las asignaturas del colegio con `sessionsPerWeek` o `null`, inactivas incluidas, sin asignaturas de otro colegio, curso de otro colegio o inexistente → `null`, `DatabaseUnavailable`
- [x] 4.2 Tests de integración que fallan para `applyChanges`: crear, actualizar y borrar filas; las demás filas sin tocar y `created_at` conservado al actualizar; `null` sobre una fila inexistente sin error; recuentos correctos (y cero si nada cambia); asignatura de otro colegio o inexistente → `subjectsNotFound` sin escribir nada; curso de otro colegio, inexistente o borrado → `courseNotFound`; atomicidad con un disparador de prueba sobre `subject_courses`
- [x] 4.3 Implementar `PrismaCourseWorkloadRepository` según el diseño (decisiones 3, 4 y 6: asignaturas `FOR UPDATE` en orden de `id`, curso `FOR SHARE`, *upsert* o `DELETE` por fila, lectura en una consulta con `LEFT JOIN` y el recuento de sesiones del calendario, `translateDatabaseErrors`)
- [x] 4.4 Tests de integración de concurrencia, varias rondas: dos `applyChanges` del mismo curso sobre asignaturas distintas (se conservan los dos) y sobre la misma (queda el último); `applyChanges` contra la edición de la misma asignatura (`PrismaSubjectRepository.update`), contra el borrado del curso (`courseNotFound` o éxito) y contra la edición de su calendario; sin errores ni interbloqueos

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`workloadRoute.test.ts`): `GET` para los dos roles con `200` y `no-store`; `PATCH` con `200`, el `id`, el colegio y el actor de la identidad al caso de uso; `403 FORBIDDEN` para un `MEMBER` sin mirar el `id` ni el cuerpo (también inválidos) ni llamar al caso de uso; `404` con un `id` que no es UUID sin llegar al caso de uso; `400` con los campos; `404`; `401`; `503`; y que `GET /api/courses/{id}` sigue llegando a `coursesRouter`
- [x] 5.2 Implementar `presentation/workload/workloadRouter.ts` (`mergeParams`, `requireAuthentication`, `requireRole('ADMIN')` solo en el `PATCH`, `parseCourseId`), montarlo antes de `/courses` en `app.ts` y conectar los casos de uso y el repositorio en `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 5.3 Tests de integración por HTTP (`workload.int.test.ts`): leer con y sin calendario; cambiar y verlo en `GET /api/subjects`; carga que no cabe guardada con su aviso; asignatura sin cursos tras quitarla; `400` de validación y de asignatura inexistente sin cambios; `404` de otro colegio, inexistente y no UUID; `MEMBER` (`GET` `200`, `PATCH` `403` sin cambios, también con un `id` inexistente y un cuerpo inválido); `401`; los eventos sin nombres; y dos `PATCH` a la vez sobre asignaturas distintas

## 6. Frontend: servicio y textos

- [x] 6.1 Tests que fallan (`courseWorkloadService.test.ts`): `get` (id codificado; `loaded`, `notFound`, `unauthenticated`, `unavailable` y formas incorrectas) y `update` (`PATCH` con `{ changes }`; `updated`, `validationError` con los campos, `notFound`, `forbidden`, `unauthenticated`, `unavailable`); implementar
- [x] 6.2 Añadir a `es.json` y `en.json` los textos: «Carga horaria» y su `aria-label`, el título, el balance, los dos avisos, «No se imparte», la etiqueta de cada selector, «Inactiva», «Guardar», el aviso de guardado, «Alguna asignatura ya no existe; revisa la carga», la vista de no disponible, el texto de solo administradores, «Todavía no hay asignaturas» con «Crear asignatura» y «Este curso aún no tiene asignaturas», «{asignatura}: {n} sesiones»

## 7. Frontend: componentes y páginas

- [x] 7.1 Tests que fallan (`WorkloadBalance.test.tsx`): texto del balance, barra `aria-hidden` y en color de peligro si se supera, aviso de exceso con el nombre del calendario, aviso sin calendario con el enlace a `/calendarios` y sin balance, avisos en `role="status"`, `axe`; implementar `components/WorkloadBalance.tsx`
- [x] 7.2 Tests que fallan (`CourseWorkloadPage.test.tsx`), modo `ADMIN`: una sola petición con `StrictMode`, carga, error con «Reintentar», `404`; matriz en el orden del servidor con muestra de color, código e «Inactiva»; balance que se recalcula al editar; «Guardar» solo con cambios (y deshabilitado al deshacer); un único `PATCH` con solo las filas cambiadas ante la doble pulsación; aviso de guardado con lo releído; `400` de asignatura → recarga y aviso; `404`; `403`; fallo general conservando lo editado; colegio sin asignaturas; `axe`
- [x] 7.3 Tests que fallan, modo `MEMBER`: balance, lista de las que se imparten con sus sesiones, sin selectores ni «Guardar», texto de solo administradores, «Este curso aún no tiene asignaturas»; `axe`; implementar `pages/CourseWorkloadPage.tsx` y la ruta `/cursos/:id/carga` en `App.tsx` (layout autenticado, sin `RequireRole`, `NavLink` «Cursos» activo)
- [x] 7.4 Tests que fallan (`CoursesPage.test.tsx`): enlace «Carga horaria de {curso}» a `/cursos/<id>/carga` en la tabla y en las tarjetas, para los dos roles; implementar en `pages/CoursesPage.tsx`

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `CoursesPage`, `App` (rutas), `api/schema.test.ts`, el repositorio y la ruta de asignaturas (la carga escribe sus filas), `courses.cy.ts` y `subjects.cy.ts`, y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidos `subjects`, `subject_courses`, `courses` y `calendars`), vaciando antes los restos de ejecuciones sueltas en `test_<n>`
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), guardando el log y leyendo el código de salida del propio comando (nunca tras una tubería) y comprobando que no hay errores «Unhandled»
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: leer con y sin calendario (`200`, `no-store`, balance y avisos); cambiar subiendo, añadiendo y quitando (y verlo en `GET /api/subjects`); carga que no cabe guardada con su aviso; `400` de validación y de asignatura inexistente sin cambios; `404` de otro colegio, inexistente y no UUID; `403` de un `MEMBER` real (creado con una invitación), también con un `id` inexistente, y su `GET` `200`; `401` sin token; concurrencia varias rondas (dos `PATCH` sobre asignaturas distintas y sobre la misma, `PATCH` contra edición de la asignatura y contra borrado del curso); y que el log no contiene nombres ni códigos
- [x] 10.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Crear `cypress/e2e/workload.cy.ts`: abrir «Carga horaria» desde `/cursos`; ajustar la carga (subir, añadir y quitar) y verla en la tarjeta de la asignatura en `/asignaturas`; una carga que no cabe con su aviso y la barra de peligro; un curso sin calendario con el aviso y el enlace; «Guardar» solo con cambios; un `MEMBER` que la ve sin editar; la página a 360 px sin desplazamiento horizontal (cada `cy.intercept` registrado una sola vez)
- [x] 11.2 Ejecutar en modo headless `workload.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (escritura por diferencias con *upsert* bajo el orden de bloqueo de otra pantalla, y avisos calculados al leer en una función pura del dominio) y `docs/frontend-standards.md` (balance como texto con barra decorativa) solo si el patrón es nuevo
- [x] 12.2 Actualizar `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (módulo, endpoints y árbol), `CLAUDE.md` raíz (estado actual), `docs/Modelo_de_Datos/MODELO_DATOS.md` (dos caminos de escritura sobre `subject_courses`), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL), `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (si cambia algo de HC1) y el resumen de épicas de `docs/User_Stories_MVP.md`
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 12.4 Verificar con `openspec validate us19-carga-horaria-por-curso --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Repetir `npm run lint`, `typecheck` y `api:types:check` con su código de salida, abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático, que no hay migraciones pendientes y el smoke test
- [x] 13.2 Comprobar en producción con `curl` que `/cursos/<id>/carga` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `PATCH /api/courses/{id}/workload` sin token responden `401` (sin cambiar datos), y que la persona usuaria, con un navegador real, ajusta la carga de un curso, ve el aviso de una carga que no cabe y de un curso sin calendario, y la ve como `MEMBER` sin poder editar, en escritorio y en el móvil, sin violaciones de CSP
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
