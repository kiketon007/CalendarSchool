## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-subject-asignaturas` desde `main` actualizada, llevando los artefactos de este cambio y las fichas de US-SUBJECT, US-SUBJECT_b, US-SUBJECT_c y la nota de US19 de `docs/User_Stories_MVP.md` (sin el fichero de bloqueo `docs/prompts/~$rarios.docx`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, las fichas y `.claude/settings.json` en Sonnet con esfuerzo medio

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `createSubject` y `listSubjects` (`/api/subjects`, Bearer, `POST` solo `ADMIN` con `201`, `400`, `401`, `403`, `409`, `500` y `503`; `GET` con `200`, `401`, `500` y `503`; `Cache-Control: no-store`), los esquemas `SubjectType`, `SubjectStatus`, `SubjectColor`, `CreateSubjectRequest`, `SubjectCourse`, `Subject` y sus respuestas, `SUBJECT_ALREADY_EXISTS` y `SUBJECT_CODE_ALREADY_EXISTS` en `ErrorCode` y `OUT_OF_RANGE` en `FieldErrorCode` (con su descripción)
- [x] 1.2 Regenerar los tipos (`npm run api:types -w frontend`) y fijar en `api/schema.test.ts` las dos operaciones, los esquemas y los códigos nuevos (test que falla antes de regenerar)

## 2. Modelo de datos

- [x] 2.1 Añadir a `backend/prisma/schema.prisma` los enums `SubjectType`, `SubjectStatus` y `SubjectColor`, `Subject` (con `@@unique([schoolId, normalizedName])` y `@@unique([schoolId, normalizedCode])`) y `SubjectCourse` (clave primaria compuesta, `onDelete: Cascade` hacia `subjects` y `courses`, índice en `courseId`), con las relaciones inversas en `School` y `Course`; generar la migración `add_subjects` con `--create-only`, añadirle a mano `subject_courses_sessions_per_week_check` y aplicarla a la base de desarrollo
- [x] 2.2 Tests de integración de la base de datos (`subjectsSchema.int.test.ts`): el `CHECK` rechaza 0 y 6 exigiendo el nombre de la restricción; dos asignaturas sin código en el mismo colegio se aceptan; el índice único de nombre y el de código por colegio; borrar un curso borra sus filas de `subject_courses` y deja la asignatura

## 3. Backend: dominio y aplicación

