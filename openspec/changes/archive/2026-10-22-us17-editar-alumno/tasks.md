## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us17-editar-alumno` desde `main` actualizada (llevando los artefactos de este cambio y la ficha US17 de `docs/User_Stories_MVP.md`, hoy en `docs/us17-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `getStudent` y `updateStudent` (`/api/students/{id}`, `id` UUID, Bearer, respuestas `200 { student }`, `400` solo en `PUT`, `401`, `404`, `500`, `503`, `Cache-Control: no-store`) y el esquema `UpdateStudentRequest` (estado final, mismas reglas que el alta)
- [x] 1.2 Regenerar los tipos (`npm run api:types -w frontend`) y fijar en `api/schema.test.ts` las dos operaciones y `UpdateStudentRequest` (test que falla antes de regenerar)

## 2. Backend: dominio y aplicación

- [x] 2.1 Añadir `StudentNotFound` a `domain/student/studentErrors.ts`, traducirlo a `404 NOT_FOUND` en `errorHandler` (test que falla primero) y añadir `findById` y `update` (con `StudentUpdate { before, after }`) al puerto `StudentRepository`
- [x] 2.2 Tests que fallan: `parseUpdateStudentRequest` con la tabla `student-fields.json` (un `describe.each` sobre los parsers de alta y edición) y el estado final (`classId`, `foodType` y `observations` ausentes = `null`); implementarlo delegando en `parseCreateStudentRequest`
- [x] 2.3 Tests que fallan (`getStudent.test.ts`): devuelve el alumno con datos sensibles; `null` del repositorio → `StudentNotFound`, sin evento; implementar `application/students/getStudent.ts`
- [x] 2.4 Tests que fallan (`updateStudent.test.ts`): `400` de validación sin evento ni llamada al repositorio; `null` → `StudentNotFound` y `STUDENT_UPDATE_REJECTED { reason: 'not_found' }`; `CourseNotFound`/`ClassNotFound` → el `400` del alta y `reason: course_not_found | class_not_found`; `STUDENT_UPDATED` con `changed_fields` en el orden del alta, `has_class` y `cafeteria`, sin nombres ni datos sensibles
- [x] 2.5 Implementar `application/students/updateStudent.ts`, extrayendo de `createStudent.ts` la conversión de `CourseNotFound`/`ClassNotFound` a `ValidationError` para compartirla (los tests del alta siguen pasando)

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaStudentRepository.int.test.ts`): `findById` con datos sensibles, alumno sin curso, otro colegio e inexistente (`null`)
- [x] 3.2 Implementar `PrismaStudentRepository.findById`
- [x] 3.3 Tests de integración que fallan: `update` cambia nombre, curso, clase, comedor (beca y tipo de comida a `null`) y observaciones y devuelve `before`/`after`; reasigna un alumno sin curso; otro colegio o inexistente → `null`; curso de otro colegio → `CourseNotFound`; clase de otro curso → `ClassNotFound`, sin cambios; atomicidad con un disparador temporal que hace fallar el `UPDATE`
- [x] 3.4 Implementar `PrismaStudentRepository.update` según el diseño (decisión 4: curso `FOR SHARE` antes que alumno `FOR UPDATE` y `404` del alumno con prioridad)
- [x] 3.5 Tests de integración de concurrencia: `PUT` y `DELETE` del curso destino a la vez, repetido varias veces, sin errores inesperados y con un resultado coherente (rechazo con `CourseNotFound` o alumno sin curso); dos `update` simultáneos del mismo alumno terminan sin error y con uno de los dos estados

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`studentsRoute.test.ts`): `GET /:id` y `PUT /:id` con `200` y `Cache-Control: no-store`, `404` para un `id` no UUID y para `StudentNotFound`, `400` de validación y de curso o clase, `401` sin token, `503` con la base de datos caída
- [x] 4.2 Implementar en `studentsRouter` las dos rutas con `parseStudentId` y conectar los casos de uso en la raíz de composición y en los dobles de `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración por HTTP (`students.int.test.ts`): leer y editar con la base real, `MEMBER`, aislamiento entre colegios (`404` sin cambios), clase de otro curso (`400`), reasignar un alumno sin curso, y que ningún log contiene nombres ni datos sensibles

## 5. Frontend: servicio y validación

