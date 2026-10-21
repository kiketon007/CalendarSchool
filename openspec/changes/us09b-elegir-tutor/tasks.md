## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us09b-elegir-tutor` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US09_b en `docs/User_Stories_MVP.md` y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `UpdateClassRequest.tutorId` (opcional, UUID o `null`, con la descripción de sus tres estados), el `409` de `PUT /api/courses/{id}` con `PROFESSOR_ALREADY_TUTOR`, el código en el enum `ErrorCode` y los errores de campo `classes[<i>].tutorId` en la descripción del `400`
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar `tutorId?: string | null` de `UpdateCourseRequest` y el código nuevo en `api/schema.test.ts` con `expectTypeOf`, y comprobar `npm run api:types:check -w frontend`

## 2. Backend: dominio y errores

- [x] 2.1 Tests que fallan (`appError.test.ts`): `ERROR_CODES` contiene `PROFESSOR_ALREADY_TUTOR` y coincide con el contrato
- [x] 2.2 Implementar `PROFESSOR_ALREADY_TUTOR` en `ERROR_CODES` y los errores de dominio `ProfessorAlreadyTutor` y `TutorNotFound(index)` en `domain/course/courseErrors.ts`
- [x] 2.3 Tests que fallan (`courseUpdate.test.ts`): con `tutorId` omitido no hay cambio de tutor; `null` y un UUID distinto del guardado son cambios; el mismo que el guardado no lo es; una clase nueva con tutor se asigna y con `null` no cuenta; mover A→B liberando A; intercambiar A↔B; quitar una clase y pasar su tutor a otra; un profesor que no está en `tutors` lanza `TutorNotFound` con el índice; un profesor de otro curso lanza `ProfessorAlreadyTutor`; un profesor de una clase de este curso que no se libera lanza `ProfessorAlreadyTutor`; `isEmptyPlan` con solo cambios de tutor no es vacío; los casos de US07 siguen igual
- [x] 2.4 Implementar en `domain/course/courseUpdate.ts` el `tutorId` en `CurrentClass` y `RequestedClass`, el parámetro `tutors` (`RequestedTutor`), `tutorsChanged` en `CourseUpdatePlan` y las reglas; actualizar la firma de `plan` en `domain/course/courseRepository.ts`

## 3. Backend: aplicación

- [x] 3.1 Añadir a `test-fixtures/course-fields.json` el campo `tutorId` (válidos: ausente, `null`, UUID; inválidos: `"abc"`, `""`, un número, un UUID corto) y su lectura en `backend/test/support/courseFixtures.ts` y `frontend/src/testSupport/courseFixtures.ts`
- [x] 3.2 Tests que fallan (`updateCourseRequest.test.ts`): recorre la tabla para `classes[<i>].tutorId`; distingue ausente de `null`; normaliza el UUID a minúsculas; `DUPLICATE` desde la segunda clase con el mismo profesor (sin distinguir mayúsculas); orden de errores `id` → `tutorId` → `name` dentro de una clase; ignora un objeto `tutor`
- [x] 3.3 Implementar `tutorId` en `application/courses/updateCourseRequest.ts` y en `UpdateClassInput`
- [x] 3.4 Tests que fallan (`updateCourse.test.ts`, con dobles): pasa al repositorio un `plan` que recibe `tutors`; convierte `TutorNotFound` en `ValidationError` con `classes[<i>].tutorId: NOT_FOUND` y registra `COURSE_UPDATE_REJECTED` con `reason: "professor_not_found"`; relanza `ProfessorAlreadyTutor` con `reason: "professor_already_tutor"`; `COURSE_UPDATED` lleva `tutors_changed`; sin nombres
- [x] 3.5 Implementar los cambios en `application/courses/updateCourse.ts`

## 4. Backend: infraestructura

