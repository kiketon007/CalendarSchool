## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us05-crear-cursos` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US05 y las notas de US06, US07, US09 y US13 en `docs/User_Stories_MVP.md`, el PRD §3.4 y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio para implementar

## 1. Contrato de la API

- [x] 1.1 Añadir a `docs/api-spec.yml` los esquemas `CreateCourseRequest` (`name`, `classes[]` con `name`), `SchoolClass` (`id`, `name`, `tutor` nulo), `Course` (`id`, `name`, `classes`), `CourseCreatedResponse` y `CoursesListResponse`; `DUPLICATE` en `FieldErrorCode`; `COURSE_ALREADY_EXISTS` en `ErrorCode`; y las rutas con Bearer `POST /api/courses` (`createCourse`: `201`, `400`, `401`, `409`, `500`, `503`) y `GET /api/courses` (`listCourses`: `200`, `401`, `500`, `503`), con la descripción de las reglas de los nombres, el máximo de 12 clases, el orden y que `tutor` es `null` hasta US09
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las dos operaciones y los esquemas en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: dominio

- [x] 2.1 Tests que fallan (`domain/course/courseNames.test.ts`): `normalizeName` recorta, colapsa los espacios y pasa a minúsculas sin quitar acentos ni `º`/`ª`; `cleanName` recorta y colapsa conservando las mayúsculas
- [x] 2.2 Implementar `domain/course/`: `courseNames.ts`, los tipos `Course` y `SchoolClass` (con `tutor: null`), el puerto `CourseRepository` (`create(schoolId, newCourse)` y `listBySchool(schoolId)`) y el error `CourseAlreadyExists`

## 3. Backend: modelo de datos y repositorio

