## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us07-editar-curso` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US07 en `docs/User_Stories_MVP.md` y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio para implementar

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `GET /api/courses/{id}` (`getCourse`) y `PUT /api/courses/{id}` (`updateCourse`) con Bearer y el parámetro `id`; el esquema `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID y `name`); la respuesta reutilizable `CourseNotFound`; el `409` de `PUT` con `COURSE_ALREADY_EXISTS` y `COURSE_CHANGED`; `COURSE_CHANGED` en el enum `ErrorCode`; ejemplos de `200`, `400` (con `classes[1].id`), `404` y `409`
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar `getCourse`, `updateCourse` y `UpdateCourseRequest` en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: dominio

- [x] 2.1 Añadir `COURSE_CHANGED` a `ERROR_CODES` (`presentation/http/appError.ts`) y comprobar que `appError.test.ts` pasa con el contrato
- [x] 2.2 Tests que fallan (`domain/course/courseUpdate.test.ts`): `planCourseUpdate` devuelve las clases quitadas, las renombradas (también si solo cambian mayúsculas, y no las que no cambian nada), las nuevas y si cambia el nombre del curso; un `id` pedido que no está entre las clases actuales lanza `CourseChanged`; sin cambios, un plan vacío
- [x] 2.3 Implementar `CourseNotFound` y `CourseChanged` en `domain/course/courseErrors.ts` y `planCourseUpdate` en `domain/course/courseUpdate.ts`; añadir `findById` y `update` (con el plan como parámetro) al puerto `CourseRepository`

## 3. Backend: aplicación

- [x] 3.1 Tests que fallan (`updateCourseRequest.test.ts`): las reglas de nombre y clases de US05 recorriendo `test-fixtures/course-fields.json`; `id` opcional; `id` que no es un UUID → `INVALID_FORMAT` en `classes[i].id`; `id` repetido → `DUPLICATE` en la segunda aparición; nombres repetidos → `DUPLICATE`; ignora propiedades desconocidas (`tutorId`, `schoolId`)
- [x] 3.2 Implementar `parseUpdateCourseRequest`, extrayendo de `createCourseRequest.ts` la validación compartida del nombre y de la lista de clases sin cambiar el comportamiento de `parseCreateCourseRequest` (sus tests siguen en verde)
- [x] 3.3 Extraer la ordenación de cursos y clases de `ListCourses` a un módulo compartido de `application/courses/` (tests de `listCourses.test.ts` en verde)
- [x] 3.4 Tests que fallan (`getCourse.test.ts`): devuelve el curso con las clases ordenadas; `CourseNotFound` si el repositorio no lo encuentra
- [x] 3.5 Implementar `GetCourse`
- [x] 3.6 Tests que fallan (`updateCourse.test.ts`): `ValidationError` sin llamar al repositorio; genera un `id` solo para las clases sin `id`; pasa los nombres limpios y normalizados y `planCourseUpdate`; devuelve las clases ordenadas; `COURSE_UPDATED` con `classes_added`, `classes_removed` y `classes_renamed`, sin nombres; sin cambios, sin evento; `COURSE_UPDATE_REJECTED` con `reason: duplicate` y `reason: changed`, y relanza el error; `CourseNotFound` se relanza sin evento
- [x] 3.7 Implementar `UpdateCourse`

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`): `findById` con un curso del colegio, de otro colegio y uno inexistente; `update` cambia el nombre y el `updated_at`, conserva los `id` al renombrar, borra las ausentes, crea las nuevas, intercambia A↔B, reutiliza el nombre de una clase quitada, cambia solo las mayúsculas del propio curso; `CourseAlreadyExists` con un nombre de otro curso del colegio sin cambiar nada; `CourseChanged` con un `id` de clase borrada o de otro curso sin cambiar ningún curso; `CourseNotFound` con un curso de otro colegio; atomicidad (un fallo forzado a mitad deja todo como estaba); sin cambios no escribe (`updated_at` igual); `DatabaseUnavailable` con la base de datos caída
- [x] 4.2 Implementar `findById` y `update` en `PrismaCourseRepository`: `$transaction` interactivo, `SELECT … FOR UPDATE` de la fila del curso con `schoolId`, lectura de las clases, `plan`, borrado, renombrado en dos fases con nombres temporales `#<i>`, alta, actualización del curso y lectura final; traducción del índice único del curso a `CourseAlreadyExists` y de los fallos de conexión con `translateDatabaseErrors`

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`coursesRoute.test.ts`, con dobles): `GET /api/courses/:id` `200` y `404`; `PUT` `200` con el curso, `400` con `details`, `404`, `409 COURSE_ALREADY_EXISTS` y `409 COURSE_CHANGED`; un `id` que no es UUID responde `404` sin llamar al caso de uso; sin token, `401`; `MEMBER` admitido; el colegio y el autor salen de la identidad
- [x] 5.2 Implementar las rutas en `coursesRouter.ts`, la traducción de `CourseNotFound` y `CourseChanged` en `errorHandler.ts`, y el cableado en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 5.3 Tests de integración HTTP que fallan (`courses.int.test.ts`): `GET` y `PUT` de extremo a extremo (renombrar conserva el `id`, añadir y quitar, intercambio, reutilizar nombre, mayúsculas del propio curso, `409` de los dos tipos sin cambios en la base, `404` de otro colegio y con id inválido, `401`, `503`); dos `PUT` simultáneos (uno quita «B» y otro la renombra) sin ningún `500` y con el estado final de la última respuesta `200`; `MEMBER` lee y edita

