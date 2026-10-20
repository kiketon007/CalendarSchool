## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us09-crear-profesor` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, las fichas US09 y US09_b en `docs/User_Stories_MVP.md` y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio para implementar

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `POST /api/professors` (`createProfessor`) y `GET /api/professors` (`listProfessors`) con Bearer; los esquemas `CreateProfessorRequest`, `Professor`, `TutoredClass`, `TutorSummary`, `ProfessorResponse` y `ProfessorListResponse`; `SchoolClass.tutor` como `null` o `TutorSummary`; `CLASS_ALREADY_HAS_TUTOR` en el enum `ErrorCode`; `NOT_FOUND` en `FieldErrorCode`; respuestas `201`, `200`, `400`, `401`, `409`, `500` y `503`; ejemplos
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las dos operaciones, `Professor`, `TutorSummary` y el nuevo `SchoolClass.tutor` en `api/schema.test.ts` con `expectTypeOf`, y comprobar `npm run api:types:check -w frontend` (el `typecheck` del frontend fallará hasta la tarea 7.2, que actualiza el servicio de cursos)

## 2. Datos: migración

- [x] 2.1 En `backend/prisma/schema.prisma`: el enum `ProfessorPosition`, el modelo `Professor` (`@@map("professors")`, relación con `School` y con `SchoolClass`) y `SchoolClass.tutorId` (`@unique`, `onDelete: SetNull`); crear la migración con `npm run db:migrate` (nombre `add_professors`), revisar su SQL (índice único `classes_tutor_id_key`, FK con `ON DELETE SET NULL`, índice por `school_id`) y aplicarla a la base de desarrollo y a la de test
- [x] 2.2 Comprobar que los tests de `resetDatabase()` y de `cleanE2eData` siguen pasando (vacían todas las tablas salvo las conservadas, así que incluyen `professors`) y que `npm run typecheck -w backend` compila con el cliente de Prisma regenerado

## 3. Backend: dominio y errores

- [x] 3.1 Tests que fallan (`appError.test.ts`): `ERROR_CODES` contiene `CLASS_ALREADY_HAS_TUTOR` y coincide con el contrato; y tests de `errorHandler` (en el router de profesores, tarea 6.1) para el `409`
- [x] 3.2 Implementar `CLASS_ALREADY_HAS_TUTOR` en `ERROR_CODES` y `NOT_FOUND` en `FieldErrorCode` (`application/validationError.ts`)
- [x] 3.3 Crear `domain/professor/` (`Professor`, `ProfessorPosition`, `TutoredClass`, `NewProfessor`, el puerto `ProfessorRepository` con `create` y `listBySchool`, y los errores `ClassNotFound` y `ClassAlreadyHasTutor`), y en `domain/course/course.ts` el tipo `Tutor` y `SchoolClass.tutor: Tutor | null`

## 4. Backend: aplicación

- [x] 4.1 Crear la tabla `test-fixtures/professor-fields.json` (nombre, apellido, cargo y clase, con ejemplos válidos e inválidos y su código) y su lector `backend/test/support/professorFixtures.ts`; tests que fallan (`createProfessorRequest.test.ts`): recorren la tabla; ignoran propiedades desconocidas (`subjectIds`, `schoolId`, `email`); cargo ausente o `null` es «sin cargo»; devuelve un `{ field, code }` por campo inválido; un cuerpo que no es un objeto se trata como vacío
- [x] 4.2 Implementar `createProfessorRequest.ts` (reutilizando `USER_FIELD_SCHEMAS` para el nombre y el apellido)
- [x] 4.3 Tests que fallan (`createProfessor.test.ts`): valida y lanza `ValidationError` sin llamar al repositorio; genera el `id`; pasa los nombres limpios, el cargo y el `classId` con el colegio de la identidad; devuelve el profesor; `ClassNotFound` se convierte en `ValidationError` con `{ field: 'classId', code: 'NOT_FOUND' }` y deja `PROFESSOR_CREATION_REJECTED` con `reason: class_not_found`; `ClassAlreadyHasTutor` se relanza con `reason: class_has_tutor`; `PROFESSOR_CREATED` con `has_class` y `position`, sin nombres; `DatabaseUnavailable` pasa sin eventos
- [x] 4.4 Implementar `CreateProfessor`
- [x] 4.5 Tests que fallan (`listProfessors.test.ts`): pide los profesores del colegio de la identidad; los ordena por apellido y nombre en castellano («Álvaro» antes que «Ana», sin distinguir acentos ni mayúsculas); lista vacía; deja pasar `DatabaseUnavailable`
- [x] 4.6 Implementar `ListProfessors` (y generalizar la comparación por nombre de `courseOrdering.ts` si hace falta)