- [x] 3.1 Dominio `domain/subject/`: tipos `Subject` y `SubjectCourse`, `SubjectAlreadyExists`, `SubjectCodeAlreadyExists`, el puerto `SubjectRepository` (`create` y `listBySchool`) y `normalizeCode` con sus tests
- [x] 3.2 Crear `test-fixtures/subject-fields.json` (casos válidos e inválidos del nombre, el código, el tipo, el estado, la descripción, el color, la lista de cursos y cada curso) y, con tests que fallan, `application/subjects/createSubjectRequest.ts` (`parseCreateSubjectRequest`: el orden de los errores, código vacío a `null`, propiedades desconocidas ignoradas, cursos sin repetidos, UUID, de 1 a 100 y sesiones enteras de 1 a 5 con `OUT_OF_RANGE`)
- [x] 3.3 Tests que fallan (`createSubject.test.ts`): `400` sin llamar al repositorio y sin evento; `CourseNotFound` con posiciones → `400` con `courses[<i>].courseId` `NOT_FOUND` y `SUBJECT_CREATION_REJECTED` (`course_not_found`); `SubjectAlreadyExists` y `SubjectCodeAlreadyExists` → `409` con `duplicate_name` y `duplicate_code`; `SUBJECT_CREATED` con `course_count` y sin nombres ni códigos; implementar `CreateSubject`
- [x] 3.4 Tests que fallan y luego implementación de `ListSubjects` (asignaturas y cursos ordenados con `compareText`)

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan (`prismaSubjectRepository.int.test.ts`): crear con cursos y sesiones; sin código y sin descripción (`null`); curso de otro colegio o inexistente → `CourseNotFound` sin escribir nada; nombre repetido → `SubjectAlreadyExists`; código repetido sin distinguir mayúsculas → `SubjectCodeAlreadyExists`; atomicidad con un disparador temporal en `subject_courses`; `listBySchool` solo del colegio, con sus cursos, y una asignatura sin cursos tras borrar su curso
- [x] 4.2 Implementar `PrismaSubjectRepository` según el diseño (decisión 6: cursos `FOR SHARE` en orden de `id`, asignatura y `subject_courses` en una transacción, con `translateDatabaseErrors` y `violatedUniqueIndex` para los dos índices)
- [x] 4.3 Tests de integración de concurrencia: dos altas con el mismo nombre y dos con el mismo código (un éxito y el error de dominio correspondiente); alta contra el borrado de su curso varias rondas (éxito o `CourseNotFound`, nunca otro error ni interbloqueo); alta contra la edición de un calendario que se lleva ese curso varias rondas (las dos sin error)

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`subjectsRoute.test.ts`): `POST` con `201` y `no-store`, `403 FORBIDDEN` para un `MEMBER` sin llamar al caso de uso (también con cuerpo inválido), `400`, los dos `409`, `401`, `503`; `GET` con `200` para `ADMIN` y `MEMBER`, `401` y `503`; y `appError.test.ts` con los dos códigos nuevos
- [x] 5.2 Implementar `subjectsRouter` (`requireRole('ADMIN')` solo en `POST`), los dos códigos en `ERROR_CODES` y en `errorHandler`, y conectar los casos de uso en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 5.3 Tests de integración por HTTP (`subjects.int.test.ts`): crear Inglés y Programación, listar en orden, `MEMBER` (`200` al listar y `403` al crear sin crear nada), aislamiento entre colegios, `401`, eventos sin nombres ni códigos, y que `GET /api/courses` y el borrado de un curso no cambian para un curso con asignaturas

## 6. Frontend: servicio, validación y utilidades

- [x] 6.1 Tests que fallan (`subjectsService.test.ts`): `list` (`loaded`, `unauthenticated`, `unavailable` y forma incorrecta) y `create` (`created`, `validationError` con los campos, `alreadyExists` y `codeAlreadyExists`, `forbidden`, `unauthenticated` y `unavailable`); implementar `services/subjectsService.ts`
- [x] 6.2 Tests que fallan y luego implementación de `validation/subjectValidation.ts` (recorriendo `test-fixtures/subject-fields.json`) con la traducción de los errores del servidor a los campos y a cada curso
- [x] 6.3 Tests que fallan y luego implementación de `utils/subjectColors.ts` (paleta en orden, `defaultSubjectColor` con colores libres, todos usados y ninguno, y `contrastRatio` con al menos 4,5:1 en las 12 claves; las claves coinciden con `SubjectColor` del contrato) y de `utils/subjectFilters.ts` (`matchesSubjectFilters` por tipo, estado y búsqueda por nombre o código sin mayúsculas ni acentos, combinables)
- [x] 6.4 Añadir a `es.json` y `en.json` los textos `subjects.*` (listado, resumen de cursos, filtros, formulario, tipos, estados, nombres de los colores, errores de campo y avisos) y `header.subjects`

## 7. Frontend: componentes, páginas y navegación

