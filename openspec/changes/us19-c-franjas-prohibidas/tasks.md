## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us19-c-franjas-prohibidas` desde `main` actualizada (`c9ea1f6`, con US19_b archivada), con los artefactos de este cambio y las correcciones de la ficha de US19_c en `docs/User_Stories_MVP.md` (`forbiddenSlots` y `sessionGroups` en la carga, `maxPerDay` y `blockSize` en `SubjectSlotRule`, los periodos con `CalendarPeriod`, CA5 y CA6)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha corregida y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml`:
  - Las operaciones `getForbiddenSlots` y `updateForbiddenSlots`, con sus respuestas.
  - `SlotCell`, `SubjectSlotRule`, `SubjectSlotRuleResponse` y `UpdateSubjectSlotsRequest`.
  - `COURSE_HAS_NO_CALENDAR` en `ErrorCode`.
  - `SLOTS_OUTSIDE_CALENDAR` en `WorkloadWarningCode`, y `count` en `WorkloadWarning`.
  - `forbiddenSlots` en `CourseWorkloadSubject` y `sessionGroups` en `CourseWorkload.calendar`.
  - La descripción del `PATCH` de la carga (no toca las franjas).
- [x] 1.2 Fijar en `api/schema.test.ts` las operaciones y los esquemas nuevos y ampliados (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)
- [x] 1.3 Añadir `COURSE_HAS_NO_CALENDAR` a `ERROR_CODES` de `appError.ts` y comprobar que `appError.test.ts` pasa

## 2. Base de datos

- [x] 2.1 Test de esquema que falla (`schedulingConstraintSlotsSchema.int.test.ts`):
  - Los dos `CHECK` por su nombre en `pg_constraint`, la clave primaria de tres columnas y la clave ajena con `ON DELETE CASCADE`.
  - Inserciones rechazadas: día 0 y 6, sesión 0 y 9, celda repetida y regla que no existe.
  - Cascadas desde la regla, la pareja, la asignatura y el curso.
  - `MAX_SESSIONS` del calendario es 8.
- [x] 2.2 Añadir `SchedulingConstraintSlot` a `backend/prisma/schema.prisma` (relación con `SchedulingConstraint`, `onDelete: Cascade`, `@@id`), con comentarios `///` en castellano
- [x] 2.3 Generar la migración `add_scheduling_constraint_slots` con `--create-only`, añadir a mano los dos `CHECK` con su comentario (que el 8 sale de `MAX_SESSIONS`), revisar el SQL, aplicarla (`npm run db:migrate`) y dejar en verde el test 2.1

## 3. Backend: dominio

- [x] 3.1 Crear `test-fixtures/subject-warnings.json` con los casos de los escenarios de `scheduling-constraints` (los de US19_b y los nuevos con franjas, recreos y celdas fuera), cada uno con la regla, `sessionGroups` (o `null`), las celdas y los avisos esperados
- [x] 3.2 Tests que fallan (`workloadWarnings.test.ts`, recorriendo la tabla) e implementación de `subjectWarnings` día a día (decisión 4 del diseño): tramos, celdas dentro y fuera del calendario y búsqueda sobre los 32 subconjuntos de días. Los tests de US19_b siguen en verde.
- [x] 3.3 Tipos del dominio: `SlotCell`, `WorkloadCalendar.sessionGroups`, `WorkloadSubject.forbiddenSlots` y las celdas fuera; el aviso `SLOTS_OUTSIDE_CALENDAR` con `count`
- [x] 3.4 Puerto `SubjectSlotsRepository` y errores (`SubjectCourseNotFound`, `CourseHasNoCalendar`, `SlotsOutOfCalendar` con las posiciones), con su JSDoc

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan (`updateSubjectSlotsRequest.test.ts`) e implementación del parser:
  - `slots` ausente, que no es lista o con más de 40 elementos.
  - Celdas que no son objeto, con campos ausentes o no enteros, y fuera de 1..5 y 1..8.
  - `DUPLICATE` desde la segunda aparición.
  - Errores en orden, sin detenerse en el primero; propiedades desconocidas ignoradas.
- [x] 4.2 Tests que fallan e implementación de `GetForbiddenSlots` (`404` sin pareja; avisos con la regla, el calendario y las celdas)
- [x] 4.3 Tests que fallan e implementación de `UpdateForbiddenSlots`:
  - Validación sin tocar el repositorio.
  - `404` y `409` con `SUBJECT_SLOTS_UPDATE_REJECTED` (`not_found`, `no_calendar`).
  - `400 OUT_OF_RANGE` en `slots[<i>].sessionNumber` desde `SlotsOutOfCalendar`.
  - `SUBJECT_SLOTS_UPDATED` con `slot_count` solo si algo cambió, sin nombres.
- [x] 4.4 Actualizar `buildCourseWorkload` y sus tests: los avisos de cada asignatura con sus franjas y `SLOTS_OUTSIDE_CALENDAR`