## 5. Backend: infraestructura

- [x] 5.1 Tests de integración que fallan (`prismaProfessorRepository.int.test.ts`, PostgreSQL real): `create` sin clase; con clase (la clase queda con su tutor y el profesor devuelve `tutoredClass` con el curso); `ClassAlreadyHasTutor` sin crear el profesor; `ClassNotFound` para una clase de otro colegio y para una inexistente, sin crear nada; atomicidad (la asignación falla y no queda el profesor); dos altas simultáneas con la misma clase (una gana, la otra `ClassAlreadyHasTutor`, un único profesor nuevo); homónimos; el índice único rechaza que un profesor tutorice dos clases; `listBySchool` solo del colegio, con y sin clase; `DatabaseUnavailable` con la base de datos caída
- [x] 5.2 Implementar `PrismaProfessorRepository` (transacción con el alta y el `updateMany` condicionado; `subjects: []` con un comentario que apunta a `US-PROF-ASSIGN`)
- [x] 5.3 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`): `listBySchool`, `findById` y `update` devuelven el `tutor` de cada clase; `create` devuelve `tutor: null`; `update` conserva el tutor de una clase renombrada y deja libre al de una clase quitada; `delete` de un curso con tutores deja a los profesores vivos y sin clase
- [x] 5.4 Implementar el `tutor` en `LIST_FIELDS`, `toCourse` y el resto de lecturas de `prismaCourseRepository.ts`, y adaptar los dobles y los tests de los casos de uso de cursos al nuevo tipo

## 6. Backend: presentación

- [x] 6.1 Tests que fallan (`professorsRoute.test.ts`, con dobles): `POST /api/professors` `201`, `400` con los campos, `409 CLASS_ALREADY_HAS_TUTOR`, `503`, `401`; `GET /api/professors` `200`, vacío, `401`, `503`; `ADMIN` y `MEMBER` admitidos; el colegio y el autor salen de la identidad; `Cache-Control: no-store`
- [x] 6.2 Implementar `professorsRouter.ts`, la traducción de `ClassAlreadyHasTutor` en `errorHandler.ts` y el cableado en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 6.3 Tests de integración HTTP (`professors.int.test.ts`): alta con y sin clase de extremo a extremo y el listado; la clase aparece con su tutor en `GET /api/courses`; `409` por una clase con tutor; `400` por una clase de otro colegio; altas simultáneas con la misma clase (`201` y `409`); editar un curso con tutores los conserva y borrar el curso deja libres a los profesores; `MEMBER` crea y lista; `401`; `503`

## 7. Frontend: servicios y validación

- [x] 7.1 Tests que fallan (`coursesService.test.ts`): una clase con tutor `{ id, firstName, lastName }` es válida en `list`, `get`, `create` y `update`; un tutor mal formado (sin `id`, con un nombre que no es texto) es `unavailable`
- [x] 7.2 Implementar el nuevo `SchoolClass.tutor` en `services/coursesService.ts` (y arreglar los tipos de los tests existentes)
- [x] 7.3 Tests que fallan (`professorsService.test.ts`): `list` → `loaded` (valida la forma, con `subjects: []` y `tutoredClass`), `unauthenticated`, `unavailable`; `create` envía `POST` con `firstName`, `lastName`, `position` y `classId` solo si hay valor → `created`, `validationError` con los campos, `classHasTutor` con `409 CLASS_ALREADY_HAS_TUTOR`, `unauthenticated`, `unavailable`; nunca lanzan
- [x] 7.4 Implementar `services/professorsService.ts`
- [x] 7.5 Tests que fallan (`professorValidation.test.ts`): recorren `professor-fields.json` (lector `frontend/src/testSupport/professorFixtures.ts`); `validateProfessor` da el error de cada campo; `professorErrorsFromServer` traduce `firstName`, `lastName`, `position` y `classId`
- [x] 7.6 Implementar `validation/professorValidation.ts` (reutilizando `validateField` del registro para el nombre y el apellido)

## 8. Frontend: textos y navegación

- [x] 8.1 Añadir los textos `professors.*` (listado, formulario, errores, avisos, cargos) y `header.professors`, y la etiqueta «Tutores» con tutor (`courses.tutorsOf`, `courses.tutorOf`), a `es.json` y `en.json`, y comprobar `locales.test.ts`
- [x] 8.2 Tests que fallan (`AppHeader.test.tsx` y `App.test.tsx`): «Profesores» visible para `ADMIN` y `MEMBER` entre «Cursos» y «Usuarios»; `aria-current="page"` en `/profesores` y `/profesores/nuevo`; las dos rutas bajo `AuthenticatedLayout` sin guarda de rol; un visitante sin sesión va a `/login`
- [x] 8.3 Implementar el enlace en `AppHeader.tsx` y las rutas en `App.tsx`

## 9. Frontend: páginas de profesores

- [x] 9.1 Tests que fallan (`ProfessorsPage.test.tsx`, a 1280 y 360 px): tabla con Nombre, Cargo y Clase y cabecera de fila; tarjetas con `h2`; «Director», «Jefe de estudios» o «Sin cargo»; «1º Primaria · A» o «Sin clase»; orden del servicio; carga única con `StrictMode`; error con «Reintentar»; vacío con «Crear profesor»; aviso de profesor creado como texto plano; sin acciones futuras; `axe` en cada estado
- [x] 9.2 Implementar `pages/ProfessorsPage.tsx`
- [x] 9.3 Tests que fallan (`CreateProfessorPage.test.tsx`): formulario con nombre, apellido, cargo y clase; las clases libres agrupadas por curso (sin las que tienen tutor); sin clases libres o sin cursos; si la carga de cursos falla, el campo de la clase se desactiva y se puede enviar; validación antes de enviar con foco en el primer error; una sola petición con doble pulsación; errores del servidor por campo; `409` en el campo de la clase; error general; navega a `/profesores` con el aviso; «Cancelar»; `axe` vacío, con errores y sin clases libres
- [x] 9.4 Implementar `pages/CreateProfessorPage.tsx`

## 10. Frontend: el tutor en las páginas de cursos

- [x] 10.1 Tests que fallan (`CoursesPage.test.tsx`, a los dos anchos): «Tutores» muestra «A: Ana García» (solo las clases con tutor, en orden), «Sin tutor» si ninguna lo tiene, y los nombres como texto plano
- [x] 10.2 Implementar la etiqueta de tutores en `pages/CoursesPage.tsx`
- [x] 10.3 Tests que fallan (`CourseForm.test.tsx` y `EditCoursePage.test.tsx`): cada fila de una clase existente muestra «Tutor: Ana García» o «Sin tutor»; el texto no forma parte del cuerpo del `PUT` ni cuenta como cambio (`Guardar` sigue deshabilitado); `axe`
- [x] 10.4 Implementar el tutor de solo lectura en `components/CourseForm.tsx` (`tutorName` en los valores iniciales, aparte del `CourseDraft`) y pasarlo desde `pages/EditCoursePage.tsx`

## 11. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 11.1 Revisar los tests que construyen o comprueban cursos o clases con `tutor: null` (`createCourse.test.ts`, `listCourses.test.ts`, `getCourse.test.ts`, `updateCourse.test.ts`, `coursesRoute.test.ts`, `courses.int.test.ts`, `prismaCourseRepository.int.test.ts`, `coursesService.test.ts`, `CoursesPage.test.tsx`, `EditCoursePage.test.tsx`, `CourseForm.test.tsx`, `App.test.tsx`) y actualizarlos solo si cambia su comportamiento
- [x] 11.2 Revisar los E2E que miran la cabecera o la columna «Tutores» (`courses.cy.ts`, `users.cy.ts`, `csp.cy.ts`, `invitation-acceptance.cy.ts`, que comprueba que un `MEMBER` no ve enlaces de administración)

## 12. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 12.1 Capturar la línea base de `calendarschool` y `calendarschool_test` con la migración ya aplicada (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses`, `classes` y `professors` por esquema)
- [x] 12.2 Ejecutar los tests de los módulos modificados del backend y del frontend
- [x] 12.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 12.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 12.5 Crear el informe `reports/YYYY-MM-DD-step-12-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 13. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Con el backend local (captcha falso, cuerpos UTF-8 desde fichero): registrar dos colegios; crear un curso con dos clases; `POST /api/professors` sin clase (`201`, `subjects: []`, `tutoredClass: null`), con cargo, con clase (`201`, `tutoredClass` con el curso), con la misma clase otra vez (`409 CLASS_ALREADY_HAS_TUTOR`, sin crear nada), con la clase de otro colegio y con un UUID inexistente (`400` en `classId`), con un `classId` mal formado, sin nombre, con un cargo no válido y con propiedades desconocidas (se ignoran); `GET /api/professors` (orden, solo el colegio propio) y `GET /api/courses` con el `tutor` en la clase; `PUT` del curso renombrando la clase (el tutor se conserva) y quitándola (el profesor queda sin clase); `DELETE` de un curso con tutor (el profesor sigue); altas simultáneas con la misma clase (`201` y `409`); sin token (`401`); el evento `PROFESSOR_CREATED` sin nombres en el log
- [x] 13.2 Borrar los datos creados (`professors` antes que `schools`), comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 13.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-13-curl-manual-testing.md`

