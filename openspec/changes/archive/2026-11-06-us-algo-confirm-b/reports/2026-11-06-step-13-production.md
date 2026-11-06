# Paso 13: despliegue y comprobación en producción (2026-11-06)

Cambio: `us-algo-confirm-b`. PR #156 integrada en `main` (merge `3b3b834`, commit `ae94b27`).

## CI y despliegue

El CI del push a `main` terminó en verde: «Lint, tests y build», «E2E con Cypress» y «Desplegar / Desplegar en producción». Este cambio no tiene migración, así que el despliegue no aplicó ninguna.

Antes de abrir la PR se repitieron `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, los tres con salida 0.

## Comprobaciones con `curl` (https://app.calendarschools.es)

| Petición | Resultado |
| --- | --- |
| `GET /api/health` | `200` |
| `GET /api/schedule/previous` sin token | `401` |
| `GET /api/schedule/<uuid>` sin token | `401` |
| `GET /api/schedule/overview` y `/official` sin token | `401` (siguen igual que antes) |
| Bundle `assets/index-CdN5ROsx.js` | contiene «Horarios anteriores ({{count}})», «Se muestra con los datos de hoy…», «Este horario no existe» y «sustituido el» |

Nota: desde Windows, `curl` falla con `CRYPT_E_NO_REVOCATION_CHECK` (el almacén de certificados no puede consultar la revocación); es un problema local, no del servidor. Se usó `--ssl-no-revoke`, que solo omite esa comprobación: el certificado se sigue validando.

## Prueba de la persona usuaria en el navegador

Pendiente de su confirmación: con un colegio que tenga al menos dos horarios confirmados, abrir «Horarios anteriores (N)» en `/horarios`, ver la lista, abrir uno y exportarlo.
