## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-prof-summary` desde `main` actualizada (`f9cbefa`, con US-PROF-ASSIGN_b archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene:
  - los artefactos de este cambio;
  - la ficha enriquecida de US-PROF-SUMMARY, la nueva de US-PROF-SUMMARY_b, la HC7 de US-ALGO-RUN y la fila de la épica 6 en `docs/User_Stories_MVP.md`;
  - la regla de las 23 h en `docs/PRD_CalendarSchool.md` §3.2 y la HC7 en `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md`;
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `GET /api/professors/summary` (`getProfessorsSummary`: `200` con `no-store`, `401`, `500` y `503`) y los esquemas `ProfessorsSummaryResponse`, `ProfessorsSummary`, `ProfessorLoad`, `ProfessorLoadWarning` y `UnassignedCourse`, con un ejemplo con los cuatro estados y los cinco avisos
- [x] 1.2 Fijar la operación y los esquemas en `api/schema.test.ts` (test que falla) y regenerar los tipos con `npm run api:types -w frontend`

## 2. Backend: dominio

- [x] 2.1 Crear `test-fixtures/teaching-load.json` con los casos del requisito «Cálculo de la carga lectiva de un profesor»: un calendario con sesiones iguales y distintas, tramos que tapan sesiones, carga mayor que las libres y mayor que todas, curso sin calendario, varios calendarios, sin asignaciones y exactamente 1380
- [x] 2.2 Test que falla (recorre la tabla) e implementación de `teachingLoadOf` y `MAX_TEACHING_MINUTES` en `domain/professor/teachingLoad.ts`: rango por calendario sobre las sesiones libres, estado y avisos en su orden; reutilizar la regla de solape de `availability.ts`
- [x] 2.3 Definir el puerto `ProfessorsSummaryRepository` (`read(schoolId)`) con los datos en bruto: profesores con sus tramos y asignaciones, y cursos con su calendario (periodos), su número de clases y las asignaciones de cada asignatura

## 3. Backend: aplicación

- [x] 3.1 Tests que fallan e implementación de `GetProfessorsSummary` (`application/professors/`):
  - orden de profesores (apellidos y nombre), asignaturas (`withSortedSubjects`) y cursos, con `compareText`;
  - `courses`, `sessionsPerWeek` y la llamada a `teachingLoadOf` por profesor;
  - `unassigned` con `missingCount` por curso (solo los que tienen alguna celda sin profesor);
  - `maxTeachingMinutes` 1380.

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan e implementación de `PrismaProfessorsSummaryRepository.read`:
  - dos consultas como mucho (profesores y cursos), sin bloqueos y con `translateDatabaseErrors`;
  - los periodos de cada calendario una sola vez;
  - aislamiento por colegio, profesores sin asignaciones, cursos sin calendario y sin clases;
  - la base caída da `DatabaseUnavailable`.
- [x] 4.2 Cablear el repositorio y el caso de uso en `composeApp` y en `AppDependencies` (dobles en `test/support/appDoubles.ts`)

- [x] 4.3 Test de integración determinista que falla e implementación: `PrismaCourseAssignmentsRepository.replace` bloquea con `FOR SHARE` las clases del curso, en orden de `id`, y comprueba las clases contra ellas (una clase que se borra mientras se guarda da `400 NOT_FOUND`, no `500`)

## 5. Backend: presentación

- [x] 5.1 Tests que fallan e implementación de `GET /summary` en `professorsRouter`, registrada **antes** de `/:id`: `200` con la forma del contrato para `ADMIN` y `MEMBER`, `401` sin token y `503` con la base caída
- [x] 5.2 Test de integración HTTP (`*.int.test.ts`) del resumen completo: los cuatro estados, los avisos, `unassigned`, el orden, el aislamiento entre colegios y que `/api/professors/summary` no responde `404`

## 6. Frontend: servicios y utilidades

- [x] 6.1 Tests que fallan e implementación de `services/professorsSummaryService.ts` (`get`): `loaded`, `unauthenticated` y `unavailable`; valida los enums de estado y de aviso, los campos de cada aviso y `minMinutes ≤ maxMinutes`; nunca lanza
- [x] 6.2 Tests que fallan e implementación de `utils/teachingTime.ts`: «21 h 45 min», «20 h», «45 min», «0 min» y el rango «18 h 45 min – 21 h» o un solo valor si coinciden, en `es` y `en`
- [x] 6.3 Tests que fallan e implementación de `utils/professorSummaryFilters.ts`: estado, asignatura (opciones por nombre de las que imparte algún profesor), búsqueda con `matchesPersonSearch` y «Solo con avisos», combinables

