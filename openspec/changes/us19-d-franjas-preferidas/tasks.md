## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us19-d-franjas-preferidas` desde `main` actualizada (`7fbd4e4`, con US19_c archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha corregida y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación
- [x] 0.3 Aplicar a la ficha de US19_d en `docs/User_Stories_MVP.md` las correcciones de la propuesta:
  - `forbiddenSlots` opcional en `SubjectSlotRule`.
  - Una sola página, `SubjectSlotsPage`.
  - `PREFERRED_SLOTS_FORBIDDEN` también en la carga.
  - `SLOTS_OUTSIDE_CALENDAR` sumando las dos reglas.
  - Las cabeceras no marcan celdas prohibidas.
  - `type` en el evento de rechazo.

## 1. Renombrar lo común (sin cambiar comportamiento)

- [x] 1.1 Renombrar los casos de uso con sus tests, el cableado de `composeApp.ts`, `slotsRouter` y `appDoubles.ts`. Los tests existentes siguen en verde:
  - `GetForbiddenSlots` → `GetSubjectSlots`.
  - `UpdateForbiddenSlots` → `UpdateSubjectSlots`.
- [x] 1.2 Renombrar `pages/ForbiddenSlotsPage.tsx` → `pages/SubjectSlotsPage.tsx`, con su test y la ruta de `App.tsx`. Los tests existentes siguen en verde.

## 2. Contrato

- [x] 2.1 Documentar en `docs/api-spec.yml`:
  - Las operaciones `getPreferredSlots` y `updatePreferredSlots`, con sus respuestas y ejemplos.
  - `forbiddenSlots` opcional en `SubjectSlotRule`, con su descripción generalizada.
  - `PREFERRED_SLOTS_FORBIDDEN` en `WorkloadWarningCode`, y la descripción de `count`.
  - `preferredSlotCount` en `CourseWorkloadSubject`.
  - `SLOTS_OUTSIDE_CALENDAR` sumando las dos reglas en la carga.
