## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us08-borrar-curso` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US08 en `docs/User_Stories_MVP.md` y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio para implementar

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `GET /api/courses/{id}/impact` (`getCourseDeletionImpact`) y `DELETE /api/courses/{id}` (`deleteCourse`) con Bearer y el parámetro `CourseId`; los esquemas `CourseImpact` (`classCount` y `studentCount`, enteros ≥ 0, con la nota de que `studentCount` es `0` hasta US14), `CourseImpactResponse` y `CourseDeletedResponse`; respuestas `200`, `401`, `404` (`CourseNotFound`), `500` y `503`; ejemplos
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las dos operaciones y `CourseImpact` en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: dominio y aplicación

- [x] 2.1 Añadir el tipo `CourseImpact` (`domain/course/courseImpact.ts`) y `impactOf` y `delete` al puerto `CourseRepository` (devuelven `null` si el curso no está en el colegio)
- [x] 2.2 Tests que fallan (`getCourseDeletionImpact.test.ts`): pide el impacto en el colegio de la identidad; devuelve el impacto; `CourseNotFound` con `null`; deja pasar `DatabaseUnavailable`; no registra nada
- [x] 2.3 Implementar `GetCourseDeletionImpact`
- [x] 2.4 Tests que fallan (`deleteCourse.test.ts`): borra en el colegio de la identidad; devuelve lo borrado; registra `COURSE_DELETED` con `class_count` y `student_count`, sin nombres; `CourseNotFound` con `null`, sin evento; deja pasar `DatabaseUnavailable` sin evento
- [x] 2.5 Implementar `DeleteCourse`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`): `impactOf` cuenta las clases y devuelve `studentCount: 0` sin cambiar nada, y `null` para otro colegio o inexistente; `delete` borra el curso y sus clases y devuelve lo borrado, `null` para otro colegio (que sigue intacto) o inexistente; atomicidad (un fallo forzado deja todo); dos `delete` simultáneos dan un resultado y un `null`; un `update` y un `delete` simultáneos del mismo curso terminan sin error inesperado (el `update` posterior da `CourseNotFound`); `DatabaseUnavailable` con la base de datos caída
- [x] 3.2 Implementar `impactOf` y `delete` en `PrismaCourseRepository` (transacción interactiva con `SELECT … FOR UPDATE` filtrado por colegio, recuento de clases y `course.delete`; las clases caen por la cascada; `studentCount: 0` con un comentario que apunta a US14)

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`coursesRoute.test.ts`, con dobles): `GET /api/courses/:id/impact` `200` y `404`; `DELETE /api/courses/:id` `200` con lo borrado y `404`; un `id` que no es UUID responde `404` sin llamar al caso de uso; sin token, `401`; `503`; `MEMBER` admitido; el colegio y el autor salen de la identidad; `Cache-Control: no-store`
- [x] 4.2 Implementar las rutas en `coursesRouter.ts` y el cableado en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración HTTP (`courses.int.test.ts`): impacto y borrado de extremo a extremo (las clases desaparecen), `404` de otro colegio, inexistente y con id inválido, dos borrados simultáneos (`200` y `404`), un `PUT` después de borrar responde `404`, `MEMBER` borra, `401` y `503`

## 5. Frontend: servicio y textos

- [x] 5.1 Tests que fallan (`coursesService.test.ts`): `getImpact` → `loaded` (valida enteros ≥ 0), `notFound`, `unauthenticated`, `unavailable`; `delete` envía `DELETE` a la ruta codificada → `deleted` con lo borrado, `notFound`, `unauthenticated`, `unavailable`; nunca lanzan
- [x] 5.2 Implementar `getImpact` y `delete` en `services/coursesService.ts`
- [x] 5.3 Añadir los textos `courses.delete.*` (con plurales de clases, alumnos y alumnos sin clase) y `courses.actions.delete`/`deleteCourse` a `es.json` y `en.json`, y comprobar `locales.test.ts`

## 6. Frontend: diálogo y listado

- [x] 6.1 Tests que fallan (`DeleteCourseModal.test.tsx`): oculto sin curso; al abrir pide el impacto una vez (también con `StrictMode`) con «Cargando…» y «Borrar curso» deshabilitado; título, clases con plural, línea de alumnos solo con `studentCount > 0` y «Esta acción no se puede deshacer»; foco inicial en «Cancelar»; «Cancelar» y Escape llaman a `onCancel` sin enviar nada; impacto que falla con «Reintentar»; un solo `DELETE` con doble pulsación, «Borrando…» y botones deshabilitados; `onDeleted` con lo borrado; `onGone` con un `404` al pedir el impacto y al borrar; error al borrar dentro del diálogo, que sigue abierto; `axe` cargando, con el impacto, con error y con error al borrar
- [x] 6.2 Implementar `components/DeleteCourseModal.tsx`
- [x] 6.3 Tests que fallan (`CoursesPage.test.tsx`, a 1280 y 360 px): botón «Borrar {curso}» en cada fila y tarjeta; abre el diálogo de ese curso; tras borrar, la fila desaparece sin volver a pedir la lista, el aviso «Curso «X» eliminado» (con los alumnos sin clase solo si los hay) y el foco en el `h1`; con `onGone`, «Ese curso ya no existe» y se vuelve a pedir la lista; borrar el último curso muestra el estado vacío; al cancelar, el foco vuelve al botón; se actualizan los tests que esperaban cero botones; `axe` con el botón
- [x] 6.4 Implementar el botón, el diálogo, el aviso y el foco en `pages/CoursesPage.tsx`

## 7. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests que construyen o comprueban cursos y el listado (`coursesRoute.test.ts`, `prismaCourseRepository.int.test.ts`, `courses.int.test.ts`, `coursesService.test.ts`, `CoursesPage.test.tsx`, `App.test.tsx`, `appDoubles.ts`) y actualizarlos solo si cambia su comportamiento
- [x] 7.2 Revisar los E2E que miran el listado (`courses.cy.ts`: los que comprueban que no hay botones ni textos de «borrar»)

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de `calendarschool` y `calendarschool_test` (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses` y `classes` por esquema)
- [x] 8.2 Ejecutar los tests de los módulos modificados del backend y del frontend
- [x] 8.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 8.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 8.5 Crear el informe `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Con el backend local (captcha falso, cuerpos UTF-8 desde fichero): registrar dos colegios; crear un curso con tres clases; `GET …/impact` (`200`, `classCount: 3`, `studentCount: 0`, sin cambios en la base de datos); `DELETE` (`200` con lo borrado; el curso y sus clases ya no están en la base de datos); repetir el `DELETE` (`404`); `PUT` y `GET` del curso borrado (`404`); impacto y `DELETE` de un curso de otro colegio (`404`, el curso ajeno sigue) y de `abc` (`404`); sin token (`401`); el evento `COURSE_DELETED` sin nombres en el log
- [x] 9.2 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ampliar `courses.cy.ts`: un administrador borra un curso con tres clases desde «Borrar» (el diálogo dice «Se borrarán sus 3 clases» y el foco está en «Cancelar»), el curso desaparece con «Curso «…» eliminado» y no vuelve al recargar; «Cancelar» no borra nada; un curso borrado por la API entre abrir el diálogo y confirmar muestra «Ese curso ya no existe»; borrar el último curso deja el estado vacío; un `MEMBER` borra; 360 px con el diálogo abierto sin desplazamiento horizontal; ajustar los tests que comprobaban que no había botones ni «borrar»
- [x] 10.2 Ejecutar en modo headless `courses.cy.ts` (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (borrar un registro con hijos: bloqueo de la fila, recuento y borrado en la misma transacción y `200` con lo borrado) y `docs/frontend-standards.md` (diálogo de confirmación con impacto para una acción destructiva de un listado, y el foco tras quitar la fila)
- [x] 11.2 Actualizar `backend/CLAUDE.md` (borrado de cursos), `frontend/CLAUDE.md` (`DeleteCourseModal` y el botón «Borrar»), `CLAUDE.md` raíz (estado y endpoints), `README.md` (árbol de ficheros), `MODELO_DATOS.md` (borrado real con cascada y `studentCount` pendiente de US14) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL)
- [x] 11.3 Añadir a las fichas de US09 y US14 en `docs/User_Stories_MVP.md` las notas de lo que heredan de US08 (`ON DELETE SET NULL` del tutor y de la clase del alumno para no bloquear el borrado, y el recuento real de `studentCount` en el impacto y en el borrado)
- [x] 11.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 11.5 Verificar con `openspec validate us08-borrar-curso --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [ ] 12.1 Abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 12.2 Comprobar en producción con `curl` que `/cursos` sirve la SPA con la CSP, que el bundle contiene el diálogo de borrado y que `GET …/impact` y `DELETE /api/courses/<id>` sin token responden `401`, y que la persona usuaria, con un navegador real, borra un curso desde el diálogo en escritorio y en el móvil, sin violaciones de CSP
- [ ] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
