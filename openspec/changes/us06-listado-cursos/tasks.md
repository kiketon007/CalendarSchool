## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us06-listado-cursos` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US06 y las notas de US07, US08, US09, US14 y US-ALGO-VIEW en `docs/User_Stories_MVP.md` y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio para implementar

## 1. Contrato de la API

- [x] 1.1 Añadir `createdAt` (`string`, `date-time`, obligatorio) a `Course` en `docs/api-spec.yml`, con los ejemplos del `201` de `POST /api/courses` y del `200` de `GET /api/courses`, y la nota de que `GET /api/courses` no admite búsqueda ni paginación
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar `createdAt` en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: fecha de creación

- [x] 2.1 Tests que fallan: `prismaCourseRepository.int.test.ts` (`create` devuelve el `createdAt` que guardó la base de datos y `listBySchool` lo devuelve en cada curso), `coursesRoute.test.ts` (el `201` y el `200` serializan `createdAt` en ISO 8601; este pasa sin cambios de código, porque `res.json` ya serializa el `Date`) y `courses.int.test.ts` (el `createdAt` del `201` coincide con `courses.created_at` y aparece en el `GET`)
- [x] 2.2 Implementar `createdAt: Date` en `domain/course/course.ts`, la lectura en `PrismaCourseRepository` (`select` en el `create` anidado y en `listBySchool`); el router no cambia (`res.json` serializa el `Date` a ISO 8601); ajustar los dobles de los tests de los casos de uso

## 3. Frontend: servicio y búsqueda

- [x] 3.1 Tests que fallan (`coursesService.test.ts`): un curso sin `createdAt`, o con un `createdAt` que no es texto, es `unavailable` en `list` y en `create`; con él, `loaded` y `created` lo devuelven
- [x] 3.2 Implementar la comprobación de `createdAt` en `services/coursesService.ts`
- [x] 3.3 Tests que fallan (`utils/courseSearch.test.ts`): `normalizeForSearch` quita acentos y diacríticos, pasa a minúsculas, recorta y colapsa espacios y conserva `º` y `ª`; `matchesCourseSearch` es cierto con la consulta vacía o solo con espacios, encuentra subcadenas sin distinguir mayúsculas ni acentos («primaria» → «1º Primaria», «educacion» → «Educación Infantil») y distingue «1º» de «1ª»
- [x] 3.4 Implementar `utils/courseSearch.ts`

## 4. Frontend: presentación según el ancho

- [x] 4.1 Crear un helper de test que simule `window.matchMedia` (fijar si la consulta se cumple y disparar `change`) y tests que fallan (`hooks/useMediaQuery.test.tsx`): devuelve el valor de la consulta en el primer render, cambia al recibir `change`, deja de escuchar al desmontar y devuelve `false` sin `matchMedia`
- [x] 4.2 Implementar `hooks/useMediaQuery.ts`

## 5. Frontend: página de listado

- [x] 5.1 Añadir los textos `courses.classCount_one`/`_other`, `courses.fields.*` (columnas y términos de las tarjetas) y `courses.search.*`, y quitar `courses.classesOf`, que el listado ya no usa, a `es.json` y `en.json` y comprobar `locales.test.ts`
- [x] 5.2 Tests que fallan (`CoursesPage.test.tsx`, reescribiendo los de US05 sin perder su cobertura): a 1280 px una tabla con nombre, columnas Curso, Clases, Tutores y Creado y el nombre como cabecera de fila; a 360 px tarjetas con `h2` y lista de definiciones, sin tabla; nunca las dos a la vez; «2 clases: A, B» y «1 clase: A»; «Sin tutor»; la fecha con el formato del idioma (también en inglés); el orden del servicio; sin botones de editar, borrar ni horario; carga única con `StrictMode`, indicador de carga, error con «Reintentar», aviso de curso creado, vacío sin campo de búsqueda, «Crear curso» siempre visible y texto plano; `axe` en tabla, tarjetas, vacía y con el aviso
- [x] 5.3 Tests que fallan (búsqueda, en `CoursesPage.test.tsx`): filtra al escribir sin peticiones nuevas, sin distinguir mayúsculas ni acentos y conservando el orden; «Mostrando N de M cursos» en un `role="status"` solo con texto; «1º» no encuentra «1ª»; sin resultados, el mensaje con el texto buscado y «Limpiar búsqueda», que vacía el campo, devuelve el foco y quita el indicador; `axe` sin resultados; cambiar de ancho con la búsqueda escrita la conserva
- [x] 5.4 Implementar la tabla, las tarjetas y la búsqueda en `pages/CoursesPage.tsx`

