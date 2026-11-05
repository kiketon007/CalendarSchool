## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-view` desde `main` actualizada, con los artefactos de este cambio y las notas de la exploración y la ficha enriquecida de `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar

## 1. Contrato: la lectura del borrador

- [x] 1.1 Añadir a `docs/api-spec.yml` `GET /api/schedule/draft` (`200` con `{ schedule: ScheduleDraft | null }`, `401`, `503`, `no-store`) y los esquemas `ScheduleDraft`, `ScheduleDraftCourse`, `ScheduleDraftSubject`, `ScheduleDraftProfessor` y `ScheduleDraftEntry` (reutilizando `CalendarPeriod` y `SubjectColor`)
- [x] 1.2 Fijar el contrato en `frontend/src/api/schema.test.ts` (test de tipos que falla) y regenerar los tipos con `npm run api:types -w frontend`

## 2. Backend: dominio y repositorio

- [x] 2.1 Definir en `domain/schedule/scheduleDraft.ts` el tipo `ScheduleDraft` y el puerto `ScheduleDraftRepository.findDraft(schoolId)`
- [x] 2.2 Tests de integración que fallan (`prismaScheduleDraftRepository.int.test.ts`): sin borrador (`null`), un borrador normalizado (cada curso, clase, asignatura y profesor una vez, solo lo que tiene entradas), horas en `HH:MM`, un profesor borrado (`professorId: null` y fuera de `professors`), un curso sin calendario (`calendar: null`), periodos en el orden de la jornada, aislamiento por colegio y la base de datos no disponible (`DatabaseUnavailable`)
- [x] 2.3 Implementar `PrismaScheduleDraftRepository` (una llamada de Prisma y la normalización) hasta que pasen

## 3. Backend: caso de uso y ruta

- [x] 3.1 Tests que fallan e implementación de `GetScheduleDraft`: el orden con `compareText` (cursos, clases, asignaturas; profesores por apellidos y nombre; entradas por clase, día y sesión) y `null` sin borrador
- [x] 3.2 Tests que fallan de la ruta `GET /api/schedule/draft` en `scheduleRouter` (`200` para `ADMIN` y `MEMBER`, `no-store`, el colegio de la sesión aunque llegue `schoolId` en la consulta, `401`, `503`) e implementación; cablear el caso de uso en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 3.3 Test de integración HTTP (`scheduleDraft.int.test.ts`) que genera con el lanzador en memoria y lee el borrador, con otro colegio y sin sesión

## 4. Frontend: servicio y vistas puras

- [x] 4.1 Tests que fallan e implementación de `services/scheduleDraftService.ts` (`get`): `loaded` con el borrador o `null`, `unauthenticated`, `unavailable`, y la validación de la forma (enums, días, horas, y que cada entrada apunte a un curso, una clase de ese curso, una asignatura y un profesor de la respuesta)
- [x] 4.2 Tests que fallan e implementación de `utils/scheduleDraftViews.ts` (pura): las celdas de una clase, las tablas por calendario de un profesor, la tabla de un día del colegio, las celdas «Libre», las entradas fuera del calendario actual y las de un curso sin calendario
- [x] 4.3 Tests que fallan e implementación de la lectura y escritura del estado de la URL (`vista`, `clase`, `profesor`, `dia`): valores por defecto, valores que no existen en el borrador ignorados y solo ids

## 5. Frontend: la tabla

- [x] 5.1 Tests que fallan e implementación de `components/ScheduleGrid.tsx`: `caption`, columnas (días o clases) con `th scope="col"`, filas por periodo con número y horas (`th scope="row"`), recreos como separación, días abreviados por debajo de 768 px, celdas con la muestra de color, el nombre y el código de la asignatura y el profesor o la clase, «Libre», «Sin profesor» y los nombres como texto

## 6. Frontend: la página y el acceso

- [x] 6.1 Tests que fallan e implementación de `pages/ScheduleDraftPage.tsx` (`/horarios/borrador`, bajo `AuthenticatedLayout` sin `RequireRole`): una petición por visita (también con `StrictMode`), carga, error con «Reintentar», sin borrador con el enlace a `/horarios`, y la cabecera «Borrador» con la fecha de generación
- [x] 6.2 Tests que fallan e implementación de la vista por clase (selector con `optgroup`, «N sesiones a la semana», curso sin calendario y sesiones fuera del calendario actual)
- [x] 6.3 Tests que fallan e implementación de la vista por profesor (selector por apellidos y nombre, una tabla por calendario con su nombre, sin los profesores borrados)
- [x] 6.4 Tests que fallan e implementación de la vista de todo el colegio (selector de día, una tabla por calendario con las clases en columnas y desplazamiento dentro del contenedor)
- [x] 6.5 Tests que fallan e implementación del estado en la URL en la página (enlace directo, valor que no existe, `replace` y sin peticiones al cambiar)
- [x] 6.6 Tests que fallan e implementación de «Ver horario» en el estado completado de `ScheduleGenerationPanel` (para `ADMIN` y `MEMBER`, y no en los demás estados) y de la ruta en `App.tsx`; textos en `schedule.draft.*` de `es.json` y `en.json`
- [x] 6.7 Tests de accesibilidad con `axe` en cada vista, a 1280 y 360 px y en inglés

## 7. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 7.1 Revisar los tests que dependen de lo tocado (`scheduleRouter`, `composeApp`, `appDoubles`, `ScheduleGenerationPanel`, `ScheduleReadinessPage`, `App.tsx`) para que sigan comprobando lo mismo
- [x] 7.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 8. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 8.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 8.2 Ejecutar los tests de los módulos cambiados
- [x] 8.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 8.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 8.5 Crear `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend con el lanzador en memoria (sin las claves de reCAPTCHA) y preparar por la API un colegio con dos cursos, un calendario y asignaciones, y generar el borrador
- [x] 9.2 Comprobar `GET /api/schedule/draft` (`200`, `no-store`, la forma normalizada, el orden y las horas en `HH:MM`), sin borrador (`null`), `MEMBER` (`200`), otro colegio (el suyo o `null`) y sin token (`401`)
- [x] 9.3 Borrar un profesor y quitar el calendario de un curso, y comprobar `professorId: null` y `calendar: null`
- [x] 9.4 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Añadir `cypress/e2e/scheduleDraft.cy.ts`: generar, «Ver horario», las tres vistas, recargar con la vista en la URL, un `MEMBER` y 360 px sin desplazamiento de la página
- [x] 10.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 10.3 Crear `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación técnica (MANDATORY)

- [x] 11.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: la lectura del borrador, el puerto y la normalización;
  - `frontend/CLAUDE.md`: la página, las tres vistas, `ScheduleGrid` y el estado en la URL;
  - `README.md` (módulo de generación) y `ARQUITECTURA_COMPLETA.md` (tabla de la sección 0);
  - `docs/api-spec.yml` (ya actualizado en 1.1);
  - la ficha de US-ALGO-VIEW (estado: implementada) y el resumen de la épica.
- [x] 11.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.3 Verificar con `openspec validate us-algo-view --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [x] 12.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–11 tras la confirmación de la persona usuaria; tras integrarla, verificar el CI del push a `main`
- [x] 12.2 Comprobar en producción:
  - **Con `curl`:** `GET /api/schedule/draft` sin token responde `401`, el bundle contiene los textos nuevos y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, pulsa «Ver horario» y recorre las tres vistas con el horario de su colegio.
- [x] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
