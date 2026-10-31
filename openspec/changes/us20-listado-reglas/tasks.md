## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us20-listado-reglas` desde `main` actualizada (`5098cfc`, con US19_d archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene tres cosas:
  - los artefactos de este cambio;
  - la ficha corregida;
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.
- [x] 0.3 Comprobar que la ficha de US20 en `docs/User_Stories_MVP.md` tiene las correcciones de la propuesta:
  - los avisos por regla;
  - la ruta `/reglas`;
  - `slotCount` dentro del calendario;
  - la asignatura inactiva y el curso sin calendario;
  - las opciones del filtro de curso;
  - la consulta sin una lectura por curso.

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml`:
  - la operación `listConstraints` (`GET /api/constraints`), con `200` (`no-store`), `401`, `500` y `503` y un ejemplo con dos reglas y un aviso;
  - los esquemas `ConstraintType`, `SchedulingConstraint` (reutiliza `WorkloadWarning`, `SubjectColor` y `SubjectStatus`) y `ListConstraintsResponse`.
- [x] 1.2 Fijar en `api/schema.test.ts` la operación, el enum y los campos (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Backend: dominio

- [x] 2.1 Crear `domain/constraints/constraintList.ts` con estos tipos y su JSDoc:
  - `ConstraintType`;
  - `ConstraintListSnapshot`: parejas con curso, asignatura, sesiones, `calendar: { sessionGroups } | null` y reglas con todas sus celdas guardadas;
  - `ListedConstraint`: la regla de la respuesta.
- [x] 2.2 Crear el puerto `domain/constraints/constraintListRepository.ts` (`listBySchool(schoolId)`), con su JSDoc

## 3. Backend: aplicación

- [x] 3.1 Tests que fallan (`buildConstraintList.test.ts`), uno por escenario del requisito «Avisos de cada regla» y del orden:
  - no cabe en las obligatorias y no en las preferidas;
  - preferidas prohibidas solo en las preferidas;
  - bloque mayor que la carga solo en bloques;
  - cada cuadrícula con su recuento de celdas fuera;
  - curso sin calendario: `COURSE_WITHOUT_CALENDAR` en todas, `BLOCK_LARGER_THAN_LOAD` antes en bloques y `slotCount` 0;
  - sin avisos;
  - `slotCount` con celdas fuera;
  - el valor de cada tipo y `null` en los demás;
  - el orden por curso, asignatura (`compareText`, «2º» antes que «10º») y tipo;
  - que no modifica la entrada.
- [x] 3.2 Implementar `application/constraints/buildConstraintList.ts`, que reparte lo que dan `subjectWarnings` y `preferredSlotsWarnings` sin reimplementar ninguna regla
- [x] 3.3 Tests que fallan e implementación de `ListConstraints` (`application/constraints/listConstraints.ts`): pasa el `schoolId` de la identidad al repositorio y devuelve `buildConstraintList`. No registra evento.

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan (`prismaConstraintListRepository.int.test.ts`):
  - solo las parejas con reglas;
  - los cuatro tipos con sus valores y todas las celdas;
  - el calendario resumido en `sessionGroups`, con recreos, o `null`;
  - la asignatura con código `null` e inactiva;
  - el aislamiento: otro colegio con reglas no aparece;
  - el `503` con la base de datos caída (`translateDatabaseErrors`).
- [x] 4.2 Implementar `PrismaConstraintListRepository` con una sola llamada de Prisma desde `subjectCourse.findMany` (design D1) y cablearlo en `composeApp.ts`

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`constraintsRoute.test.ts`) e implementación de `presentation/constraints/constraintsRouter.ts`, montado en `app.ts` como `/constraints` antes de `notFoundHandler`:
  - `200` para `ADMIN` y `MEMBER`;
  - `401` sin sesión;
  - `no-store`;
  - el `schoolId` sale de la identidad.
  El doble `listConstraints` va en `test/support/appDoubles.ts`.
- [x] 5.2 Tests de integración por HTTP (`constraints.int.test.ts`) con los escenarios del requisito «Listar las reglas del colegio con GET»:
  - el listado ordenado, también para un `MEMBER`;
  - sin reglas;
  - las celdas fuera tras acortar el calendario;
  - otro colegio;
  - `401`;
  - el escenario «Coincide con la carga del curso», que compara la unión de los códigos del listado con los de `GET /api/courses/{id}/workload`.

## 6. Frontend: servicio, utilidades y textos

- [x] 6.1 Tests que fallan e implementación de `services/constraintsService.ts` (`list`):
  - devuelve `loaded`, `unauthenticated` o `unavailable`;
  - valida la forma: los enums, cada valor solo en su tipo, `code` como texto o `null` y los avisos con `isWorkloadWarning`;
  - nunca lanza.
- [x] 6.2 Tests que fallan e implementación de `utils/constraintFilters.ts`:
  - `matchesConstraintFilters`, con tipo, curso, búsqueda por nombre o código con `matchesCourseSearch`, «Solo con avisos» y su combinación;
  - `courseOptions`: cursos únicos de las reglas, en orden natural;
  - `hasActiveFilters`.
- [x] 6.3 Añadir los textos en `es.json` y `en.json`:
  - `header.constraints`;
  - en `constraints.*`: título, columnas, nombres de los tipos, detalles con plural, filtros, recuento con plural, «Editar» y «Ver» con su `aria-label`, vacío, sin coincidencias, «Limpiar filtros», carga, error y «Reintentar»;
  - `workload.subjectWarnings.COURSE_WITHOUT_CALENDAR`.

## 7. Frontend: componentes y páginas

- [x] 7.1 Tests que fallan (`SubjectWarnings.test.tsx`) e implementación del texto de `COURSE_WITHOUT_CALENDAR` en `SubjectWarnings`, en rojo
- [x] 7.2 Tests que fallan (`ConstraintsPage.test.tsx`, con `describe.each` a 1280 y a 360 px) e implementación de `pages/ConstraintsPage.tsx`:
  - la carga única con `StrictMode`, el `role="status"` y el error con «Reintentar»;
  - la tabla con sus cabeceras o las tarjetas;
  - los datos de cada regla, con «Inactiva» y el color con nombre;
  - los avisos por fila;
  - el recuento;
  - los filtros combinados y «Solo con avisos»;
  - sin coincidencias, con «Limpiar filtros» y el foco en la búsqueda;
  - el vacío con el enlace a «Cursos»;
  - «Editar» o «Ver» según el rol, con su `aria-label` y su ruta por tipo;
  - nada que dependa del rol antes de la sesión;
  - `axe` en los dos anchos.
- [x] 7.3 Tests que fallan e implementación de la ruta `/reglas` en `App.tsx` (dentro de `AuthenticatedLayout`, sin `RequireRole`) y del enlace «Reglas» en `AppHeader.tsx` tras «Asignaturas», para los dos roles (`App.test.tsx` y `AppHeader.test.tsx`)

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar y actualizar, conservando lo que comprobaban:
  - los tests de `AppHeader` que cuentan o enumeran los enlaces;
  - `api/schema.test.ts`;
  - los E2E que recorren la cabecera (`subjects.cy.ts`, `calendars.cy.ts`, y los de 360 px que miden su altura o su anchura).

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos: recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`. Vaciar antes los restos de ejecuciones sueltas en `test_<n>`.
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend y 80 % frontend):
  - guardar el log;
  - leer el código de salida del propio comando, nunca tras una tubería;
  - comprobar que no hay errores «Unhandled».
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`. Marcar el paso solo con los tests en verde y el informe creado.

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`:
  - **Listado vacío:** un colegio nuevo responde `constraints: []`.
  - **Listado con los cuatro tipos** en dos cursos: los valores, el orden y `no-store`.
  - **Avisos por regla:**
    - no cabe en el máximo y en las prohibidas y no en las preferidas;
    - preferidas prohibidas;
    - bloque mayor que la carga;
    - celdas fuera tras acortar el calendario, cada cuadrícula con su recuento;
    - curso sin calendario tras quitárselo.
  - **Coherencia:** la unión de los avisos coincide con `GET /api/courses/{id}/workload` del mismo curso.
  - **Permisos:** `200` de un `MEMBER` real y `401` sin token.
  - **Aislamiento:** un segundo colegio no ve las reglas del primero.
  - **Cascada:** quitar una asignatura de un curso las saca del listado.
