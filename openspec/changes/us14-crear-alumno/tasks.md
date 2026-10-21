## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us14-crear-alumno` desde `main` actualizada (llevando los artefactos de este cambio y las fichas US14 y US14_b de `docs/User_Stories_MVP.md`, hoy en `docs/us14-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, las fichas y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `POST /api/students` (`createStudent`, `201`, `400`, `401`, `500`, `503`) y `GET /api/students` (`listStudents`, `200`, `401`, `500`, `503`), los esquemas `CreateStudentRequest`, `Student` y `StudentSummary` (con la nota de datos sensibles en `foodType` y `observations`), `NOT_ALLOWED` en `FieldErrorCode` y la nueva descripción de `studentCount` en `CourseImpact` y en la respuesta del borrado de cursos
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las operaciones y los esquemas en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend`

## 2. Base de datos

- [x] 2.1 Test de integración que falla (`schema.int.test.ts` o uno nuevo `studentsSchema.int.test.ts`): la tabla `students` con sus columnas, sus índices, los `CHECK` del comedor (beca o tipo de comida sin comedor y comedor sin beca se rechazan), `ON DELETE SET NULL` del curso y de la clase y la clave ajena del colegio
- [x] 2.2 Añadir el modelo `Student` (y las relaciones inversas en `School`, `Course` y `SchoolClass`) a `schema.prisma`, crear la migración `add_students` con `prisma migrate dev --create-only`, añadir a mano los dos `CHECK`, aplicarla a la base de desarrollo y comprobar que `prisma migrate diff` no ve deriva

## 3. Backend: dominio y aplicación

- [x] 3.1 Añadir `domain/student/` (tipos `Student`, `StudentSummary`, `NewStudent`; puerto `StudentRepository` con `create` y `listBySchool`; errores `CourseNotFound` y `ClassNotFound` del módulo), con JSDoc en castellano
- [x] 3.2 Crear `test-fixtures/student-fields.json` (válidos e inválidos de los ocho campos, con los límites 100/101, 255/256 y 5000/5001, saltos de línea y los casos de comedor `NOT_ALLOWED` y `REQUIRED`)
- [x] 3.3 Tests que fallan (`createStudentRequest.test.ts`): el parser recorre la tabla compartida, devuelve los errores en el orden de los campos, convierte los vacíos en `null`, exige la beca con comedor y rechaza beca y tipo de comida sin él con `NOT_ALLOWED`, e ignora las propiedades desconocidas
- [x] 3.4 Implementar `parseCreateStudentRequest` en `application/students/` sobre `USER_FIELD_SCHEMAS`; añadir `NOT_ALLOWED` a los códigos de campo del backend
- [x] 3.5 Tests que fallan (`createStudent.test.ts`, `listStudents.test.ts`): `CreateStudent` pasa el colegio de la identidad, genera un UUIDv7, traduce `CourseNotFound`/`ClassNotFound` a `400` con `NOT_FOUND` en su campo y registra `STUDENT_CREATED` o `STUDENT_CREATION_REJECTED` sin datos personales; `ListStudents` ordena por apellidos y nombre con `compareText`
- [x] 3.6 Implementar `CreateStudent` y `ListStudents`

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan (`prismaStudentRepository.int.test.ts`): alta con y sin clase, con y sin comedor (la lectura de vuelta con curso y clase); curso de otro colegio o inexistente (`CourseNotFound`); clase de otro curso, de otro colegio o inexistente (`ClassNotFound`); atomicidad con un disparador temporal; un alta y un borrado simultáneos del mismo curso (sin `500` ni alumno con curso inexistente); listado solo del colegio y sin `foodType` ni `observations`; base de datos inalcanzable (`DatabaseUnavailable`)
- [x] 4.2 Implementar `PrismaStudentRepository` según el diseño (decisión 3: `FOR SHARE` del curso, comprobación de la clase e `INSERT` en la misma transacción)
- [x] 4.3 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`): `impactOf` y `delete` cuentan los alumnos del curso (con y sin clase, sin contar los de otro curso); borrar el curso deja a sus alumnos sin curso ni clase; quitar una clase en `update` deja a sus alumnos en el curso sin clase y renombrarla no los mueve
- [x] 4.4 Sustituir `STUDENT_COUNT_UNTIL_US14` por el recuento real en `impactOf` y en `delete` de `PrismaCourseRepository`

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`studentsRoute.test.ts`): `POST /api/students` (`201`, `400` con los detalles, `401`, `503`, el colegio y el autor de la identidad) y `GET /api/students` (`200`, `401`, `503`)
- [x] 5.2 Implementar `presentation/students/studentsRouter.ts` con `requireAuthentication` y sin `requireRole`, y el cableado en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 5.3 Tests HTTP de integración (`students.int.test.ts`): alta y listado con la base real, `NOT_FOUND` del curso y de la clase, `NOT_ALLOWED`, un `MEMBER`, aislamiento entre colegios, sin sesión `401` y base caída `503`; y en `courses.int.test.ts`, el impacto y el borrado de un curso con alumnos

## 6. Frontend: servicio y validación

- [x] 6.1 Tests que fallan (`studentsService.test.ts`): `list` y `create` (cuerpo sin vacíos ni campos de comedor sin comedor, `created`, `validationError` con los campos, `unauthenticated`, `unavailable` también con cuerpos mal formados o error de red; nunca lanza)
- [x] 6.2 Implementar `services/studentsService.ts`
- [x] 6.3 Tests que fallan (`studentValidation.test.ts`): recorre `test-fixtures/student-fields.json`; `validateStudent` y `studentErrorsFromServer` con los ocho campos
- [x] 6.4 Implementar `validation/studentValidation.ts` sobre `validateField` del registro