## 5. Backend: infraestructura

- [x] 5.1 Tests de integración que fallan para la carga (`prismaCourseWorkloadRepository.int.test.ts`):
  - `sessionGroups` con recreos en distintas posiciones.
  - `forbiddenSlots` dentro del calendario y las celdas fuera.
  - `[]` sin calendario o sin regla.
  - El `PATCH` que quita una asignatura cuenta su regla de franjas.
- [x] 5.2 Implementar la lectura de celdas y tramos en `PrismaCourseWorkloadRepository`
- [x] 5.3 Tests de integración que fallan (`prismaSubjectSlotsRepository.int.test.ts`):
  - Lectura: pareja, regla, celdas dentro y fuera, `404` sin pareja o de otro colegio.
  - Escritura: crear la regla, reemplazar celdas, vaciar y borrar la regla, quitar las celdas fuera, no escribir si nada cambia, `school_id` de la identidad.
  - Errores: sin calendario y sesiones fuera del calendario actual, sin cambiar nada.
  - Atomicidad con un disparador sobre `scheduling_constraint_slots`.
- [x] 5.4 Implementar `PrismaSubjectSlotsRepository` (decisión 7 del diseño: asignatura `FOR UPDATE` → curso `FOR SHARE` → pareja → calendario sin bloquear → regla y celdas) y cablearlo en `composeApp.ts`
- [x] 5.5 Tests de integración de concurrencia, varias rondas, sin `500` ni interbloqueos y sin celdas sin regla ni reglas sin pareja al terminar:
  - Dos `PUT` distintos de la misma asignatura.
  - Un `PUT` contra la edición de la asignatura que quita el curso.
  - Contra el `PATCH` de la carga que la quita.
  - Contra el borrado del curso.

## 6. Backend: presentación

- [x] 6.1 Tests que fallan (`slotsRoute.test.ts`) e implementación de `slotsRouter`:
  - Montado bajo `/api/courses/:courseId/subjects/:subjectId` antes de `/courses`.
  - `requireRole('ADMIN')` antes de los `id` en el `PUT`.
  - `404` con ids que no son UUID.
  - `409 COURSE_HAS_NO_CALENDAR` traducido en `errorHandler`.
  - `no-store`.
  - Dobles en `test/support/appDoubles.ts`.
- [x] 6.2 Tests de integración por HTTP (`slots.int.test.ts`) y ampliación de `workload.int.test.ts`:
  - Leer y guardar, vaciar y las celdas fuera del calendario.
  - `400`, `404`, `409`, `403` de un `MEMBER` y `401`.
  - Las franjas y los tramos en la carga; las cascadas por HTTP.
  - Los eventos sin nombres.

## 7. Frontend: servicios y textos

- [x] 7.1 Tests que fallan e implementación:
  - `slotsService` (`get` y `update`): los estados `loaded`, `updated`, `validationError`, `notFound`, `noCalendar`, `forbidden`, `unauthenticated` y `unavailable`; formas incorrectas; el `id` codificado.
  - `courseWorkloadService`: `forbiddenSlots`, `sessionGroups`, el aviso nuevo con `count` y las formas incorrectas.
- [x] 7.2 Añadir a `es.json` y `en.json`:
  - Los textos de la página y de `SlotGrid`: días, sesiones, recreo, «Prohibida», cabeceras y nombres accesibles.
  - Los avisos `SUBJECT_DOES_NOT_FIT` y `SLOTS_OUTSIDE_CALENDAR`.
  - Los enlaces de la matriz y el texto sin calendario.
  - Los errores `404`, `409` y del calendario cambiado.

## 8. Frontend: componentes y páginas

- [x] 8.1 Tests que fallan (`courseWorkloadDraft.test.ts`, recorriendo `test-fixtures/subject-warnings.json`) e implementación de `subjectWarnings` día a día en el frontend; `draftBalance` usa los `forbiddenSlots` de cada asignatura
- [x] 8.2 Tests que fallan (`SlotGrid.test.tsx`) e implementación de `components/SlotGrid.tsx`:
  - `caption`, cabeceras de día y de sesión con horas, y el recreo no interactivo.
  - `aria-pressed` y nombres accesibles; cabeceras que marcan y desmarcan.
  - Marcado no solo por color; modo de solo lectura.
  - `axe`.
- [x] 8.3 Tests que fallan (`ForbiddenSlotsPage.test.tsx`) e implementación de `pages/ForbiddenSlotsPage.tsx` y su ruta en `App.tsx`:
  - Carga única con `StrictMode`, «Reintentar» y la vista `404`.
  - «Guardar» solo con cambios, guarda contra el doble envío y aviso de guardado.
  - Avisos recalculados al marcar; celdas fuera del calendario.
  - `409`, `400` del calendario cambiado y `403`.
  - Vista del `MEMBER`; `axe` para los dos roles.