- [x] 4.1 Tests que fallan (`prismaCourseRepository.int.test.ts`, PostgreSQL real): asignar, cambiar y quitar; mover A→B; intercambiar A↔B; tutor en una clase nueva; quitar una clase y pasar su tutor a otra; un `PUT` sin `tutorId` conserva los tutores al renombrar, añadir y quitar; profesor de otro colegio (`TutorNotFound`); profesor de otro curso (`ProfessorAlreadyTutor`, sin escribir nada, tampoco el nombre del curso); un `ProfessorAlreadyTutor` por el índice cuando el profesor pasa a tutorizar otra clase entre la lectura y la escritura (forzado en el test); dos `update` simultáneos de cursos distintos con el mismo profesor (uno resuelve y el otro `ProfessorAlreadyTutor`); el curso devuelto lleva los tutores nuevos
- [x] 4.2 Implementar en `PrismaCourseRepository.update` la lectura de los profesores pedidos (una consulta por colegio), el `tutorId` en el estado actual, los tutores en dos fases tras las clases y la traducción de `classes_tutor_id_key` a `ProfessorAlreadyTutor` con `violatedUniqueIndex`

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`coursesRoute.test.ts`, con dobles): `PUT` con `409 PROFESSOR_ALREADY_TUTOR`; `400` con `classes[<i>].tutorId`
- [x] 5.2 Implementar la traducción de `ProfessorAlreadyTutor` en `presentation/http/errorHandler.ts`
- [x] 5.3 Tests de integración HTTP (`courses.int.test.ts`): asignar y verlo en `GET /api/courses` y `GET /api/professors`; intercambiar; quitar; profesor de otro curso (`409`, nada cambia); de otro colegio (`400 NOT_FOUND`); id inválido y duplicado (`400`); `PUT` sin `tutorId` conserva los tutores; dos `PUT` simultáneos de cursos distintos con el mismo profesor (`200` y `409`, nunca `500`); `MEMBER` asigna; `503`

## 6. Frontend: servicio y validación

- [x] 6.1 Tests que fallan (`coursesService.test.ts`): `update` envía `tutorId` solo en las clases que lo llevan (también `null`) y lo omite si no; `409 PROFESSOR_ALREADY_TUTOR` → `professorAlreadyTutor`; los `409` de US07 siguen igual
- [x] 6.2 Implementar en `services/coursesService.ts` el `tutorId` del cuerpo y el resultado `professorAlreadyTutor`
- [x] 6.3 Tests que fallan (`courseValidation.test.ts`): recorren la tabla para `tutorId`; `hasCourseChanges` cuenta un tutor distinto y no el mismo, y no compara el tutor si falta en alguno de los dos; `validateCourse` da `DUPLICATE` en `tutorIds` desde la segunda fila con el mismo profesor; `courseErrorsFromServer` traduce `classes[<i>].tutorId` a la fila
- [x] 6.4 Implementar en `validation/courseValidation.ts` `CourseDraft.classes[i].tutorId`, `CourseErrors.tutorIds` y las reglas

## 7. Frontend: textos, formulario y página