- [x] 2.2 Fijar en `api/schema.test.ts` las operaciones y los campos nuevos (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 3. Backend: dominio

- [x] 3.1 Crear `test-fixtures/preferred-slots-warnings.json` con los casos del requisito «Aviso de franjas preferidas prohibidas»: con recuento, sin contradicción y sin preferidas
- [x] 3.2 Tests que fallan (`workloadWarnings.test.ts`, recorriendo la tabla nueva) e implementación de `preferredSlotsWarnings` y del aviso `PREFERRED_SLOTS_FORBIDDEN` en `WorkloadWarning`
- [x] 3.3 Tipos del dominio:
  - `SlotRuleType`.
  - `forbiddenCells` en `SubjectSlotsSnapshot`.
  - El tipo en `find` y `replace` del puerto `SubjectSlotsRepository`, con su JSDoc.
  - Las celdas preferidas internas de `WorkloadSubject` y `preferredSlotCount` en `CourseWorkloadSubject`.

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan e implementación de `buildSubjectSlotRule(snapshot, type)`:
  - `subjectWarnings` con las prohibidas.
  - Con `PREFERRED_SLOTS`, `forbiddenSlots` y `preferredSlotsWarnings`.
  - Sin `forbiddenSlots` en las prohibidas.
- [x] 4.2 Tests que fallan e implementación del tipo en `GetSubjectSlots` y `UpdateSubjectSlots`, con los dos tipos (`describe.each`):
  - El tipo llega al repositorio.
  - `SUBJECT_SLOTS_UPDATED` y `SUBJECT_SLOTS_UPDATE_REJECTED` llevan `type`.
  - El mensaje del log es el del tipo.
- [x] 4.3 Actualizar `buildCourseWorkload` y sus tests:
  - `preferredSlotCount`.
  - `PREFERRED_SLOTS_FORBIDDEN`.
  - `SLOTS_OUTSIDE_CALENDAR` con la suma.
  - Las celdas preferidas no salen en la respuesta.

## 5. Backend: infraestructura

- [x] 5.1 Tests de integración que fallan para la carga (`prismaCourseWorkloadRepository.int.test.ts`):
  - Las celdas preferidas dentro y fuera del calendario.
  - Las dos reglas en la misma pareja.
  - El `PATCH` que quita la asignatura cuenta la regla de preferidas.
- [x] 5.2 Implementar la lectura de la regla `PREFERRED_SLOTS` en `PrismaCourseWorkloadRepository`
- [x] 5.3 Tests de integración que fallan (`prismaSubjectSlotsRepository.int.test.ts`), con los dos tipos:
  - **Lectura:** `forbiddenCells` siempre.
  - **Escritura:**
    - crear, reemplazar y vaciar la regla del tipo sin tocar la otra;
    - una preferida prohibida se guarda;
    - no se escribe si nada cambia.
  - **Errores:** sin calendario y sesiones fuera del calendario.
- [x] 5.4 Implementar el tipo en `PrismaSubjectSlotsRepository` (`readSnapshot` y `replace`)
- [x] 5.5 Tests de integración de concurrencia, varias rondas, sin `500` ni interbloqueos y sin celdas sin regla al terminar:
  - un `PUT` de preferidas contra uno de prohibidas sobre la misma asignatura;
  - un `PUT` de preferidas contra quitar el curso desde la carga.
- [x] 5.6 Test de esquema (`schedulingConstraintSlotsSchema.int.test.ts`): las dos reglas de franjas en la misma pareja, con una celda en común, caen al borrar la asignatura

## 6. Backend: presentación

- [x] 6.1 Tests que fallan (`slotsRoute.test.ts`) e implementación de `/preferred-slots` en `slotsRouter`:
  - Cada ruta fija su tipo.
  - `requireRole('ADMIN')` antes de los `id` en el `PUT`.
  - `404` con ids que no son UUID.
  - `no-store`.
- [x] 6.2 Tests de integración por HTTP (`slots.int.test.ts`, con `describe.each` por tipo donde aplique) y ampliación de `workload.int.test.ts`:
  - Leer y guardar las preferidas, con `forbiddenSlots` y el aviso.
  - La preferida prohibida aceptada, con `200`.
  - Las dos reglas independientes.
  - `400`, `404`, `409`, `403` de un `MEMBER` y `401`.
  - `preferredSlotCount` y los avisos en la carga.
  - Los eventos con `type` y sin nombres.

## 7. Frontend: servicios y textos

- [x] 7.1 Tests que fallan e implementación:
  - `slotsService` con el tipo: el segmento de la ruta y `forbiddenSlots` opcional (y con forma incorrecta).
  - `courseWorkloadService`: `preferredSlotCount` y el aviso nuevo con `count`.
- [x] 7.2 Reorganizar y añadir los textos en `es.json` y `en.json`:
  - Por tipo, en `slots.forbidden.*` y `slots.preferred.*`: título, `caption` y guardado.
  - En `SlotGrid`: «Preferida», «Prohibida» en el nombre accesible y «Preferida · prohibida, se ignora».
  - El aviso `PREFERRED_SLOTS_FORBIDDEN_one/_other`.
  - Los enlaces «Franjas preferidas», con su recuento y su `aria-label`.

## 8. Frontend: componentes y páginas

- [x] 8.1 Tests que fallan (`courseWorkloadDraft.test.ts`, recorriendo `test-fixtures/preferred-slots-warnings.json`) e implementación:
  - `preferredSlotsWarnings` en el frontend.
  - El borrador de la matriz conserva `PREFERRED_SLOTS_FORBIDDEN` y `SLOTS_OUTSIDE_CALENDAR` del servidor y los quita con «No se imparte».
- [x] 8.2 Tests que fallan (`SlotGrid.test.tsx`) e implementación del modo `preferred` en `components/SlotGrid.tsx`:
  - Los estados de celda, con su icono y su texto.
  - El botón deshabilitado con «Prohibida» en su nombre.
  - Desmarcar una preferida prohibida.
  - Cabeceras que solo actúan sobre las no bloqueadas.
  - Solo lectura.
  - `axe`.
  - El modo `forbidden` no cambia.
- [x] 8.3 Tests que fallan (`SubjectSlotsPage.test.tsx`) e implementación del tipo en `pages/SubjectSlotsPage.tsx` y de la ruta `/preferidas` en `App.tsx`:
  - Títulos y mensaje de guardado por tipo.
  - Las prohibidas bloqueadas.
  - El aviso de contradicción recalculado al desmarcar.
  - El `PUT` a la ruta del tipo.
  - La vista del `MEMBER`.
  - `axe` para los dos roles.
  - Los tests de las prohibidas siguen en verde.
- [x] 8.4 Tests que fallan (`CourseWorkloadPage.test.tsx`) e implementación del enlace «Franjas preferidas (n)», con su `aria-label`, en la matriz y en la vista del miembro:
  - Sin enlace sin calendario.
  - El aviso de contradicción en rojo.
- [x] 8.5 `SubjectWarnings`: el texto de `PREFERRED_SLOTS_FORBIDDEN` con su recuento, en el color de peligro

## 9. Revisar los tests existentes (MANDATORY)

- [x] 9.1 Revisar y actualizar, conservando lo que comprobaban, los tests que usan las formas que cambian:
  - Los fixtures de `CourseWorkloadSubject`, `WorkloadSubject` y `SubjectSlotsSnapshot` en backend y frontend.
  - `api/schema.test.ts`, `workload.int.test.ts` y `slots.int.test.ts`.
  - Los E2E `workload.cy.ts`, `subjects.cy.ts` y `slots.cy.ts`.

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Capturar la línea base de la base de datos: recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidas `scheduling_constraints` y `scheduling_constraint_slots`. Vaciar antes los restos de ejecuciones sueltas en `test_<n>`.
- [x] 10.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend):
  - Guardar el log.
  - Leer el código de salida del propio comando, nunca tras una tubería.
  - Comprobar que no hay errores «Unhandled».