## 6. Frontend: servicio

- [x] 6.1 Tests que fallan (`coursesService.test.ts`): `get` → `loaded` (valida la forma, con `createdAt` y `tutor: null`), `notFound`, `unauthenticated`, `unavailable`; `update` envía `PUT` con `{ name, classes: [{ id?, name }] }` (sin `id` en las nuevas) → `updated`, `validationError` con los campos, `alreadyExists`, `courseChanged`, `notFound`, `unauthenticated`, `unavailable`; nunca lanzan
- [x] 6.2 Implementar `get` y `update` en `services/coursesService.ts`

## 7. Frontend: formulario común

- [x] 7.1 Extraer `components/CourseForm.tsx` de `CreateCoursePage` (valores iniciales con el `id` opcional de cada clase, `onSubmit` que devuelve el resultado interpretado, `submitDisabled`, guarda síncrona, foco, `aria-*`, filas con `key` estable) sin cambiar `CreateCoursePage.test.tsx`, que debe seguir en verde
- [x] 7.2 Tests que fallan (`CourseForm.test.tsx`): las filas iniciales conservan su `id` y lo devuelven en `onSubmit` aunque cambien de nombre o se quiten otras; las filas nuevas no llevan `id`; `submitDisabled` deshabilita «Guardar»
- [x] 7.3 Completar `CourseForm` para que pasen
- [x] 7.4 Tests que fallan (`utils/courseChanges.test.ts` o en la validación): `hasCourseChanges` es falso con los mismos valores, con espacios sobrantes y tras volver al valor original, y cierto al cambiar el nombre, una clase, el número de filas o el orden
- [x] 7.5 Implementar `hasCourseChanges`

## 8. Frontend: página de edición y listado

- [x] 8.1 Añadir los textos `courses.edit.*` (título, no disponible, error al cargar, curso cambiado, «Recargar», error al guardar), `courses.actions.*` («Acciones», «Editar», «Editar {nombre}») y `courses.updated` a `es.json` y `en.json`, y comprobar `locales.test.ts`
- [x] 8.2 Tests que fallan (`EditCoursePage.test.tsx`): carga única con `StrictMode` e indicador; formulario relleno; «Guardar» deshabilitado sin cambios reales y durante el envío; un solo `PUT` con los `id`; con `updated`, navega a `/cursos` con `replace` y `{ courseUpdated }`; `validationError` marca los campos; `alreadyExists` marca el nombre con el foco; `courseChanged` muestra el aviso y «Recargar», que vuelve a pedir el curso y rellena lo guardado; `notFound` al cargar y al guardar; `unavailable` al cargar con «Reintentar» y al guardar conservando lo escrito; «Cancelar» vuelve a `/cursos` sin enviar; `axe` cargada, con errores, no disponible y cambiado
- [x] 8.3 Implementar `pages/EditCoursePage.tsx` y la ruta `/cursos/:id/editar` en `App.tsx` bajo `AuthenticatedLayout`
- [x] 8.4 Tests que fallan (`CoursesPage.test.tsx`, a 1280 y 360 px): columna «Acciones» en la tabla y enlace en cada tarjeta, con el nombre «Editar {nombre}» y la ruta del curso; el aviso «Curso «X» actualizado» desde `{ courseUpdated }`; sigue sin botones de borrar ni horario; `axe` con la columna nueva. En `AppHeader.test.tsx` o `App.test.tsx`: «Cursos» con `aria-current="page"` en `/cursos/<id>/editar`
- [x] 8.5 Implementar la columna, el enlace de las tarjetas y el aviso en `pages/CoursesPage.tsx`

