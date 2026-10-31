# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-31
- Cambio: us-prof-assign
- Agente: Claude Sonnet 5.5

## Despliegue

- **PR:** #134, integrada por la persona usuaria en `main`.
- **Incidencia en la PR:** el E2E de Cypress falló en CI (3 tests de `courses.cy.ts` y 1 de `workload.cy.ts`): a 360 px los botones de acción de las tarjetas de `/cursos` desbordaban 5 px con la barra de desplazamiento vertical de Linux. Se precisó el escenario de la spec y se añadió `flex-wrap` (commit `bcbce30`); en local no se reproducía.
- **CI del push a `main`:** verde (Lint, tests y build; E2E con Cypress; Desplegar en producción).
  - Migración `add_professor_assignments` aplicada.
  - Despliegue de infraestructura y backend, publicación del frontend y smoke test correcto.

## Comprobaciones con `curl` contra `https://app.calendarschools.es`

- `GET /cursos/<id>/profesores`: `200`, `text/html`, con la `Content-Security-Policy` y `X-Content-Type-Options: nosniff`.
- El bundle contiene «Asignar al tutor», «Sin profesor», «Asignaturas» y `/assignments`.
- `GET` y `PUT /api/courses/<id>/assignments` sin token: `401`.

## Comprobación de la persona usuaria (navegador real)

- Confirmó que todo funciona como se espera.

## Resultado

- Despliegue y comprobaciones con `curl`: **PASS**.
- Comprobación en el navegador: **OK**.