- [x] 7.1 Tests que fallan (`SubjectColorSwatch.test.tsx`): pinta la muestra con su nombre accesible; implementar `components/SubjectColorSwatch.tsx`
- [x] 7.2 Tests que fallan (`SubjectForm.test.tsx`): estado «Activa» y color propuesto al abrir; marcar un curso muestra su `select` con 2; desmarcarlo lo quita; etiquetas «Sesiones a la semana en {curso}»; errores bajo su campo con el foco en el primero («Marca al menos un curso»); colegio sin cursos con «Primero crea los cursos» y «Guardar» deshabilitado; doble envío; `axe` con y sin errores; implementar `components/SubjectForm.tsx`
- [x] 7.3 Tests que fallan (`SubjectsPage.test.tsx`, a 1280 y 360 px): carga única con `StrictMode`; cada asignatura con color, nombre, código, tipo, estado y resumen; desplegar los cursos con `aria-expanded`; «Sin cursos»; filtros y búsqueda combinados y «No hay asignaturas que coincidan»; vacío según el rol; «Crear asignatura» solo para `ADMIN`; aviso de llegada como texto plano; error con «Reintentar»; `axe`; implementar `pages/SubjectsPage.tsx`
- [x] 7.4 Tests que fallan (`CreateSubjectPage.test.tsx`): carga de cursos y asignaturas (color propuesto) con error y «Reintentar»; envío y navegación con `replace` y el aviso; `409` en el nombre y en el código con el foco; `400` con `NOT_FOUND` en un curso que recarga los cursos conservando lo escrito; `403` y fallo general; implementar `pages/CreateSubjectPage.tsx`
- [x] 7.5 Añadir las rutas `/asignaturas` y `/asignaturas/nueva` (esta bajo `RequireRole role="ADMIN"`) en `App.tsx` y «Asignaturas» en `AppHeader` entre «Calendario» y «Usuarios», con sus tests (`App.test.tsx`, `AppHeader.test.tsx`: los dos roles, `aria-current` en las subrutas y un `MEMBER` en `/asignaturas/nueva` que va a `/onboarding`)

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `AppHeader`, `App`, `appError`, `errorHandler`, `api/schema.test.ts`, la limpieza de la base de datos (`resetDatabase`, `scripts/e2eData.mjs`), los repositorios y rutas de cursos (las respuestas y el borrado no cambian) y los E2E que miran la cabecera, y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, ahora también `subjects` y `subject_courses`)
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), comprobando el código de salida y que no hay errores «Unhandled»
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: crear Inglés (todos los cursos) y Programación (cursos parciales, sin código) con `201` y `no-store`; listar en orden; `400` con los códigos de campo (incluidos `OUT_OF_RANGE`, `DUPLICATE`, `NOT_FOUND` y un color fuera de la paleta); los dos `409`; `403` de un `MEMBER` real (creado con una invitación) al crear y `200` al listar; `401` sin token; aislamiento entre colegios; borrar un curso y ver la asignatura con `courses: []`; que `GET /api/courses` no cambia; y que el log no contiene nombres ni códigos
- [x] 10.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir `cypress/e2e/subjects.cy.ts`: crear «Inglés» con todos los cursos y «Programación» con cursos parciales y sin código, y verlas en el listado con sus cursos desplegados; filtros y búsqueda; nombre y código repetidos; borrar un curso y ver «Sin cursos»; un `MEMBER` (tarea `createUser`) que ve las asignaturas sin «Crear asignatura» y al que `/asignaturas/nueva` lleva a `/onboarding`; el formulario a 360 px sin desplazamiento horizontal (registrando cada `cy.intercept` una sola vez)
- [x] 11.2 Ejecutar en modo headless `subjects.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` si surge un patrón nuevo (bloqueo `FOR SHARE` de varias filas en orden de `id`; tabla de unión con atributo y clave compuesta; paleta cerrada como enum con su contraste en el frontend)
- [x] 12.2 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (sustituir `subjects` y `subject_courses`, eliminar `subject_standard_loads`), `backend/CLAUDE.md` (tabla de features, bloqueos, `CHECK` escritos a mano), `frontend/CLAUDE.md`, `README.md` (módulo 3, árbol, endpoints, modelo de datos y número de tablas) y la arquitectura (fila «Asignaturas» de la sección 0 de `ARQUITECTURA_COMPLETA.md`, parte A de `DIAGRAMA_C4.md` y el DSL)
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.4 Verificar con `openspec validate us-subject-asignaturas --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático, que la migración `add_subjects` se aplica y el smoke test
- [x] 13.2 Comprobar en producción con `curl` que `/asignaturas` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `POST /api/subjects` sin token responden `401` (sin crear datos), y que la persona usuaria, con un navegador real, crea asignaturas, filtra el listado y lo ve como `MEMBER`, en escritorio y en el móvil, sin violaciones de CSP
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