- [x] 10.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y las respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Crear `cypress/e2e/constraints.cy.ts`:
  - el `ADMIN` define reglas desde la carga y una cuadrícula, abre «Reglas» desde la cabecera y ve las filas, el detalle, el recuento y un aviso en rojo;
  - filtra por tipo, curso, búsqueda y «Solo con avisos», ve «No hay reglas que coincidan» y limpia;
  - «Editar» lleva a la cuadrícula;
  - el `MEMBER` ve «Ver» y llega a la vista de solo lectura;
  - el colegio sin reglas ve el estado vacío;
  - 360 px con tarjetas y sin desplazamiento horizontal;
  - cada `cy.intercept` registrado una sola vez.
- [x] 11.2 Ejecutar en modo headless `constraints.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs` en `docs/backend-standards.md`, solo si el patrón es nuevo: una lectura de todo el colegio que reparte los avisos de funciones puras existentes en lugar de reimplementarlos
- [x] 12.2 Actualizar la documentación técnica:
  - `backend/CLAUDE.md`: el listado y el reparto de los avisos, y la fila de la tabla de features;
  - `frontend/CLAUDE.md`: `ConstraintsPage`, sus filtros y el enlace de la cabecera;
  - `README.md`: endpoints y rutas;
  - `CLAUDE.md` raíz: estado actual;
  - `docs/Modelo_de_Datos/MODELO_DATOS.md`: quién lee las reglas;
  - la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL): el componente nuevo;
  - el resumen de épicas de `docs/User_Stories_MVP.md`.
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 12.4 Verificar con `openspec validate us20-listado-reglas --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [ ] 13.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–12. Tras integrarla la persona usuaria, verificar el despliegue automático y el smoke test (no hay migraciones).
- [ ] 13.2 Comprobar en producción:
  - **Con `curl`:**
    - `/reglas` sirve la SPA con la CSP;
    - el bundle contiene los textos nuevos;
    - `GET /api/constraints` sin token responde `401`.
  - **La persona usuaria, con un navegador real**, en escritorio y en el móvil y sin violaciones de CSP:
    - ve sus reglas con sus avisos y las filtra;
    - entra a editarlas;
    - las ve como `MEMBER` con «Ver».
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