- [x] 7.1 Añadir los textos del tutor en la edición (`courses.form.tutor`, `tutorOf` por fila, `noTutorOption`, `noProfessors` con el enlace, `professorsUnavailable`, `professorsRetry`, `professorAlreadyTutor` y los errores `tutorId.*`) a `es.json` y `en.json`, y comprobar `locales.test.ts`
- [x] 7.2 Tests que fallan (`CourseForm.test.tsx`): con `tutorOptions`, un desplegable por fila (también las nuevas) con etiqueta «Tutor» y nombre «Tutor de la clase N», empezando en el tutor guardado o «Sin tutor»; el cuerpo enviado lleva `tutorId` en cada clase (`null` para «Sin tutor»); volver a elegir el mismo no habilita «Guardar»; `DUPLICATE` en la segunda fila con foco y sin enviar, sin cambiar la otra; sin profesores, solo «Sin tutor» y el enlace a «Crear profesor»; sin `tutorOptions`, el texto de solo lectura y sin `tutorId` en el cuerpo; que `tutorOptions` llegue después de montar conserva lo escrito; `tutorTaken` marca las filas con un profesor que ya no está entre las opciones y lleva el foco a la primera; `axe` con desplegables, con errores y sin profesores
- [x] 7.3 Implementar el desplegable de tutor en `components/CourseForm.tsx` (`tutorOptions`, `tutorId` por fila, `tutorTaken` en `CourseSubmitResult`)
- [x] 7.4 Tests que fallan (`EditCoursePage.test.tsx`): pide los profesores una sola vez (también con `StrictMode`); las opciones son «Sin tutor», los profesores sin clase y los de este curso con su clase («Ana García · clase A»), sin los de otro curso; si fallan, el tutor de solo lectura con el aviso y «Reintentar», que al cargar muestra los desplegables; un `409 PROFESSOR_ALREADY_TUTOR` muestra el aviso, vuelve a pedir los profesores y marca la fila; `axe` con los profesores no disponibles
- [x] 7.5 Implementar en `pages/EditCoursePage.tsx` la carga de los profesores, el cálculo de las opciones y el `409`

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests que fijan que el `PUT` ignora `tutorId` o que la edición solo muestra el tutor como texto (`updateCourseRequest.test.ts`, `courses.int.test.ts`, `prismaCourseRepository.int.test.ts`, `CourseForm.test.tsx`, `EditCoursePage.test.tsx`, `App.test.tsx`) y actualizarlos solo donde cambia el comportamiento
- [x] 8.2 Revisar los E2E que editan cursos o miran el tutor en la edición (`courses.cy.ts` y `professors.cy.ts`, que comprueba «Tutor: Ana García» en la fila de la edición)

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de `calendarschool` y `calendarschool_test` (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses`, `classes` y `professors` por esquema)
- [x] 9.2 Ejecutar los tests de los módulos modificados del backend y del frontend
- [x] 9.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 9.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 9.5 Crear el informe `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Con el backend local (captcha falso, cuerpos UTF-8 desde fichero): registrar dos colegios; dos cursos con dos clases y tres profesores; `PUT` asignando, cambiando y quitando (`200`, verificado con `GET /api/courses` y `GET /api/professors`); mover A→B e intercambiar A↔B en un `PUT`; quitar una clase y pasar su tutor a otra; tutor en una clase nueva; un `PUT` sin `tutorId` que renombra y añade (tutores intactos); profesor de otro curso (`409 PROFESSOR_ALREADY_TUTOR`, sin cambiar el nombre enviado); de otro colegio y un UUID inexistente (`400 NOT_FOUND` en `classes[<i>].tutorId`); id inválido y duplicado (`400`); dos `PUT` simultáneos de cursos distintos con el mismo profesor (`200` y `409`); sin token (`401`); los eventos `COURSE_UPDATED` con `tutors_changed` y `COURSE_UPDATE_REJECTED` con sus motivos, sin nombres
- [x] 10.2 Borrar los datos creados (`professors` antes que `schools`), comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir los casos de los tutores desde la edición (en `professors.cy.ts` o en una spec nueva): asignar el tutor de una clase y verlo en «Tutores» de `/cursos` y en `/profesores`; intercambiar los tutores de dos clases en un guardado; un profesor que la API asigna a una clase de otro curso entre abrir el formulario y guardar da el aviso y marca la fila; la edición a 360 px sin desplazamiento horizontal. Ajustar el paso de `professors.cy.ts` que comprobaba el tutor como texto en la edición
- [x] 11.2 Ejecutar en modo headless las specs tocadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (escribir una relación 1:1 con índice único en dos fases dentro de una edición, y traducir la violación del índice en una carrera) y `docs/frontend-standards.md` (un desplegable por fila cuyas opciones vienen de otro recurso, con modo de solo lectura si falla, y un conflicto que recarga las opciones y marca la fila)
- [x] 12.2 Actualizar `backend/CLAUDE.md` y `frontend/CLAUDE.md` (tutor desde la edición), `CLAUDE.md` raíz (estado), `README.md` (si cambia el árbol), `MODELO_DATOS.md` (cómo se escribe `classes.tutor_id` desde la edición) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: el flujo de la edición, los componentes y los contadores de tests)
- [x] 12.3 Añadir a las fichas de US12 y US13 en `docs/User_Stories_MVP.md` las notas de lo que heredan de US09_b (el tutor también se cambia desde el curso, el plan con `tutors` y `PROFESSOR_ALREADY_TUTOR`)
- [x] 12.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.5 Verificar con `openspec validate us09b-elegir-tutor --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [ ] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático (sin migraciones pendientes) y su smoke test
- [ ] 13.2 Comprobar en producción con `curl` que `/cursos/<id>/editar` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `PUT /api/courses/<id>` sin token responde `401`, y que la persona usuaria, con un navegador real, asigna, cambia, intercambia y quita tutores desde la edición, en escritorio y en el móvil, sin violaciones de CSP
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