- [x] 5.1 Tests que fallan (`studentsService.test.ts`): `get` (`ok`, `notFound`, `failed` y forma incorrecta con la guarda de `Student`) y `update` (`ok`, `validationError`, `notFound`, `failed`), con el cuerpo de estado final
- [x] 5.2 Implementar `studentsService.get` y `update`, extrayendo el cuerpo que se envía (`toStudentBody`, que comparten el alta y la edición)
- [x] 5.3 Tests que fallan y luego implementación de `hasStudentChanges` en `validation/studentValidation.ts` (compara lo que enviaría `toStudentBody` con los dos valores ya limpios: espacios, «Sí → No → Sí», cambio y vuelta, curso, clase, beca, tipo de comida, observaciones)

## 6. Frontend: formulario y textos

- [x] 6.1 Añadir a `es.json` y `en.json` los textos `students.edit.*` (título, carga, no encontrado, error, fallo al guardar), `students.updated`, `students.actions`, `students.editLabel` y `students.form.courseMissing`
- [x] 6.2 Tests que fallan (`StudentForm.test.tsx`): con `requireChanges`, «Guardar» deshabilitado sin cambios reales y habilitado con uno; con `courseMissingNotice`, el aviso ligado al curso por `aria-describedby` que desaparece al elegir curso; los tests del alta siguen pasando sin cambios
- [x] 6.3 Implementar `requireChanges` y `courseMissingNotice` en `components/StudentForm.tsx`

## 7. Frontend: páginas

- [x] 7.1 Tests que fallan (`EditStudentPage.test.tsx`): carga única con `StrictMode`; precarga desde `Student` (con y sin curso, con y sin comedor); `404` con enlace a «Alumnos»; error con «Reintentar»; cursos que no cargan; guardar con un único `PUT` y navegar con `replace` a `/alumnos` + `listSearch` con `studentUpdated`; sin estado o con `listSearch` no válido, a `/alumnos`; «Cancelar» al mismo destino; `400` en sus campos y `NOT_FOUND` de curso o clase; `404` y `503` al guardar; `axe` cargado, con errores y sin curso
- [x] 7.2 Implementar `pages/EditStudentPage.tsx`, la guarda `returnSearchFrom` y la ruta `/alumnos/:id/editar` en `App.tsx`
- [x] 7.3 Tests que fallan (`StudentsPage.test.tsx`, a 1280 y 360 px con `describe.each`): columna «Acciones» y enlace «Editar» con nombre accesible en filas y tarjetas, con `listSearch` en el estado (con filtros y sin ellos); aviso `studentUpdated` como texto plano que se conserva al filtrar; estado con otra forma sin aviso
- [x] 7.4 Implementar en `pages/StudentsPage.tsx` la columna «Acciones», el enlace en las tarjetas y el aviso de alumno actualizado

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `StudentsPage`, `CreateStudentPage`, `StudentForm`, `studentsService`, `createStudent`, `studentsRoute`, `App` y los E2E de `students.cy.ts` que miran la tabla (ahora con cuatro columnas) y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), comprobando el código de salida y que no hay errores «Unhandled»
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local y comprobar con `curl`: `GET /api/students/{id}` (`200` con datos sensibles y `no-store`, `404` para otro colegio, inexistente y `abc`, `401` sin token); `PUT` (`200` cambiando nombre, curso, clase y comedor; estado final sin `observations`; reasignar un alumno sin curso; `400` de validación, `NOT_ALLOWED`, clase de otro curso y curso de otro colegio; `404` de otro colegio; `401`); y que el log no contiene nombres ni datos sensibles
- [x] 10.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir a `students.cy.ts`, con alumnos creados por la API: editar el nombre desde `/alumnos?comedor=si` (o con página) y volver a la misma URL con el aviso; cambiar de curso (la clase vuelve a «Sin clase»); comedor a «No»; reasignar un alumno sin curso (curso borrado por la API); `id` inexistente; `MEMBER` que edita; 360 px sin desplazamiento horizontal
- [x] 11.2 Ejecutar en modo headless `students.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` (volver a un listado con filtros en la URL pasando su búsqueda en el estado de la navegación, con guarda y ruta fija) y `docs/backend-standards.md` si el orden de bloqueo (registro padre `FOR SHARE` antes que el hijo `FOR UPDATE`) no está ya recogido
- [x] 12.2 Actualizar `backend/CLAUDE.md` (lectura y edición de alumnos, orden de bloqueo), `frontend/CLAUDE.md` (edición de alumnos), `README.md` (árbol), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y la nota de US18 en `docs/User_Stories_MVP.md`
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.4 Verificar con `openspec validate us17-editar-alumno --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [x] 13.2 Comprobar en producción con `curl` que `/alumnos/<id>/editar` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `PUT /api/students/<id>` sin token responden `401`, y que la persona usuaria, con un navegador real, edita un alumno desde un listado filtrado y vuelve con los filtros, en escritorio y en el móvil, sin violaciones de CSP
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