- [x] 8.4 Tests que fallan (`CourseWorkloadPage.test.tsx`) e implementación de los enlaces en la matriz y en la vista del miembro:
  - «Franjas prohibidas (n)» con `aria-label`.
  - Sin enlace y con el texto sin calendario.
  - Avisos de la matriz recalculados con las franjas.
- [x] 8.5 Verificar en `ForbiddenSlotsPage.test.tsx` o en el E2E que la cuadrícula cabe a 360 px (abreviaturas de día y horas en la cabecera de fila) (los píxeles a 360 px, en el E2E de 12.1)

## 9. Revisar los tests existentes (MANDATORY)

- [x] 9.1 Revisar y actualizar, conservando lo que comprobaban, los tests que usan las formas que cambian:
  - Los fixtures de `CourseWorkload`, `WorkloadCalendar` y `WorkloadSubject` en backend y frontend.
  - `workload.int.test.ts`, `api/schema.test.ts` y los E2E `workload.cy.ts` y `subjects.cy.ts`.

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Capturar la línea base de la base de datos: recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidas `scheduling_constraints` y `scheduling_constraint_slots`, vaciando antes los restos de ejecuciones sueltas en `test_<n>`
- [x] 10.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend). Guardar el log, leer el código de salida del propio comando (nunca tras una tubería) y comprobar que no hay errores «Unhandled».
- [x] 10.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 10.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 10.5 Documentar el resultado en `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`:
  - **Lectura:** periodos con el recreo, celdas, `outsideCalendarCount` y avisos.
  - **Escritura:** guardar, repetir sin cambios, vaciar y quitar las celdas fuera tras acortar el calendario.
  - **Validación:** `400` de forma y de sesión fuera del calendario, `404` de una pareja que no existe y `409` sin calendario.
  - **Carga:** `forbiddenSlots`, `sessionGroups` y `SUBJECT_DOES_NOT_FIT` en la carga del curso.
  - **Cascadas:** quitar el curso desde la asignatura y desde la carga, borrar la asignatura y el curso.
  - **Permisos:** `403` de un `MEMBER` real y su `GET` `200`; `401` sin token.
  - **Concurrencia**, varias rondas: dos `PUT` y `PUT` contra borrado del curso.
  - **Log:** `SUBJECT_SLOTS_UPDATED` y `_REJECTED` sin nombres.
- [x] 11.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Crear `cypress/e2e/slots.cy.ts`:
  - Abrir las franjas desde la matriz, con el recreo; marcar días con las cabeceras, guardar y ver «Franjas prohibidas (n)» en la matriz.
  - Vaciar; el aviso de «no cabe».
  - Acortar el calendario por la API, ver el aviso de celdas fuera y guardar para quitarlas.
  - Curso sin calendario, sin enlace; `MEMBER` sin edición.
  - 360 px sin desplazamiento horizontal.
  - Cada `cy.intercept` registrado una sola vez.
- [x] 12.2 Ejecutar en modo headless `slots.cy.ts` y `workload.cy.ts` y después `npm run test:e2e` completo
- [x] 12.3 Verificar y restaurar la base de datos de test
- [x] 12.4 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs` en `docs/backend-standards.md`, solo si el patrón es nuevo: una regla de negocio duplicada en backend y frontend probada con una tabla de casos compartida, y una tabla hija de celdas reemplazada entera
- [x] 13.2 Actualizar la documentación técnica:
  - `backend/CLAUDE.md` (router, orden de bloqueos, código de error) y `frontend/CLAUDE.md` (`SlotGrid`, página, enlaces).
  - `README.md` (módulo, tabla nueva y endpoints).
  - `CLAUDE.md` raíz (estado actual).
  - `docs/Modelo_de_Datos/MODELO_DATOS.md` (la tabla, sus `CHECK` y la cascada).
  - La arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL).
  - `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (HC7 lee `scheduling_constraint_slots`).
  - El resumen de épicas de `docs/User_Stories_MVP.md`.
- [x] 13.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.4 Verificar con `openspec validate us19-c-franjas-prohibidas --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [ ] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check` con su código de salida y abrir la PR con los grupos 0–13. Tras integrarla la persona usuaria, verificar el despliegue automático, que la migración `add_scheduling_constraint_slots` se aplica y el smoke test.
- [ ] 14.2 Comprobar en producción:
  - **Con `curl`:** `/cursos/<id>/carga/<id>/prohibidas` sirve la SPA con la CSP, el bundle contiene los textos nuevos, y `GET` y `PUT` de las franjas sin token responden `401`.
  - **La persona usuaria, con un navegador real,** en escritorio y en el móvil y sin violaciones de CSP:
    - Marca y guarda franjas y ve el número en la matriz.
    - Ve el aviso de «no cabe».
    - Lo ve como `MEMBER` sin poder editar.
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
