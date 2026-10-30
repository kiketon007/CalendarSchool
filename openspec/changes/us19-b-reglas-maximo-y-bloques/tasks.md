## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us19-b-reglas-maximo-y-bloques` desde `main` actualizada (`5e79952`, con US19 archivada), con los artefactos de este cambio y las correcciones de la ficha de US19_b en `docs/User_Stories_MVP.md` (CA4, `NOT_ALLOWED` y `maxConsecutiveSessions`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha corregida y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml`:
  - `CourseWorkloadSubject` gana `maxPerDay` (2..5 o `null`), `blockSize` (2..3 o `null`), `constraintCount` y `warnings`.
  - `CourseWorkload.calendar` gana `maxConsecutiveSessions`.
  - `CourseWorkloadChange` gana `maxPerDay` y `blockSize`, obligatorios.
  - `WorkloadWarningCode` gana `BLOCK_LARGER_THAN_LOAD` y `SUBJECT_DOES_NOT_FIT`, y su descripción dice qué códigos van en cada lista.
  - `SubjectCourse` y `CourseImpact` ganan `constraintCount`.
  - Las descripciones del `PATCH` (fila entera, `null` borra la regla) y de `FieldErrorCode` (`NOT_ALLOWED` también para una regla sin carga).
- [x] 1.2 Fijar en `api/schema.test.ts` los campos nuevos de los cinco esquemas y los cuatro códigos de aviso (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Base de datos

- [x] 2.1 Test de esquema que falla (`schedulingConstraintsSchema.int.test.ts`):
  - Comprobaciones en `pg_constraint`: los tres `CHECK` por su nombre, el único `(subject_id, course_id, type)` y la clave compuesta a `subject_courses` con `ON DELETE CASCADE`.
  - Inserciones rechazadas: máximo 1 o 6, máximo con `block_size`, bloque 4, tipo repetido para la misma pareja y regla sin pareja.
  - Cascadas: al borrar la fila de `subject_courses`, la asignatura y el curso.
- [x] 2.2 Añadir `ConstraintType` y `SchedulingConstraint` a `backend/prisma/schema.prisma`, con estas relaciones e índices:
  - La relación compuesta con `SubjectCourse` (`onDelete: Cascade`) y la de `School`.
  - Los índices de `course_id` y `school_id`.
  - Comentarios `///` en castellano.
- [x] 2.3 Generar la migración `add_scheduling_constraints` con `--create-only`, añadir a mano los tres `CHECK` con su comentario, revisar el SQL, aplicarla (`npm run db:migrate`) y dejar en verde el test 2.1. Añadir `scheduling_constraints` a la limpieza de `resetDatabase()` y de `scripts/e2eData.mjs` si alguna lista sus tablas.

## 3. Backend: dominio

- [x] 3.1 Tests que fallan (`workloadWarnings.test.ts`). Implementar en `workloadWarnings` los avisos por asignatura (función pura, decisión 5 del diseño):
  - `BLOCK_LARGER_THAN_LOAD`: 1 sesión con bloques de 2 y 2 con bloques de 3, con y sin calendario.
  - `SUBJECT_DOES_NOT_FIT` por un tramo corto: 2 sesiones seguidas con bloques de 3, y 3 sesiones con el recreo tras la 1ª.
  - Lo que cabe: 4 sesiones en bloques de 2 con el recreo tras la 1ª, y 5 en bloques de 2 con 2 seguidas.
  - Por días: 6 sueltas con `m = 1` no caben y con `m = 2` sí. Que el bloque manda sobre el máximo.
  - Sin calendario, solo el aviso de bloque. Asignatura que no se imparte, sin avisos. Avisos del curso sin cambios.
- [x] 3.2 Tipos del dominio:
  - `WorkloadSubject` gana `maxPerDay`, `blockSize` y `constraintCount`.
  - `WorkloadCalendar` gana `maxConsecutiveSessions`.
  - `CourseWorkloadChange` gana `maxPerDay` y `blockSize`.
  - `ApplyWorkloadChangesResult` gana `constraintsSet` y `constraintsRemoved`.
  - Actualizar el JSDoc del puerto.

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan (`updateCourseWorkloadRequest.test.ts`) e implementación en el parser:
  - `maxPerDay` y `blockSize`: ausentes (`REQUIRED`), no enteros (`INVALID_FORMAT`), 1/6 y 1/4 (`OUT_OF_RANGE`), `null` válidos.
  - `NOT_ALLOWED` en cada uno con `sessionsPerWeek: null`.
  - Orden `subjectId`, `sessionsPerWeek`, `maxPerDay`, `blockSize`, sin detenerse en el primero.
- [x] 4.2 Tests que fallan e implementación:
  - `buildCourseWorkload.test.ts`: los avisos de cada asignatura en `subjects[i].warnings`.
  - `updateCourseWorkload.test.ts`: `COURSE_WORKLOAD_UPDATED` con `constraints_set` y `constraints_removed`, emitido también si solo cambian reglas y no emitido si no cambia nada.
- [x] 4.3 Tests que fallan e implementación en `deleteCourse.test.ts`: `COURSE_DELETED` con `constraint_count`, sin nombres. Actualizar `CourseImpact` del dominio con `constraintCount`.

## 5. Backend: infraestructura

- [x] 5.1 Tests de integración que fallan para `findByCourse` (`prismaCourseWorkloadRepository.int.test.ts`):
  - `maxPerDay`, `blockSize` y `constraintCount` de cada asignatura, `null`/0 si no se imparte, sin reglas de otro curso.
  - `maxConsecutiveSessions` con recreos al principio, en medio y al final, y sin recreos.
- [x] 5.2 Tests de integración que fallan para `applyChanges`:
  - Escritura: crear, cambiar y borrar cada regla; pareja nueva con reglas; quitar la pareja borra sus reglas (y cuentan en `constraintsRemoved`).
  - Lo que no cambia: las reglas que no cambian no se escriben (`updated_at` intacto); recuentos a 0 si nada cambia.
  - Atomicidad con un disparador de prueba sobre `scheduling_constraints`.
- [x] 5.3 Implementar las reglas en `PrismaCourseWorkloadRepository` (decisión 3 del diseño):
  - Lectura de las reglas y del tramo más largo sin recreo.
  - Escritura de las reglas tras las parejas, en la misma transacción y bajo los mismos bloqueos.
  - Los recuentos.
- [x] 5.4 Tests de integración que fallan (`prismaSubjectRepository.int.test.ts`):
  - `update` aplica diferencias: guardar cambiando solo el nombre conserva las reglas y el `created_at` de las parejas; cambiar las sesiones de un curso conserva sus reglas; quitar un curso borra solo sus reglas.
  - `constraintCount` en `listBySchool` y `findById`.
  - La atomicidad existente sigue en verde.
- [x] 5.5 Implementar las diferencias en `PrismaSubjectRepository.update` (decisión 6 del diseño, mismos bloqueos) y `constraintCount` en `SUBJECT_FIELDS`. Actualizar el tipo `Subject` del dominio (`courses[i].constraintCount`).
- [x] 5.6 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`) e implementación: `constraintCount` en `impactOf` y en `delete` (contado antes de borrar en la transacción) y ninguna regla del curso tras borrarlo
- [x] 5.7 Tests de integración de concurrencia, varias rondas, sin errores ni interbloqueos y sin ninguna regla sin su pareja al terminar:
  - `applyChanges` con reglas contra la edición de la misma asignatura que quita ese curso.
  - Contra el borrado de la asignatura.
  - Contra el borrado del curso.
  - Contra otro `applyChanges` sobre la misma asignatura.

## 6. Backend: presentación

- [x] 6.1 Actualizar `workloadRoute.test.ts` y los dobles (`test/support/appDoubles.ts`): el cuerpo con los cuatro campos, `400` con `NOT_ALLOWED` y `OUT_OF_RANGE`, y la respuesta con las reglas y los avisos por asignatura
- [x] 6.2 Tests de integración por HTTP (`workload.int.test.ts`, `subjects` y `courses`):
  - Poner y quitar reglas.
  - Verlas en `GET /api/subjects` (`constraintCount`).
  - Los avisos por asignatura.
  - `400` (`NOT_ALLOWED`, `OUT_OF_RANGE`) sin cambios.
  - Las cascadas por HTTP: quitar desde la asignatura y desde la carga, y borrar la asignatura y el curso.
  - `constraintCount` en el impacto y en el borrado del curso.
  - Los eventos sin nombres.

## 7. Frontend: servicios y textos

- [x] 7.1 Tests que fallan e implementación de los servicios:
  - `courseWorkloadService.test.ts`: la forma nueva de la carga (`maxPerDay`, `blockSize`, `constraintCount`, `warnings` por asignatura con los códigos nuevos, `maxConsecutiveSessions`) y formas incorrectas; `update` envía los cuatro campos.
  - `subjectsService.test.ts`: `constraintCount` en `SubjectCourse`.
  - `coursesService.test.ts`: `constraintCount` en el impacto y en el borrado.
- [x] 7.2 Añadir a `es.json` y `en.json`:
  - Las etiquetas y opciones de «Máximo al día» y «Bloques».
  - Los dos avisos por asignatura y la línea del `MEMBER` («· como mucho {n} al día», «· en bloques de {k}»).
  - «· {n} reglas» con plural.
  - Los avisos de pérdida: matriz, edición de la asignatura, borrado de la asignatura y borrado del curso.

## 8. Frontend: componentes y páginas

- [x] 8.1 Tests que fallan para `utils/courseWorkloadDraft.ts` (`courseWorkloadDraft.test.ts`) e implementación (decisión 8 del diseño):
  - Borrador por fila con los tres campos.
  - `changesOf` con la fila entera de las que difieren en cualquier campo.
  - «No se imparte» pone las reglas a `null`.
  - `draftBalance` con los avisos por asignatura iguales a los del backend.
- [x] 8.2 Tests que fallan (`CourseWorkloadPage.test.tsx`, `ADMIN`):
  - Los dos selectores con su etiqueta, deshabilitados en «No se imparte».
  - Avisos que se recalculan al editar.
  - Aviso de pérdida con `aria-describedby`.
  - «Guardar» con un cambio solo de reglas.
  - El `PATCH` con la fila entera.
  - `axe` con avisos.
- [x] 8.3 Tests que fallan (`CourseWorkloadPage.test.tsx`, `MEMBER`): las reglas como texto en cada asignatura y sus avisos, sin selectores; `axe`. Implementar en `pages/CourseWorkloadPage.tsx`, con los tres selectores apilados a 360 px.
- [x] 8.4 Tests que fallan (`SubjectsPage.test.tsx`) e implementación: «{curso}: {n} sesiones · {m} reglas» con plural y sin sufijo si es 0
- [x] 8.5 Tests que fallan e implementación del aviso de pérdida en la edición de la asignatura (`SubjectForm.test.tsx` y `EditSubjectPage.test.tsx`):
  - Al desmarcar un curso con reglas, «Al guardar se borrarán sus {m} reglas en {curso}» ligado por `aria-describedby`; desaparece al volver a marcarlo.
  - Sin aviso en el alta.
  - `axe`.
- [x] 8.6 Tests que fallan e implementación de los avisos de los diálogos de borrado:
  - `DeleteSubjectModal.test.tsx`: «Se borrarán también {m} reglas» con la suma, solo si es mayor que 0.
  - `DeleteCourseModal.test.tsx`: «Se borrarán también {n} reglas de reparto», solo si es mayor que 0.

## 9. Revisar los tests existentes (MANDATORY)

- [x] 9.1 Revisar y actualizar, conservando lo que comprobaban, los tests que usan las formas que cambian:
  - Los fixtures de `Subject`, `CourseImpact` y `CourseWorkload` en backend y frontend.
  - `workload.int.test.ts`, `subjects` y `courses`, `App.test.tsx` y `api/schema.test.ts`.
  - Los E2E `workload.cy.ts`, `subjects.cy.ts` y `courses.cy.ts`.

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Capturar la línea base de la base de datos: recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluida `scheduling_constraints`, vaciando antes los restos de ejecuciones sueltas en `test_<n>`
- [x] 10.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend). Guardar el log, leer el código de salida del propio comando (nunca tras una tubería) y comprobar que no hay errores «Unhandled».
- [x] 10.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 10.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 10.5 Documentar el resultado en `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`:
  - **Lectura y escritura de las reglas:** poner y quitar reglas en la carga, con los avisos por asignatura y `maxConsecutiveSessions`.
  - **Validación:** `400` con `NOT_ALLOWED` y `OUT_OF_RANGE` sin cambios.
  - **Recuentos:** `constraintCount` en `GET /api/subjects` y en el impacto y el borrado del curso.
  - **Cascadas:** guardar una asignatura cambiando solo el nombre conserva sus reglas; quitar el curso desde la asignatura y desde la carga, y borrar la asignatura y el curso, las borra.
  - **Permisos:** `403` de un `MEMBER` real y su `GET` `200` con las reglas.
  - **Concurrencia**, varias rondas: reglas contra edición de la asignatura y contra borrado del curso.
  - **Log:** lleva los recuentos de reglas y ningún nombre.
- [x] 11.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Ampliar `cypress/e2e/workload.cy.ts`:
  - Poner un máximo y unos bloques y verlos en la tarjeta («· 2 reglas»).
  - El aviso de bloque mayor que la carga.
  - Pasar a «No se imparte» con su aviso de pérdida, y que las reglas desaparecen.
  - Un `MEMBER` que ve las reglas como texto.
  - La matriz con reglas a 360 px.
- [x] 12.2 Ampliar los otros dos E2E:
  - `subjects.cy.ts`: el aviso al desmarcar un curso con reglas, guardar y que desaparecen, y el aviso del diálogo de borrado.
  - `courses.cy.ts`: el aviso de reglas en el diálogo de borrado de un curso.
  - Cada `cy.intercept` se registra una sola vez.
- [x] 12.3 Ejecutar en modo headless las tres specs y después `npm run test:e2e` completo
- [x] 12.4 Verificar y restaurar la base de datos de test
- [x] 12.5 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs` en `docs/backend-standards.md`, solo si el patrón es nuevo: clave ajena compuesta a una tabla de unión con cascada, y una pantalla que reemplazaba filas y pasa a diferencias para no perder lo que cuelga de ellas
- [x] 13.2 Actualizar la documentación técnica:
  - `backend/CLAUDE.md` y `frontend/CLAUDE.md`.
  - `README.md` (módulo y tabla nueva).
  - `CLAUDE.md` raíz (estado actual).
  - `docs/Modelo_de_Datos/MODELO_DATOS.md` (la tabla, sus `CHECK` y la cascada).
  - La arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL).
  - `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (HC3 es el valor por defecto de `MAX_PER_DAY`, y `BLOCK` con el recreo que corta).
  - El resumen de épicas de `docs/User_Stories_MVP.md`.
- [x] 13.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.4 Verificar con `openspec validate us19-b-reglas-maximo-y-bloques --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [ ] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check` con su código de salida y abrir la PR con los grupos 0–13. Tras integrarla la persona usuaria, verificar el despliegue automático, que la migración `add_scheduling_constraints` se aplica y el smoke test.
- [ ] 14.2 Comprobar en producción:
  - **Con `curl`:** `/cursos/<id>/carga` sirve la SPA con la CSP, el bundle contiene los textos nuevos, y `PATCH /api/courses/{id}/workload` y `GET /api/courses/{id}/impact` sin token responden `401`.
  - **La persona usuaria, con un navegador real,** en escritorio y en el móvil y sin violaciones de CSP:
    - Pone un máximo y unos bloques y los ve en la tarjeta.
    - Ve el aviso de un bloque que no cabe y los avisos de pérdida.
    - Lo ve como `MEMBER` sin poder editar.
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