- [x] 10.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 10.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 10.5 Documentar el resultado en `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`:
  - **Lectura de preferidas:** `forbiddenSlots`, celdas, `outsideCalendarCount` y avisos. Las prohibidas, sin `forbiddenSlots`.
  - **Escritura:** guardar, repetir sin cambios, una preferida prohibida aceptada con su aviso, vaciar sin tocar las prohibidas, y quitar las celdas fuera tras acortar el calendario.
  - **Validación:** `400` de forma, `404` de una pareja que no existe y `409` sin calendario.
  - **Carga:** `preferredSlotCount`, `PREFERRED_SLOTS_FORBIDDEN` y `SLOTS_OUTSIDE_CALENDAR` sumado.
  - **Cascadas:** quitar el curso desde la carga y borrar la asignatura con las dos reglas.
  - **Permisos:** `403` de un `MEMBER` real y su `GET` `200`; `401` sin token.
  - **Concurrencia**, varias rondas: `PUT` de preferidas contra `PUT` de prohibidas.
  - **Log:** `SUBJECT_SLOTS_UPDATED` y `_REJECTED` con `type` y sin nombres.
- [x] 11.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Ampliar `cypress/e2e/slots.cy.ts` (requisito «Franjas preferidas de extremo a extremo»):
  - Abrir las preferidas desde la matriz, marcar con las cabeceras, guardar y ver «Franjas preferidas (n)».
  - Las prohibidas visibles y no marcables.
  - Prohibir después una preferida, ver el aviso en rojo, desmarcarla y guardar.
  - Vaciar.
  - El `MEMBER` sin edición.
  - 360 px sin desplazamiento horizontal.
  - Cada `cy.intercept` registrado una sola vez.
- [x] 12.2 Ejecutar en modo headless `slots.cy.ts` y `workload.cy.ts`, y después `npm run test:e2e` completo
- [x] 12.3 Verificar y restaurar la base de datos de test
- [x] 12.4 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs` en `docs/backend-standards.md`, solo si el patrón es nuevo: un mismo caso de uso, repositorio y router parametrizados por el tipo de regla
- [x] 13.2 Actualizar la documentación técnica:
  - `backend/CLAUDE.md` (las dos rutas del router y el tipo) y `frontend/CLAUDE.md` (el modo de `SlotGrid` y `SubjectSlotsPage`).
  - `README.md` (endpoints).
  - `CLAUDE.md` raíz (estado actual).
  - `docs/Modelo_de_Datos/MODELO_DATOS.md`: la tabla de celdas guarda los dos tipos.
  - La arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL), si cambian los nombres de los componentes.
  - `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md`: la sección de SC4, junto a SC1–SC3, y su fila en la tabla resumen.
  - El resumen de épicas de `docs/User_Stories_MVP.md`.
- [x] 13.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.4 Verificar con `openspec validate us19-d-franjas-preferidas --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [ ] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check` con su código de salida y abrir la PR con los grupos 0–13. Tras integrarla la persona usuaria, verificar el despliegue automático y el smoke test (sin migraciones).
- [ ] 14.2 Comprobar en producción:
  - **Con `curl`:**
    - `/cursos/<id>/carga/<id>/preferidas` sirve la SPA con la CSP.
    - El bundle contiene los textos nuevos.
    - `GET` y `PUT` de las preferidas sin token responden `401`.
  - **La persona usuaria, con un navegador real,** en escritorio y en el móvil y sin violaciones de CSP:
    - Marca y guarda preferidas y ve el número en la matriz.
    - Ve las prohibidas bloqueadas y el aviso de contradicción.
    - Lo ve como `MEMBER` sin poder editar.
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
