## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us14b-alumnos-en-cursos` desde `main` actualizada (llevando los artefactos de este cambio y la ficha US14_b de `docs/User_Stories_MVP.md`, hoy en `docs/us14b-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `studentCount` obligatorio (entero ≥ 0) en `Course` y en `SchoolClass`, con la descripción de los alumnos sin clase como diferencia, y la nota en `createCourse` (ceros), `listCourses`, `getCourse` y `updateCourse` (números del estado final; los recibidos se ignoran)
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar `studentCount: number` de `Course` y `SchoolClass` en `api/schema.test.ts` y comprobar `npm run api:types:check -w frontend`

## 2. Backend: dominio

- [x] 2.1 Añadir `studentCount` a `SchoolClass` y `Course` en `domain/course/course.ts` (JSDoc en castellano) y ajustar los dobles y fixtures de cursos de los tests de aplicación y presentación para que compilen

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaCourseRepository.int.test.ts`): `listBySchool` y `findById` cuentan los alumnos del curso (con y sin clase) y de cada clase, sin contar los de otro colegio ni de otro curso; `create` devuelve ceros; `update` devuelve los números del estado final (quitar una clase con alumnos mantiene el del curso y la quita de la suma); el número de consultas de `listBySchool` es el mismo con 1 y con 10 cursos (cliente con eventos `query`, decisión 2)
- [x] 3.2 Implementar en `PrismaCourseRepository` el `_count` de `students` en `LIST_FIELDS` (curso y clases), `toCourse` con `studentCount` y los ceros de `create`

## 4. Backend: presentación

- [x] 4.1 Tests: `coursesRoute.test.ts` serializa `studentCount` en el curso y las clases; `updateCourseRequest.test.ts` ignora un `studentCount` en el curso y en una clase; y en `courses.int.test.ts`, por HTTP, `GET` (listado y lectura), `POST` (ceros) y `PUT` (estado final con un `studentCount` enviado que se ignora) con alumnos reales y aislamiento entre colegios
- [x] 4.2 Implementar lo que falte para que pasen (si el parser o el router ya lo cumplen, dejarlo anotado en el informe del paso 9)

## 5. Frontend: servicio

- [x] 5.1 Tests que fallan (`coursesService.test.ts`): `list`, `get`, `create` y `update` aceptan `studentCount` entero ≥ 0 en el curso y en las clases y devuelven `unavailable` si falta, es negativo, decimal o no es un número
- [x] 5.2 Implementar la guarda de forma en `services/coursesService.ts` y actualizar los fixtures de cursos de los tests del frontend con los números

## 6. Frontend: listado de cursos

- [x] 6.1 Añadir a `es.json` y `en.json` los textos: columna «Alumnos», clase con su número («{{name}} ({{count}})»), total con y sin «({{count}} sin clase)», número de alumnos de una clase en el formulario (plurales `_one`/`_other`) y los del diálogo (título, texto con plural, «Quitar clase», nombre de una clase sin nombre)
- [x] 6.2 Tests que fallan (`CoursesPage.test.tsx`, a 1280 y 360 px con `describe.each`): «2 clases: A (12), B (10)», «Alumnos» con «25 (3 sin clase)», «5» sin «sin clase» y «0»; la búsqueda no mira los números; cambiar a propósito el test que comprobaba que no se mostraban alumnos (solo comprueba que no hay horario)
- [x] 6.3 Implementar la columna y el dato de las tarjetas en `pages/CoursesPage.tsx`

## 7. Frontend: edición del curso y confirmación

- [x] 7.1 Tests que fallan (`ConfirmRemoveClassModal.test.tsx`): cerrado con `pending` nulo; título como nombre accesible, texto con el número (singular y plural), foco inicial en «Cancelar», sin «X»; «Cancelar» y Escape llaman a `onCancel`; «Quitar clase» a `onConfirm`; `axe` abierto
- [x] 7.2 Implementar `components/ConfirmRemoveClassModal.tsx` según el diseño (decisión 5)
- [x] 7.3 Tests que fallan (`CourseForm.test.tsx`): con `classStudentCounts`, «12 alumnos» bajo la fila ligado por `aria-describedby`, nada con 0 ni en filas nuevas, sin contar como cambio ni enviarse; «Quitar» de una clase con alumnos abre el diálogo con el nombre escrito (o la posición si está vacío); cancelar conserva la fila; confirmar la quita (también tras quitar otra fila antes, por `key`) y no envía nada; una clase con 0 alumnos o nueva se quita sin diálogo; sin la prop (creación) nunca hay diálogo
- [x] 7.4 Implementar en `components/CourseForm.tsx` la prop `classStudentCounts`, `requestRemoveRow` y el foco a «Añadir clase» tras confirmar (`onExited` y `setTimeout` de 0 ms)
- [x] 7.5 Tests que fallan (`EditCoursePage.test.tsx`): pasa los números del curso cargado (se ve «12 alumnos» en su fila) y tras «Recargar» usa los del curso nuevo
- [x] 7.6 Implementar en `pages/EditCoursePage.tsx` la construcción de `classStudentCounts`

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests que construyen cursos (backend: casos de uso, rutas, integración; frontend: servicio, páginas, formularios, `ProfessorForm`/`StudentForm` que reciben cursos, fixtures de `testSupport`) y `courses.cy.ts` (la aserción `/horario|alumnos/i` en `main` pasa a `/horario/i`), y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local y crear por la API dos colegios, un curso con dos clases en cada uno y alumnos con y sin clase
- [x] 10.2 Probar con `curl` `GET /api/courses` y `GET /api/courses/{id}` (números del curso y de cada clase, aislamiento entre colegios), `POST /api/courses` (ceros) y `PUT /api/courses/{id}` quitando una clase con alumnos y enviando un `studentCount` falso (números del estado final, el falso se ignora); sin token (`401`)
- [x] 10.3 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.4 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir a `courses.cy.ts`: un curso con dos clases y alumnos creados por la API (con y sin clase) muestra los números en `/cursos`; en su edición la fila muestra el número; «Quitar» abre el diálogo, «Cancelar» conserva la fila con el foco en su «Quitar», «Quitar clase» la quita con el foco en «Añadir clase»; tras guardar, `/cursos` muestra «(N sin clase)» y `/alumnos` «Sin clase»; quitar una clase sin alumnos no abre el diálogo; 360 px sin desplazamiento horizontal con el diálogo y en las tarjetas
- [x] 11.2 Ejecutar en modo headless `courses.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` solo si surge un patrón nuevo (confirmar una acción local del formulario antes de guardar, con el foco a un elemento estable)
- [x] 12.2 Actualizar `backend/CLAUDE.md` (recuentos de `PrismaCourseRepository`), `frontend/CLAUDE.md` (US14_b en cursos), `ARQUITECTURA_COMPLETA.md` (la fila de US14 deja de remitir a US14_b) y las notas de las historias que hereden algo (US15, US17)
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.4 Verificar con `openspec validate us14b-alumnos-en-cursos --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Abrir la PR con los grupos 0–12 (mencionando los tests que cambian a propósito) y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [x] 13.2 Comprobar en producción con `curl` que `/cursos` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET /api/courses` sin token responde `401`, y que la persona usuaria, con un navegador real, ve los números en `/cursos` y confirma y cancela al quitar una clase con alumnos, en escritorio y en el móvil, sin violaciones de CSP
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
