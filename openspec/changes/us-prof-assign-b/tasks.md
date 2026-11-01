## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-prof-assign-b` desde `main` actualizada (`2248055`, con US-PROF-ASSIGN archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene:
  - los artefactos de este cambio;
  - la ficha enriquecida de US-PROF-ASSIGN_b y la fila de la épica 6 en `docs/User_Stories_MVP.md`;
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.
- [x] 0.3 Localizar los constructores de dobles y fixtures de `CourseWorkloadSubject`, `SubjectCourse`, `SchoolClass`, `CourseImpact` y `DeletedProfessor` (backend y frontend) para cambiarlos en el mismo paso que su tipo

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `assignmentCount` (entero ≥ 0, requerido, solo en respuestas) en `CourseWorkloadSubject`, `SubjectCourse`, `SchoolClass` y `CourseImpact`, con sus descripciones y los ejemplos de todas las operaciones que los devuelven; dejar dicho en `DELETE /api/subjects/{id}` y `DELETE /api/professors/{id}` que la respuesta no cambia
- [x] 1.2 Fijar el campo en `api/schema.test.ts` (test que falla) y regenerar los tipos con `npm run api:types -w frontend`

## 2. Backend: dominio

- [x] 2.1 Añadir `assignmentCount` a los tipos de lectura de la carga (`domain/workload`), de la asignatura en un curso (`domain/subject`), de la clase y de `CourseImpact` (`domain/course`), y a `DeletedProfessor`; cambiar el puerto `SubjectRepository.delete` a `{ assignmentCount } | null`; actualizar los dobles (`appDoubles` y tests) hasta que `typecheck` pase

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan e implementación en `PrismaCourseWorkloadRepository`: `assignmentCount` por asignatura en la lectura y tras el `PATCH` (0 si no se imparte, 0 tras pasar a «No se imparte»)
- [x] 3.2 Tests que fallan e implementación en `PrismaSubjectRepository`:
  - `assignmentCount` por curso en el listado, la lectura, el alta (0) y la edición (estado final);
  - `delete` devuelve el recuento, contado tras el `FOR UPDATE` y antes de borrar, o `null` si no existe.
- [x] 3.3 Tests que fallan e implementación en `PrismaCourseRepository`:
  - `assignmentCount` por clase en el listado, la lectura, el alta y la edición (las nuevas, 0), en la misma consulta que `studentCount`;
  - `assignmentCount` en el impacto y en el `deleted` del borrado, contado en su transacción.
- [x] 3.4 Tests que fallan e implementación en `PrismaProfessorRepository.delete`: `assignmentCount` contado con la fila bloqueada y antes de borrar

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan e implementación de los eventos: `assignment_count` en `COURSE_DELETED`, `SUBJECT_DELETED` y `PROFESSOR_DELETED`, sin nombres; `DeleteSubject` sigue devolviendo `{ id }`

## 5. Backend: presentación

- [x] 5.1 Test que falla e implementación en `professorsRouter`: el `DELETE` responde `{ deleted: { freedClass } }` sin `assignmentCount`
- [x] 5.2 Tests de rutas de cursos, asignaturas y carga: las respuestas llevan `assignmentCount` donde dice el contrato (`coursesRoute.test.ts`, `subjectsRoute.test.ts`, `workloadRoute.test.ts`)
- [x] 5.3 Tests de integración de extremo a extremo del backend (`courses.int.test.ts`, `subjects.int.test.ts`, `workload.int.test.ts`, `assignments.int.test.ts`): los recuentos tras crear asignaciones por la API, tras las cascadas y los eventos con `assignment_count`

## 6. Frontend: servicios y utilidades

- [x] 6.1 Tests que fallan e implementación en `courseWorkloadService`, `subjectsService` y `coursesService`: exigen `assignmentCount` (falta o negativo → `unavailable`); actualizar sus fixtures
- [x] 6.2 Tests que fallan e implementación de `utils/lostItemsText.ts`: piezas pluralizadas de reglas y asignaciones, sin las que son 0, unidas con `Intl.ListFormat` del idioma, y el número de cosas para el verbo; casos 0, 1 y varios, solo reglas, solo asignaciones, las dos, en `es` y en `en`
- [x] 6.3 Mover `subjectsTextOf` de `ProfessorsPage` a `utils/professorSubjects.ts` con sus tests, sin cambiar el comportamiento del listado
- [x] 6.4 Tests que fallan e implementación de `lostOf` en `utils/courseWorkloadDraft.ts` (sustituye a `rulesLostOf`): `{ rules, assignments }`, a 0 salvo que la fila pase a «No se imparte»

