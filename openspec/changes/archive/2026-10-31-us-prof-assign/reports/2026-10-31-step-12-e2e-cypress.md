# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-31
- Cambio: us-prof-assign
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/assignments.cy.ts`: 5 tests, 5 en verde (abrir desde «Cursos», asignar y «Asignar al tutor» con recuentos y recarga; columna «Asignaturas» y búsqueda por asignatura; quitar clase y asignatura del curso; `MEMBER`; 360 px sin desplazamiento horizontal). Cada `cy.intercept` se registra una sola vez.
- `courses.cy.ts` (36) y `professors.cy.ts` (29): 65 en verde.
- `npm run test:e2e` completo: 310 tests en verde, código de salida 0, sin errores `Unhandled`.

## Base de datos

- Tras el E2E se vació `calendarschool_test.public` (`TRUNCATE public.schools CASCADE` y `rate_limit_attempts`), quedando solo migraciones y municipios.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