## 6. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 6.1 Revisar los tests unitarios y de integración que construyen o comprueban un `Course` (`createCourse.test.ts`, `listCourses.test.ts`, `coursesRoute.test.ts`, `prismaCourseRepository.int.test.ts`, `courses.int.test.ts`, `coursesService.test.ts`, `CreateCoursePage.test.tsx`, `App.test.tsx`) y actualizarlos solo si cambia su comportamiento
- [x] 6.2 Revisar los E2E que miran el listado de cursos (`courses.cy.ts`: los pasos con `h2` y con la lista «Clases de …»)

## 7. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 7.1 Capturar la línea base de `calendarschool` y `calendarschool_test` (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses` y `classes` por esquema)
- [x] 7.2 Ejecutar los tests de los módulos modificados del backend y del frontend
- [x] 7.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 7.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 7.5 Crear el informe `reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 8. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Con el backend local (captcha falso, cuerpos con caracteres no ASCII desde un fichero UTF-8): registrar un administrador, iniciar sesión y renovar; `POST /api/courses` (`201` con `createdAt` en ISO 8601, igual al `created_at` de la base de datos) y `GET /api/courses` (`200` con `createdAt` en cada curso y el orden natural); `GET /api/courses?search=x&page=2` responde lo mismo que sin parámetros (se ignoran); sin token, `401`; otro colegio no ve los cursos
- [x] 8.2 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 8.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-8-curl-manual-testing.md`

## 9. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Actualizar `courses.cy.ts` a la nueva estructura y añadir: a 1280 px, la tabla con las columnas y la fila del curso creado («2 clases: A, B», «Sin tutor» y la fecha); a 360 px, tarjetas sin tabla y sin desplazamiento horizontal; con tres cursos, «educacion» encuentra «Educación Infantil», «XYZ» muestra el estado sin resultados y «Limpiar búsqueda» devuelve los tres
- [x] 9.2 Ejecutar en modo headless `courses.cy.ts` (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 9.3 Verificar y restaurar la base de datos de test
- [x] 9.4 Documentar el resultado en `reports/YYYY-MM-DD-step-9-e2e-cypress.md`

## 10. Documentación (MANDATORY)

- [x] 10.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` si la presentación tabla/tarjetas con `useMediaQuery` (sin duplicar el contenido) o la búsqueda en el navegador son reglas nuevas
- [x] 10.2 Actualizar `frontend/CLAUDE.md` (listado, búsqueda, `useMediaQuery`), `backend/CLAUDE.md` (`createdAt`), `CLAUDE.md` raíz si cambia el estado del repositorio, `README.md` (árbol de ficheros) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: componentes del frontend y el campo nuevo)
- [x] 10.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 10.4 Verificar con `openspec validate us06-listado-cursos --strict` que el cambio es válido

## 11. Despliegue y comprobación en producción

- [x] 11.1 Abrir la PR con los grupos 0–10 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [x] 11.2 Comprobar en producción con `curl` que `/cursos` sirve la SPA con la CSP y que `GET /api/courses` sin token responde `401`, y que la persona usuaria, con un navegador real, ve la tabla en escritorio y las tarjetas en el móvil con la fecha, y busca con y sin acentos, sin violaciones de CSP
- [x] 11.3 Documentar el resultado en `reports/YYYY-MM-DD-step-11-production.md`