## 9. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 9.1 Revisar los tests que construyen o comprueban cursos (`createCourse.test.ts`, `createCourseRequest.test.ts`, `listCourses.test.ts`, `coursesRoute.test.ts`, `prismaCourseRepository.int.test.ts`, `courses.int.test.ts`, `coursesService.test.ts`, `CreateCoursePage.test.tsx`, `CoursesPage.test.tsx`, `App.test.tsx`, `appError.test.ts`) y actualizarlos solo si cambia su comportamiento
- [x] 9.2 Revisar los E2E que miran la tabla de cursos (`courses.cy.ts`: columnas y celdas) por la columna nueva

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Capturar la línea base de `calendarschool` y `calendarschool_test` (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses` y `classes` por esquema)
- [x] 10.2 Ejecutar los tests de los módulos modificados del backend y del frontend
- [x] 10.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 10.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 10.5 Crear el informe `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Con el backend local (captcha falso, cuerpos con caracteres no ASCII desde un fichero UTF-8): registrar un administrador, iniciar sesión y renovar; crear un curso con «A», «B» y «C»; `GET /api/courses/{id}` (`200`); `PUT` que renombra el curso, intercambia «A» y «B», quita «C» y añade otra «C» (`200`, mismos `id` en A y B, `id` nuevo en «C», comprobado en la base de datos); `PUT` idéntico (`200`, `updated_at` sin cambios); `PUT` con el `id` de la «C» quitada (`409 COURSE_CHANGED`, sin cambios); renombrar a un nombre de otro curso (`409 COURSE_ALREADY_EXISTS`); `id` de clase inválido (`400`); curso de otro colegio y id `abc` (`404`); sin token (`401`)
- [x] 11.2 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Ampliar `courses.cy.ts`: un administrador pulsa «Editar», cambia el nombre, renombra una clase, añade una y quita otra, guarda y ve «Curso «…» actualizado» y los cambios en el listado; renombrar a un nombre ya usado muestra el error en el campo; con la página abierta, se quita una clase por la API y al guardar se ve el aviso de curso cambiado y «Recargar» muestra lo guardado; un `MEMBER` edita un curso; la edición a 360 px sin desplazamiento horizontal; y ajustar los pasos de la tabla a la columna «Acciones»
- [x] 12.2 Ejecutar en modo headless `courses.cy.ts` (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 12.3 Verificar y restaurar la base de datos de test
- [x] 12.4 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (colecciones hijas con identidad estable: estado final en un `PUT`, plan puro en el dominio, fila padre bloqueada y orden borrar → renombrar en dos fases → crear) y `docs/frontend-standards.md` si el formulario común de creación y edición o «Guardar» solo con cambios son reglas nuevas
- [x] 13.2 Actualizar `backend/CLAUDE.md` (edición de cursos), `frontend/CLAUDE.md` (`CourseForm`, `EditCoursePage`, acción «Editar»), `CLAUDE.md` raíz (estado y endpoints), `README.md` (árbol de ficheros), `MODELO_DATOS.md` (identidad estable de las clases y orden de operaciones) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL)
- [x] 13.3 Añadir a las fichas de US08, US09 y US14 en `docs/User_Stories_MVP.md` las notas de lo que heredan de US07 (la acción «Borrar» junto a «Editar»; el tutor en el formulario de edición; la confirmación al quitar una clase con alumnos)
- [x] 13.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 13.5 Verificar con `openspec validate us07-editar-curso --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [ ] 14.1 Abrir la PR con los grupos 0–13 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 14.2 Comprobar en producción con `curl` que `/cursos/<id>/editar` sirve la SPA con la CSP y que `GET` y `PUT /api/courses/<id>` sin token responden `401`, y que la persona usuaria, con un navegador real, edita un curso (nombre y clases) desde «Editar» en escritorio y en el móvil, sin violaciones de CSP
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