## 7. Frontend: páginas y diálogos

- [x] 7.1 Tests que fallan e implementación en `CourseWorkloadPage`: la frase de pérdida con reglas, con asignaciones y con las dos (claves `workload.matrix.lose_*` y `lost.*`, que sustituyen a `loseRules_*`), ligada por `aria-describedby`; sin nada, sin aviso; `axe`
- [x] 7.2 Tests que fallan e implementación en `SubjectForm` y `EditSubjectPage`: `assignmentCounts` junto a `ruleCounts` y la frase «… en {curso}» al desmarcar un curso; `axe`
- [x] 7.3 Tests que fallan e implementación en `DeleteSubjectModal`: el párrafo «Se quitarán también {n} asignaciones de profesores.» con la suma, solo si es mayor que 0
- [x] 7.4 Tests que fallan e implementación en `DeleteCourseModal`: el párrafo con el `assignmentCount` del impacto, solo si es mayor que 0
- [x] 7.5 Tests que fallan e implementación en `ConfirmRemoveClassModal`, `CourseForm` y `EditCoursePage`: el diálogo se abre con alumnos o con asignaciones, un párrafo por cada uno (singular y plural); una fila nueva o sin nada se quita sin diálogo; `axe`
- [x] 7.6 Tests que fallan e implementación en `DeleteProfessorModal`: «Se quitarán también sus {n} asignaciones de profesores: {lista}.» con `subjectsTextOf`, tras la tutoría; sin asignaciones, nada nuevo; `axe`
- [x] 7.7 Añadir y revisar en `es.json` y `en.json` todas las claves nuevas con sus plurales y borrar las `loseRules_*` que ya no se usan

## 8. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 8.1 Revisar los tests que construyen los cuatro esquemas y `DeletedProfessor` (fixtures, dobles, `appDoubles`, páginas de cursos, asignaturas, carga y profesores) y los textos de pérdida de reglas, para que sigan comprobando lo mismo con el campo nuevo
- [x] 8.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 9. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 9.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 9.2 Ejecutar los tests de los módulos cambiados
- [x] 9.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 9.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 9.5 Crear `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend contra `calendarschool` migrada
- [x] 10.2 Preparar por la API un colegio con un curso de tres clases, dos asignaturas con reglas, dos profesores y asignaciones
- [x] 10.3 Comprobar `assignmentCount` en `GET` y `PATCH` de la carga, en las respuestas de asignaturas (listado, lectura, alta y edición que quita un curso) y de cursos (listado, lectura, alta y edición que quita una clase), y en el impacto
- [x] 10.4 Comprobar los borrados: el `deleted.assignmentCount` del curso; la respuesta del `DELETE` de asignatura y de profesor sin cambios; los eventos `COURSE_DELETED`, `SUBJECT_DELETED` y `PROFESSOR_DELETED` con `assignment_count` y sin nombres
- [x] 10.5 Comprobar errores sin cambios: `404` de otro colegio y `401` sin token en el impacto
- [x] 10.6 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir a `cypress/e2e/assignments.cy.ts`:
  - la frase de la carga con reglas y asignaciones;
  - quitar una clase con asignaciones y sin alumnos: el diálogo con el número y, tras guardar, la matriz sin esa clase;
  - borrar un profesor con asignaciones: el diálogo las enumera y, tras borrar, sus celdas quedan «Sin asignar»;
  - 360 px sin desplazamiento horizontal con los avisos y los diálogos.
- [x] 11.2 Actualizar los E2E existentes que comprueban los textos de pérdida de reglas (`workload.cy.ts`, `subjects.cy.ts`, `courses.cy.ts`) si cambian
- [x] 11.3 Ejecutar la spec nueva y la suite completa en modo headless (`npm run test:e2e`)
- [x] 11.4 Crear `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación técnica (MANDATORY)

- [x] 12.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: los recuentos de asignaciones y los eventos de borrado;
  - `frontend/CLAUDE.md`: `lostItemsText`, `professorSubjects` y los avisos de los diálogos;
  - `docs/api-spec.yml` ya actualizado en 1.1;
  - la ficha de US-PROF-ASSIGN_b y la fila de la épica si algo cambió al implementar.
- [x] 12.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 12.3 Verificar con `openspec validate us-prof-assign-b --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–12 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [ ] 13.2 Comprobar en producción:
  - **Con `curl`:** el bundle contiene los textos nuevos y `GET /api/courses/<id>/impact` sin token responde `401`;
  - **La persona usuaria, con un navegador real**, ve los avisos en la carga, en la edición de una asignatura, en los tres diálogos de borrado y al quitar una clase.
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
