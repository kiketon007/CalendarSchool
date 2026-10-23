## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us18-borrar-alumno` desde `main` actualizada, llevando los artefactos de este cambio y la ficha US18 de `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `deleteStudent` (`DELETE /api/students/{id}`, parámetro `StudentId`, Bearer, sin cuerpo, `200` con `DeleteStudentResponse` y `Cache-Control: no-store`, `401`, `404` con `StudentNotFound`, `500`, `503`, la descripción del borrado real, el bloqueo y la concurrencia) y el esquema `DeleteStudentResponse` (`{ deleted: { id } }`)
- [x] 1.2 Regenerar los tipos (`npm run api:types -w frontend`) y fijar en `api/schema.test.ts` la operación y `DeleteStudentResponse` (test que falla antes de regenerar)

## 2. Backend: dominio y aplicación

- [x] 2.1 Añadir `delete(schoolId, studentId): Promise<boolean>` al puerto `StudentRepository`, con su JSDoc (borrado real, bloqueo de la fila, `false` si no está en el colegio)
- [x] 2.2 Tests que fallan (`deleteStudent.test.ts`): `true` → `STUDENT_DELETED` con `school_id`, `actor_id` y `student_id` y nada más; `false` → `StudentNotFound` sin evento; el error del repositorio se propaga sin evento
- [x] 2.3 Implementar `application/students/deleteStudent.ts` (`DeleteStudent`)

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaStudentRepository.int.test.ts`): `delete` borra la fila y devuelve `true` sin tocar el curso, la clase ni otros alumnos; `false` para otro colegio, inexistente y ya borrado, sin borrar nada; atomicidad con un disparador temporal `BEFORE DELETE` que lanza un error (el alumno sigue igual)
- [x] 3.2 Implementar `PrismaStudentRepository.delete` según el diseño (decisión 3: `SELECT … FOR UPDATE` filtrando por colegio y `delete` en una transacción, con `translateDatabaseErrors`)
- [x] 3.3 Tests de integración de concurrencia: dos `delete` simultáneos (uno `true` y otro `false`); `delete` y `update` simultáneos del mismo alumno (si el borrado confirma primero, `update` devuelve `null`); `delete` del alumno y de su curso a la vez, repetido varias veces, sin errores ni interbloqueos

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`studentsRoute.test.ts`): `DELETE /:id` con `200 { deleted: { id } }` y `Cache-Control: no-store`, `404` para un `id` no UUID sin llamar al caso de uso y para `StudentNotFound`, `401` sin token, `503` con la base de datos caída
- [x] 4.2 Implementar la ruta `DELETE /:id` en `studentsRouter` con `parseStudentId` y conectar `DeleteStudent` en `app.ts`, `composeApp.ts` y los dobles de `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración por HTTP (`students.int.test.ts`): borrar con la base real y que desaparece de `GET /api/students` y `GET /api/students/{id}` da `404`; `MEMBER`; aislamiento entre colegios (`404` sin borrar); borrado repetido `404`; `id` mal formado `404`; sin sesión `401`; y que ningún log contiene el nombre, los apellidos ni el tipo de comida

## 5. Frontend: servicio y textos

- [x] 5.1 Tests que fallan (`studentsService.test.ts`): `delete` envía `DELETE` sin cuerpo a `/api/students/<id>` y devuelve `deleted` (`200` con la forma esperada), `notFound` (`404`), `unauthenticated` (`401`) y `unavailable` (`503`, error de red o `200` con otra forma)
- [x] 5.2 Implementar `studentsService.delete` y el tipo `DeleteStudentOutcome`
- [x] 5.3 Añadir a `es.json` y `en.json` los textos `students.delete.*` (título, aviso de que no se puede deshacer, «Cancelar», «Borrar alumno», «Borrando…», fallo, eliminado y ya no existe), `students.deleteLabel` y `students.deleteButton`

## 6. Frontend: diálogo