## 7. Frontend: página y enlace

- [x] 7.1 Tests que fallan e implementación de `ProfessorsSummaryPage` (carga y error):
  - una sola petición con `StrictMode`;
  - `role="status"` mientras carga;
  - `role="alert"` con «Reintentar», que pide una vez más;
  - «Aún no hay profesores» sin filtros.
- [x] 7.2 Tests que fallan e implementación de la tabla y de las tarjetas (`useMediaQuery`):
  - columnas, nombre como cabecera de fila;
  - horas con `teachingTime`, «—» con `NO_LOAD`;
  - estado con icono y texto, y los cinco avisos con sus textos y plurales;
  - acciones «Editar disponibilidad» y «Profesores de {curso}».
- [x] 7.3 Tests que fallan e implementación del aviso de las asignaturas sin profesor (con enlaces a `/cursos/{id}/profesores`, o el mensaje de que todas tienen profesor)
- [x] 7.4 Tests que fallan e implementación de los filtros en la página:
  - el recuento «{n} profesores»;
  - «No hay profesores que coincidan» y «Limpiar filtros», que devuelve el foco a la búsqueda.
- [x] 7.5 Ruta `/profesores/resumen` en `App.tsx` dentro de `AuthenticatedLayout` sin `RequireRole`, y test y enlace «Resumen de carga» en `ProfessorsPage` para los dos roles (también sin profesores)
- [x] 7.6 Textos en `es.json` y `en.json` (`professors.summary.*`, con plurales) y tests de `axe` con los cuatro estados, con avisos, vacía y con error

## 8. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `professorsRouter`, `appDoubles`, `ProfessorsPage` y `App` (rutas) para que sigan comprobando lo mismo con la ruta y el enlace nuevos
- [x] 8.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 9. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 9.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 9.2 Ejecutar los tests de los módulos cambiados
- [x] 9.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 9.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 9.5 Crear `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend contra `calendarschool` migrada
- [x] 10.2 Preparar por la API un colegio con dos calendarios (uno con sesiones de 45 y de 60 min), cursos con y sin calendario, asignaturas con carga, profesores con tramos no disponibles y asignaciones que den los cuatro estados, los cinco avisos y celdas sin profesor
- [x] 10.3 Comprobar `GET /api/professors/summary` como `ADMIN` y como `MEMBER`: rangos calculados a mano, estados, avisos, orden, `unassigned` y `Cache-Control: no-store`
- [x] 10.4 Comprobar los errores: `401` sin token y que otro colegio no ve a estos profesores
- [x] 10.5 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Crear `cypress/e2e/professorsSummary.cy.ts` con los datos creados por la API:
  - profesores en `FITS` (con su rango), `MAY_EXCEED`, con el aviso de disponibilidad y «Sin carga»;
  - el aviso de las asignaturas sin profesor y su enlace a la matriz;
  - los filtros de estado y de asignatura, la búsqueda, «Solo con avisos» y «Limpiar filtros»;
  - «Editar disponibilidad» y el enlace «Resumen de carga» desde `/profesores`;
  - 360 px sin desplazamiento horizontal.
- [x] 11.2 Actualizar los E2E existentes de `/profesores` si el enlace nuevo cambia lo que comprueban
- [x] 11.3 Ejecutar la spec nueva y la suite completa en modo headless (`npm run test:e2e`)
- [x] 11.4 Crear `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Documentación técnica (MANDATORY)

- [x] 12.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: el resumen de carga (cálculo, consultas, ruta antes de `/:id`) y la fila de la tabla de features;
  - `frontend/CLAUDE.md`: la página, `teachingTime` y los filtros;
  - el `CLAUDE.md` raíz (estado del repositorio);
  - `docs/api-spec.yml` ya actualizado en 1.1;
  - la arquitectura si cambia algún componente;
  - la ficha de US-PROF-SUMMARY y la fila de la épica (implementada).
- [x] 12.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 12.3 Verificar con `openspec validate us-prof-summary --strict` que el cambio es válido

## 13. Despliegue y comprobación en producción

- [x] 13.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–12 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 13.2 Comprobar en producción:
  - **Con `curl`:** el bundle contiene los textos nuevos y `GET /api/professors/summary` sin token responde `401` (no `404`);
  - **La persona usuaria, con un navegador real**, ve el resumen con sus profesores, sus estados y avisos, el aviso de las asignaturas sin profesor, los filtros y los enlaces.
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
