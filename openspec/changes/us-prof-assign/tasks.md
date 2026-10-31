## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-prof-assign` desde `main` actualizada (`ddb6c7d`, con US-PROF-AVAIL archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene:
  - los artefactos de este cambio;
  - las fichas enriquecidas (US-PROF-ASSIGN y US-PROF-ASSIGN_b);
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.
- [x] 0.3 Comprobar que la ficha de US-PROF-ASSIGN tiene las decisiones de la exploración y no tiene caracteres corruptos

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml`:
  - `getCourseAssignments` y `updateCourseAssignments`, con respuestas, errores de campo y ejemplos;
  - `CourseAssignments`, `UpdateCourseAssignmentsRequest` y `ProfessorSubject`;
  - `Professor.subjects` como lista de `ProfessorSubject`, también en los ejemplos.
- [x] 1.2 Fijar en `api/schema.test.ts` las operaciones y los esquemas (test que falla) y regenerar los tipos

## 2. Base de datos

- [x] 2.1 Test de esquema que falla (`professorAssignmentsSchema.int.test.ts`):
  - el índice único `(subject_id, class_id)`;
  - la clave `(class_id, course_id)` rechaza una clase de otro curso;
  - la clave `(subject_id, course_id)` rechaza una asignatura que no se imparte;
  - las cascadas desde `subject_courses`, `classes`, `courses`, `subjects` y `professors`;
  - `classes_id_course_id_key`.
- [x] 2.2 Añadir el modelo `ProfessorAssignment` y el `@@unique([id, courseId])` de `SchoolClass` a `schema.prisma`, crear la migración `add_professor_assignments`, revisar el SQL (no debe tocar los `CHECK` existentes), aplicarla y ver el test en verde

## 3. Backend: dominio

- [x] 3.1 Tests que fallan e implementación de `domain/assignment/`:
  - los tipos `CourseAssignments`, `AssignmentCell` y `ProfessorSubject`;
  - `planAssignmentChanges(current, wanted)`, pura, con `toDelete`, `toChange`, `toCreate` y sus recuentos, y sin cambios cuando son iguales;
  - el puerto `CourseAssignmentsRepository`, con su JSDoc.
- [x] 3.2 Cambiar `Professor.subjects` a `readonly ProfessorSubject[]` en el dominio y actualizar los fixtures del backend

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan e implementación de `parseUpdateCourseAssignmentsRequest`:
  - `REQUIRED`, `INVALID_LENGTH` y `INVALID_FORMAT` por posición;
  - `DUPLICATE` desde la segunda pareja repetida;
  - `schoolId` ignorado.
- [x] 4.2 Tests que fallan e implementación de `GetCourseAssignments`: el orden con `compareText` y `CourseNotFound`
- [x] 4.3 Tests que fallan e implementación de `UpdateCourseAssignments`:
  - valida el cuerpo;
  - traduce `notFound` a `CourseNotFound` e `invalidReferences` a `ValidationError` con `NOT_FOUND` por posición;
  - registra `COURSE_ASSIGNMENTS_UPDATED` (solo si cambió) y `_REJECTED`, sin nombres.

## 5. Backend: infraestructura

- [x] 5.1 Tests de integración que fallan (`prismaCourseAssignmentsRepository.int.test.ts`):
  - `find` con las asignaturas impartidas, las clases con su tutor y las asignaciones, y `null` para otro colegio;
  - `replace`:
    - crea, cambia de profesor (conserva `created_at`), borra y no escribe sin cambios;
    - devuelve `invalidReferences` por posición para una asignatura no impartida, una clase de otro curso y un profesor de otro colegio;
    - devuelve `notFound` para un curso de otro colegio;
  - `DatabaseUnavailable`.
- [x] 5.2 Implementar `PrismaCourseAssignmentsRepository`, con el curso `FOR UPDATE`, los profesores (pedidos y actuales) `FOR SHARE` en orden de `id`, las referencias y las diferencias, y cablearlo en `composeApp.ts`
- [x] 5.3 Tests de integración de concurrencia, varias rondas, sin `500` ni interbloqueos:
  - dos `PUT` del mismo curso, de los que queda uno entero;
  - `PUT` contra `DELETE` del profesor, sin asignaciones huérfanas;
  - `PUT` contra el `PATCH` de la carga que quita la asignatura;
  - `PUT` contra la edición del curso que quita la clase.
- [x] 5.4 Tests que fallan e implementación de `subjects` en `PrismaProfessorRepository` (listado, lectura, alta y edición), en orden natural, sin una consulta por profesor

## 6. Backend: presentación

- [x] 6.1 Tests que fallan (`assignmentsRoute.test.ts`) e implementación de `assignmentsRouter`, montado antes de `/courses` con `mergeParams`:
  - los dos roles;
  - `404` con un id que no es UUID;
  - `400`, `401` y `503`;
  - `no-store`;
  - el colegio de la identidad.
  También los dobles en `appDoubles.ts`.
- [x] 6.2 Tests de integración por HTTP (`assignments.int.test.ts`) con los escenarios del requisito «Guardar la matriz de un curso con PUT»:
  - las cascadas por HTTP: «No se imparte» en la carga, quitar la clase al editar el curso, borrar la asignatura, el curso o el profesor;
  - `subjects` en `GET /api/professors`;
  - los eventos sin nombres.

## 7. Frontend: servicios, utilidades y textos

- [x] 7.1 Tests que fallan e implementación de:
  - `services/courseAssignmentsService.ts` (`get` y `update`): validan la forma, codifican el id y nunca lanzan;
  - `professorsService`, que valida `ProfessorSubject`, con sus fixtures.
- [x] 7.2 Tests que fallan e implementación de `utils/courseAssignmentsDraft.ts`: `draftFrom`, `assignTutor` (solo celdas vacías), `unassignedCount`, `sessionsByProfessor`, `hasChanges` y `toBody`
- [x] 7.3 Tests que fallan e implementación de las asignaturas en la búsqueda de profesores (`utils/personSearch.ts` con un texto extra opcional, sin cambiar `/alumnos`)
- [x] 7.4 Añadir los textos en `es.json` y `en.json`:
  - en `assignments.*`;
  - la columna y «Sin asignaturas» de profesores;
  - la nueva etiqueta de la búsqueda;
  - el enlace «Profesores» de cursos.

## 8. Frontend: componentes y páginas

- [x] 8.1 Tests que fallan (`CourseAssignmentsPage.test.tsx`, a 1280 y a 360 px) e implementación de `pages/CourseAssignmentsPage.tsx` y su ruta en `App.tsx`:
  - carga única, «Reintentar» y `404`;
  - la matriz o las tarjetas;
  - el tutor marcado;
  - «Asignar al tutor», también deshabilitado con su explicación;
  - los recuentos;
  - el guardado con guarda síncrona y aviso;
  - el `400 NOT_FOUND`, que vuelve a pedir la matriz;
  - el curso sin asignaturas;
  - los dos roles;
  - `axe`.
- [x] 8.2 Tests que fallan (`CoursesPage.test.tsx`) e implementación del enlace «Profesores» en la tabla y las tarjetas
- [x] 8.3 Tests que fallan (`ProfessorsPage.test.tsx`, a 1280 y a 360 px) e implementación de la columna «Asignaturas» y de la búsqueda por asignatura

## 9. Revisar los tests existentes (MANDATORY)

- [x] 9.1 Revisar y actualizar, conservando lo que comprobaban:
  - los fixtures de `Professor` con `subjects` en backend y frontend;
  - los tests que exigían `subjects: []`;
  - `professors.int.test.ts`;
  - los E2E de cursos y profesores (columnas y acciones nuevas, 360 px).

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Capturar la línea base: recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, tras vaciar los restos y aplicar la migración
- [x] 10.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % en backend y 80 % en frontend):
  - guardar el log;
  - leer el código de salida del propio comando;
  - comprobar que no hay errores «Unhandled».
- [x] 10.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 10.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 10.5 Documentar el resultado en `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md`

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend local y comprobar con `curl`:
  - **Matriz:** el `GET` de un curso con dos clases, una con tutor.
  - **Escritura:** el `PUT` que asigna, el estado final que quita y cambia, y repetir sin cambios.
  - **Validación:** referencias que no valen (asignatura no impartida, clase de otro curso, profesor de otro colegio) y `DUPLICATE`.
  - **Errores:** `404`.
  - **Permisos:** `MEMBER` real; `401`.
  - **Profesores:** `subjects` en el listado de profesores.
  - **Cascadas:** «No se imparte», quitar la clase, borrar el profesor.
  - **Concurrencia:** dos `PUT`, varias rondas.
  - **Log:** eventos sin nombres.
- [x] 11.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.3 Documentar los comandos y las respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Crear `cypress/e2e/assignments.cy.ts` (requisito «Asignaciones de extremo a extremo»), con cada `cy.intercept` registrado una sola vez
- [x] 12.2 Ejecutar en modo headless `assignments.cy.ts`, `courses.cy.ts` y `professors.cy.ts`, y después `npm run test:e2e` completo
- [x] 12.3 Verificar y restaurar la base de datos de test
- [x] 12.4 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs` en `docs/backend-standards.md`, solo si el patrón es nuevo: una fila que cuelga de dos filas de unión con claves compuestas, que comprueban que pertenecen al mismo padre
- [x] 13.2 Actualizar la documentación técnica:
  - `backend/CLAUDE.md`: el router, los bloqueos (añadir al orden global), las cascadas, los eventos y la tabla de features;
  - `frontend/CLAUDE.md`: la página, el borrador y los cambios en profesores y cursos;
  - `README.md`: endpoints, rutas y el módulo 7;
  - `CLAUDE.md` raíz;
  - `MODELO_DATOS.md`: la tabla nueva sustituye a `professor_subjects` y `professor_assignments` de la v2.1;
  - la arquitectura (tabla, C4 y DSL);
  - la especificación del motor (HC6 y las variables por clase);
  - el resumen de épicas.
- [x] 13.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.4 Verificar con `openspec validate us-prof-assign --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [ ] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–13. Tras integrarla la persona usuaria, verificar el despliegue automático, **la migración aplicada** y el smoke test.
- [ ] 14.2 Comprobar en producción:
  - **Con `curl`:**
    - `/cursos/<id>/profesores` sirve la SPA con la CSP;
    - el bundle contiene los textos nuevos;
    - `GET` y `PUT /api/courses/<id>/assignments` sin token responden `401`.
  - **La persona usuaria, con un navegador real**, en escritorio y en el móvil y sin violaciones de CSP:
    - asigna profesores en un curso, con «Asignar al tutor»;
    - ve las asignaturas en el listado de profesores;
    - lo prueba como `MEMBER`.
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