- [x] 6.1 Tests que fallan (`DeleteStudentModal.test.tsx`): cerrado con `null`; abierto con el título y el aviso, el foco en «Cancelar», sin «X» y sin ninguna petición; «Cancelar» y Escape llaman a `onCancel` sin petición; confirmar envía un único `DELETE` aunque se pulse dos veces, con «Borrando…», botones deshabilitados y Escape sin efecto; `deleted` → `onDeleted`; `notFound` → `onGone`; `unavailable` → `role="alert"` con el fallo y reintento; el error se limpia al reabrir con otro alumno; `axe` abierto, borrando y con error
- [x] 6.2 Implementar `components/DeleteStudentModal.tsx` según el diseño (decisión 6)

## 7. Frontend: listado

- [x] 7.1 Tests que fallan (`StudentsPage.test.tsx`, a 1280 y 360 px con `describe.each`): botón «Borrar» con nombre accesible junto a «Editar» en filas y tarjetas; abrir el diálogo con «Nombre Apellidos»; tras borrar, el alumno desaparece sin volver a pedir la lista, el total baja, se ve «Alumno «X» eliminado» en lugar del aviso de llegada y el foco pasa al título; la URL (`?comedor=si&pagina=2`) y el texto de búsqueda no cambian; la última fila de la última página muestra la anterior; el último alumno muestra el vacío; el último alumno del curso filtrado deja el filtro aplicado con «No hay alumnos que coincidan con los filtros» y la opción del curso en el desplegable; `404` → «Ese alumno ya no existe» y la lista se vuelve a pedir; cancelar devuelve el foco al botón
- [x] 7.2 Implementar en `pages/StudentsPage.tsx` el botón, el diálogo, el catálogo de la lista tal como se cargó (`catalog` para la URL y los desplegables, `students` para las filas), el aviso de página con prioridad sobre el de llegada y el foco al título (decisión 7)

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `StudentsPage` (avisos de llegada y validación de la URL con el catálogo), `studentsService`, `studentsRoute`, `students.int.test.ts`, `prismaStudentRepository.int.test.ts`, `utils/studentFilters` y los E2E de `students.cy.ts` que miran la columna «Acciones», y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), comprobando el código de salida y que no hay errores «Unhandled»
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local y comprobar con `curl`: `DELETE /api/students/{id}` (`200 { deleted: { id } }` con `no-store`; después `GET /api/students/{id}` `404` y el listado sin el alumno; borrado repetido `404`; otro colegio `404` sin borrar; `abc` `404`; sin token `401`; un `MEMBER` puede borrar) y que el log solo tiene `STUDENT_DELETED` con identificadores
- [x] 10.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir a `students.cy.ts`, con alumnos creados por la API: borrar desde `/alumnos?comedor=si&pagina=2` conservando la URL, con el aviso y el foco en el título; cancelar con Escape y el foco de vuelta en «Borrar»; el alumno borrado por la API antes de confirmar («Ese alumno ya no existe»); el último alumno de un curso filtrado (filtro conservado y resultado vacío); un `MEMBER` que borra; el diálogo abierto a 360 px sin desplazamiento horizontal
- [x] 11.2 Ejecutar en modo headless `students.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` si validar la URL de un listado contra la lista tal como se cargó (y no contra la actual) es un patrón nuevo que conviene recoger; `docs/backend-standards.md` no cambia (el borrado es el patrón de US13)
- [x] 12.2 Actualizar `backend/CLAUDE.md` (borrado de alumnos y su bloqueo), `frontend/CLAUDE.md` (borrado de alumnos y catálogo de filtros), `README.md` (árbol y endpoints de la §4), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y la ficha de US18 en `docs/User_Stories_MVP.md` si cambió algo durante la implementación
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.4 Verificar con `openspec validate us18-borrar-alumno --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [x] 13.2 Comprobar en producción con `curl` que `/alumnos` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `DELETE /api/students/<id>` sin token responde `401` (sin crear ni borrar datos), y que la persona usuaria, con un navegador real, borra un alumno desde un listado filtrado y la URL se conserva, en escritorio y en el móvil, sin violaciones de CSP
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