## 14. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Crear `professors.cy.ts`: un administrador ve el listado vacío; crea un curso y un profesor con esa clase desde «Profesores», lo ve en el listado y como tutor en «Tutores» de `/cursos` y en la fila de la edición, y la clase deja de ofrecerse en el formulario; validación sin enviar nada; una clase que se asigna por la API entre abrir el formulario y enviar da el error en el campo; borrar un curso con tutor deja al profesor sin clase; un `MEMBER` crea un profesor; tabla a 1280 px y tarjetas a 360 px sin desplazamiento horizontal. Ajustar los pasos de `courses.cy.ts` que fijaban «Sin tutor» con tutores
- [x] 14.2 Ejecutar en modo headless `professors.cy.ts` y `courses.cy.ts` (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 14.3 Verificar y restaurar la base de datos de test
- [x] 14.4 Documentar el resultado en `reports/YYYY-MM-DD-step-14-e2e-cypress.md`

## 15. Documentación (MANDATORY)

- [x] 15.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (crear un registro y asignarle una relación 1:1 con un `UPDATE` condicionado en la misma transacción, sin bloqueos) y `docs/frontend-standards.md` (un formulario con un desplegable de opciones agrupadas cuyos datos vienen de otro recurso, y qué hacer si esa carga falla)
- [x] 15.2 Actualizar `backend/CLAUDE.md` (profesores y tutor de las clases), `frontend/CLAUDE.md` (páginas de profesores, «Tutores» y el tutor de solo lectura), `CLAUDE.md` raíz (estado y endpoints), `README.md` (árbol de ficheros), `MODELO_DATOS.md` (`professors` y `classes.tutor_id`) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: tablas, componentes, flujo y contadores de tests)
- [x] 15.3 Añadir a las fichas de US10, US11, US12, US13 y `US-PROF-ASSIGN` en `docs/User_Stories_MVP.md` las notas de lo que heredan de US09 (el listado mínimo que ampliar, `subjects: []`, `tutoredClass`, el borrado con `ON DELETE SET NULL`, la clase que se cambia al editar) y actualizar la nota de US09_b con lo construido
- [x] 15.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 15.5 Verificar con `openspec validate us09-crear-profesor --strict` que el cambio es válido

## 16. Despliegue y comprobación en producción

- [x] 16.1 Abrir la PR con los grupos 0–15 y, tras integrarla la persona usuaria, verificar el despliegue automático, **que la migración `add_professors` se aplica** (registro del paso de migraciones) y su smoke test
- [x] 16.2 Comprobar en producción con `curl` que `/profesores` y `/profesores/nuevo` sirven la SPA con la CSP, que el bundle contiene los textos de profesores y que `GET` y `POST /api/professors` sin token responden `401`, y que la persona usuaria, con un navegador real, crea un profesor con su clase, lo ve en el listado y como tutor en `/cursos`, en escritorio y en el móvil, sin violaciones de CSP
- [x] 16.3 Documentar el resultado en `reports/YYYY-MM-DD-step-16-production.md`
