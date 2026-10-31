# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-31
- Cambio: us20-listado-reglas
- Agente: Claude Sonnet 5.5

## Despliegue

- **PR:** #130, integrada por la persona usuaria en `main` (`54eb2f7`).
- **CI del push a `main`:** verde.
  - Lint, tests y build.
  - E2E con Cypress.
  - Desplegar en producción: migraciones (sin migraciones nuevas), CDK, publicación en S3, invalidación de `index.html` y smoke test, todos en verde.
- **Incidencia ajena a este cambio:** el CI del push de la PR #129 (solo documentación, la del archivado de US19_d) falló una vez en `App.test.tsx > subjects routes > renders the form to edit a subject…` (`expected undefined to be 'sub-1'`). Es un test inestable preexistente de la ruta de edición de asignaturas, no de `/reglas`. Pasó en la PR y en el push posterior. Queda anotado para revisarlo aparte.

## Comprobaciones con `curl` contra `https://app.calendarschools.es`

- `GET /reglas`: `200`, `text/html`, con la `Content-Security-Policy` y `X-Content-Type-Options: nosniff`. Sirve la SPA (la CloudFront Function reescribe la ruta).
- El bundle `assets/index-*.js` contiene los textos y la ruta nuevos: «Reglas de reparto», «Solo con avisos», «No hay reglas que coincidan», «Limpiar filtros» y `/api/constraints`.
- `GET /api/constraints` sin token: `401` con `WWW-Authenticate: Bearer` y `Cache-Control: no-store`.

## Comprobación de la persona usuaria (navegador real)

- Como `ADMIN`, en escritorio y en el móvil y sin violaciones de CSP en la consola:
  - ver sus reglas con sus avisos y filtrarlas;
  - pulsar «Editar» y llegar a la carga del curso o a la cuadrícula de franjas.
- Como `MEMBER`: ver las mismas reglas con «Ver», sin poder editar.

## Resultado

- Despliegue y comprobaciones con `curl`: **PASS**.
- Comprobación en el navegador: **OK**. La persona usuaria lo probó como administrador y como miembro y confirmó que todo funciona.