- [x] 3.1 Añadir `Course` (`courses`) y `SchoolClass` (`classes`) a `backend/prisma/schema.prisma` con los índices únicos `(school_id, normalized_name)` y `(course_id, normalized_name)` (este último sirve también de índice por `course_id`) y `ON DELETE CASCADE`; generar la migración `add_courses_and_classes` con `prisma migrate dev`, revisar su SQL y aplicarla a la base de desarrollo
- [x] 3.2 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`): `create` guarda el curso y sus clases y los devuelve en el orden recibido con `tutor: null`; con el nombre normalizado ya usado en el colegio lanza `CourseAlreadyExists` sin dejar nada; el mismo nombre en otro colegio se crea; una clase repetida (que viole el índice de `classes`) no deja ni el curso ni ninguna clase; `listBySchool` devuelve solo los cursos del colegio con sus clases; un fallo de conexión se traduce a `DatabaseUnavailable`
- [x] 3.3 Implementar `infrastructure/prisma/prismaCourseRepository.ts` (escritura anidada, `select` explícito, `violatedUniqueIndex` con `courses_school_id_normalized_name_key` y `translateDatabaseErrors`)

## 4. Backend: aplicación

- [x] 4.1 Crear `test-fixtures/course-fields.json` con ejemplos válidos e inválidos (y su código) del nombre del curso, del nombre de clase y del número de clases, incluidos mayúsculas, espacios, `º`, `ª`, `-`, `/`, ñ, acentos, `<` y los límites 100, 10, 0, 12 y 13
- [x] 4.2 Tests que fallan (`createCourseRequest.test.ts`): recorre `course-fields.json`; un elemento `{ field, code }` por campo inválido sin parar en el primero, con `classes[<i>].name`; `DUPLICATE` en la segunda y siguientes clases con el mismo nombre normalizado; ignora las propiedades desconocidas (`tutorId`, `schoolId`)
- [x] 4.3 Implementar `application/courses/createCourseRequest.ts` (Zod) y añadir `DUPLICATE` a `FieldErrorCode`
- [x] 4.4 Tests que fallan (`createCourse.test.ts` y `listCourses.test.ts`, con dobles): `CreateCourse` genera un UUIDv7 por curso y por clase, guarda los nombres limpios y normalizados con el `schoolId` de la identidad, registra `COURSE_CREATED` (con `class_count` y sin nombres) y, ante `CourseAlreadyExists`, `COURSE_CREATION_REJECTED` con `reason: "duplicate"` y vuelve a lanzar el error; `ListCourses` ordena cursos y clases con `localeCompare('es', { numeric: true })` («2º» antes que «10º»)
- [x] 4.5 Implementar `application/courses/createCourse.ts` y `listCourses.ts`

## 5. Backend: presentación y composición

- [x] 5.1 Tests que fallan (`appError.test.ts` y `errorHandler.test.ts`): `COURSE_ALREADY_EXISTS` está en `ERROR_CODES` y en el contrato, y `CourseAlreadyExists` se traduce a `409`
- [x] 5.2 Implementar el código en `presentation/http/appError.ts` y la traducción en `errorHandler.ts`
- [x] 5.3 Tests que fallan (`app.test.ts`, con dobles): `POST /api/courses` responde `201` con el curso, `400` con los detalles, `409` y `401` sin token (con `WWW-Authenticate: Bearer`); `GET /api/courses` responde `200` con la lista y `no-store`; los dos admiten `ADMIN` y `MEMBER` y pasan el `schoolId` de la identidad
- [x] 5.4 Implementar `presentation/courses/coursesRouter.ts`, montarlo en `app.ts` bajo `/api/courses`, añadir los casos de uso a `AppDependencies`, cablearlos en `composeApp.ts` y actualizar `test/support/appDoubles.ts` y `realApp.ts`
- [x] 5.5 Test de integración de la aplicación real (`courses.int.test.ts`): `201` y persistencia; `GET` del colegio propio ordenado y sin los de otro colegio; `409` por nombre normalizado y `201` con el mismo nombre en otro colegio; dos `POST` simultáneos idénticos dan un `201` y un `409` y un solo curso; un `MEMBER` crea y lista; `401` sin token; `503` con la base de datos caída

## 6. Frontend: validación y servicio

- [x] 6.1 Tests que fallan (`validation/courseValidation.test.ts`): recorre `test-fixtures/course-fields.json` con el mismo resultado que el backend y detecta las clases repetidas
- [x] 6.2 Implementar `validation/courseValidation.ts`
- [x] 6.3 Tests que fallan (`services/coursesService.test.ts`): `list` devuelve `loaded`, `unauthenticated` o `unavailable`; `create` devuelve `created`, `validationError` con los detalles, `alreadyExists`, `unauthenticated` o `unavailable` (también ante un error de red, un `500` o una respuesta desconocida); usa `authorizedFetch` y nunca lanza
- [x] 6.4 Implementar `services/coursesService.ts`

## 7. Frontend: páginas, rutas y navegación

- [x] 7.1 Tests que fallan (`CoursesPage.test.tsx`): una sola petición también con `StrictMode`; `role="status"` mientras carga; cursos con un `h2` y sus clases «A — Sin tutor»; vacío con «Todavía no hay cursos»; «Crear curso» siempre visible y enlazado a `/cursos/nuevo`; error con `role="alert"` y «Reintentar» que vuelve a pedir; el aviso «Curso «{nombre}» creado» solo con el estado de navegación correcto; nombres como texto plano; sin violaciones de `axe` (con cursos, vacía, con error y con el aviso)
- [x] 7.2 Implementar `pages/CoursesPage.tsx`
- [x] 7.3 Tests que fallan (`CreateCoursePage.test.tsx`): una fila al empezar; añadir hasta 12 (después el botón está deshabilitado) y quitar salvo la última, con nombres accesibles por fila («Quitar la clase 2»); errores de validación bajo su campo o su fila (`aria-invalid`/`aria-describedby`) sin enviar; clase repetida; una sola petición con dos pulsaciones; `created` navega a `/cursos` con `replace` y el nombre en el estado; `validationError` marca los campos del servidor; `alreadyExists` marca el nombre; `unavailable` muestra el aviso con `role="alert"` y conserva lo escrito; «Cancelar» vuelve a `/cursos`; sin violaciones de `axe` (vacío y con errores)
- [x] 7.4 Implementar `pages/CreateCoursePage.tsx`
- [x] 7.5 Añadir los textos `courses.*` y `header.courses` a `es.json` y `en.json` y comprobar `locales.test.ts`
- [x] 7.6 Tests que fallan (`App.test.tsx` y `AppHeader.test.tsx`): `/cursos` y `/cursos/nuevo` se muestran con sesión de cualquier rol y llevan a `/login` sin sesión; la navegación aparece para `ADMIN` y `MEMBER` con «Cursos» (con `aria-current` en `/cursos` y `/cursos/nuevo`) y «Usuarios» solo para `ADMIN`; el orden del Tab de la cabecera; la tarjeta «Gestión de horarios» de la bienvenida sigue «Próximamente»
- [x] 7.7 Declarar las rutas en `App.tsx` e implementar la navegación en `components/AppHeader.tsx`

## 8. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests unitarios y de integración que dependen de la navegación de la cabecera, de `ERROR_CODES`, de `FieldErrorCode`, de `AppDependencies` o de la lista de tablas (`AppHeader.test.tsx`, `App.test.tsx`, `UsersPage*.test.tsx`, `OnboardingPage.test.tsx`, `appError.test.ts`, `app.test.ts`, `composeApp.int.test.ts`, `resetDatabase`) y actualizarlos solo si cambia su comportamiento
- [x] 8.2 Revisar los E2E que miran la cabecera o la navegación (`users.cy.ts`, `users-management.cy.ts`, `invitation-acceptance.cy.ts`, `csp.cy.ts`, `logout.cy.ts`, `onboarding.cy.ts`): un `MEMBER` ahora ve la navegación con «Cursos», pero no «Usuarios»

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de `calendarschool` y `calendarschool_test` (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses` y `classes` por esquema)
- [x] 9.2 Ejecutar los tests de los módulos modificados del backend y del frontend
- [x] 9.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 9.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 9.5 Crear el informe `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Con el backend local (captcha falso) y la migración aplicada: registrar un administrador, iniciar sesión, renovar y, con el access token, `POST /api/courses` (`201`) y `GET /api/courses` (`200`, ordenado); errores: sin nombre, sin clases, 13 clases, clase repetida y caracteres no permitidos (`400` con sus detalles), nombre repetido con otras mayúsculas (`409`), sin token (`401`); un `MEMBER` creado con SQL crea y lista (`201` y `200`); otro colegio no ve los cursos; dos `POST` simultáneos idénticos (`201` y `409`); con la base de datos parada, `503`; comprobar en la base de datos las filas y que no quedan clases huérfanas; el log tiene `COURSE_CREATED` y `COURSE_CREATION_REJECTED` sin los nombres
- [x] 10.2 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Escribir `courses.cy.ts`: un administrador recién registrado entra en «Cursos» desde la navegación, ve el listado vacío, crea «1º Primaria» con las clases «A» y «B» y lo ve en el listado con «Sin tutor» y el aviso; repetir «1º primaria» muestra el error en el campo; un `MEMBER` (tarea `createUser`) ve «Cursos» y no «Usuarios» y crea un curso; con la ventana a 360 px no hay desplazamiento horizontal en las dos páginas
- [x] 11.2 Ejecutar en modo headless `courses.cy.ts` y las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` solo si este cambio añade una regla nueva (p. ej., los nombres normalizados únicos por colegio con índice, o los errores de campo de listas `campo[i].subcampo`)
- [x] 12.2 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (Módulo 2: `courses` y `classes` implementadas, `tutor_id` con US09, y la nota de estado), `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` raíz (estado del repositorio y endpoints) y `README.md`
- [x] 12.3 Actualizar la arquitectura: `ARQUITECTURA_COMPLETA.md` (sección 0: estado de cursos; 2.0.2 y 2.0.3: casos de uso, router y tablas), la parte A de `DIAGRAMA_C4.md` y el DSL (componentes y tablas nuevas)
- [x] 12.4 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.5 Verificar con `openspec validate us05-crear-cursos --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [ ] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático: la migración aplicada por `prisma migrate deploy` y el smoke test
- [ ] 13.2 Comprobar en producción con `curl` que `GET /api/courses` sin token responde `401` y que `/cursos` sirve la SPA con la CSP, y que la persona usuaria, con un navegador real, crea un curso con dos clases como administrador y lo ve en el listado (y, si tiene uno de prueba, como miembro), sin violaciones de CSP
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