## 7. Frontend: formulario, páginas y navegación

- [x] 7.1 Añadir a `es.json` y `en.json` los textos `students.*` (título, total, vacío, crear, columnas, «Sin clase», «Sin curso», comedor, formulario, ayuda de datos sensibles, contador, errores por campo y código, avisos y fallos), `header.students` y el cambio de `courses.delete.deletedWithStudents_*` a «quedan sin curso»
- [x] 7.2 Tests que fallan (`StudentForm.test.tsx`): campos y etiquetas; clases según el curso y reinicio al cambiarlo; comedor sin valor inicial y beca y tipo de comida solo con «Sí», descartados con «No»; contador; validación al salir y al enviar con foco en el primer error; doble envío con respuesta pendiente y «Guardando…»; errores del servidor por campo; cursos cargando, con error y vacíos; `axe`
- [x] 7.3 Implementar `components/StudentForm.tsx` según el diseño (decisión 6)
- [x] 7.4 Tests que fallan (`CreateStudentPage.test.tsx`): una sola petición de cursos con `StrictMode`; `201` navega a `/alumnos` con el aviso; `NOT_FOUND` del curso o de la clase vuelve a pedir los cursos, marca el campo con el foco y conserva lo escrito; fallo general con lo escrito conservado
- [x] 7.5 Implementar `pages/CreateStudentPage.tsx`
- [x] 7.6 Tests que fallan (`StudentsPage.test.tsx`, en 1280 y 360 px con `describe.each`): carga única, tabla y tarjetas con «Curso y clase» y «Comedor», orden del servidor, vacío, error con «Reintentar», aviso de llegada como texto plano con guarda de tipo, sin tipo de comida ni observaciones, `axe`
- [x] 7.7 Implementar `pages/StudentsPage.tsx`
- [x] 7.8 Tests que fallan y cambios en `App.tsx` (rutas `/alumnos` y `/alumnos/nuevo` bajo `AuthenticatedLayout`) y `AppHeader` («Alumnos» entre «Profesores» y «Usuarios», con `aria-current` en las subrutas); y en `CoursesPage`, el aviso «… quedan sin curso»

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests que fijan `studentCount: 0` o el texto «quedan sin clase» (`prismaCourseRepository.int.test.ts`, `courses.int.test.ts`, `CoursesPage`, `DeleteCourseModal`, `courses.cy.ts`), los de la navegación de `AppHeader` y `App`, y `schema.int.test.ts`, y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, ahora también `students`)
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local (con la migración aplicada) y crear por la API dos colegios con cursos y clases
- [x] 10.2 Probar con `curl` `POST /api/students`: completo; sin clase y sin comedor; campos inválidos (orden de los errores); beca sin comedor (`NOT_ALLOWED`); comedor sin beca (`REQUIRED`); clase de otro curso y curso de otro colegio (`NOT_FOUND`); sin token (`401`); y `GET /api/students` (orden, aislamiento y sin `foodType` ni `observations`)
- [x] 10.3 Probar el impacto y el borrado de un curso con alumnos (con y sin clase) y que esos alumnos quedan sin curso en el listado; y que quitar una clase en la edición del curso los deja sin clase
- [x] 10.4 Comprobar en el log `STUDENT_CREATED` y `STUDENT_CREATION_REJECTED` sin nombres, tipo de comida ni observaciones
- [x] 10.5 Borrar los datos creados (la limpieza incluye `students`), comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.6 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Crear `cypress/e2e/students.cy.ts`: crear un alumno con clase, comedor y beca y verlo en el listado; sin clase y sin comedor; validación antes de enviar; el curso que otra persona borra (por la API) antes de guardar; un `MEMBER` (tarea `createUser`); listado y formulario a 360 px sin desplazamiento horizontal; visitante sin sesión a `/login`
- [x] 11.2 Añadir a `courses.cy.ts` borrar un curso con alumnos: el diálogo los cuenta, el aviso dice que quedan sin curso y `/alumnos` los muestra «Sin curso»
- [x] 11.3 Ejecutar en modo headless las dos specs y después `npm run test:e2e` completo
- [x] 11.4 Verificar y restaurar la base de datos de test
- [x] 11.5 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` solo con lo nuevo (datos sensibles fuera de logs y listados; un campo que depende de otro con `NOT_ALLOWED` y `CHECK`; bloqueo compartido del padre al crear un hijo)
- [x] 12.2 Actualizar `backend/CLAUDE.md` y `frontend/CLAUDE.md`, el `CLAUDE.md` raíz (estado), `README.md` (árbol y funcionalidades), `MODELO_DATOS.md` (tabla `students` implementada y sus diferencias con v2.1) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL)
- [x] 12.3 Añadir a las fichas de US14_b, US15, US17 y US18 en `docs/User_Stories_MVP.md` las notas de lo que heredan de US14 (listado mínimo, `StudentForm`, alumnos sin curso, datos sensibles fuera del listado, sin `status`)
- [x] 12.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.5 Verificar con `openspec validate us14-crear-alumno --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [ ] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático (con la migración `add_students` aplicada) y su smoke test
- [ ] 13.2 Comprobar en producción con `curl` que `/alumnos` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `POST` y `GET /api/students` sin token responden `401`, y que la persona usuaria, con un navegador real, crea alumnos con y sin clase y comedor, los ve en el listado y borra un curso con alumnos, en escritorio y en el móvil, sin violaciones de CSP
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
