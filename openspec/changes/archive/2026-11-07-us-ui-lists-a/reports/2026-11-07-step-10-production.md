# Paso 10: despliegue y comprobación en producción (2026-11-07)

Cambio: `us-ui-lists-a`. PR #166, integrada en `main` (`20aa573`).

## CI y despliegue

- CI del push a `main` (run 42406324149): «Lint, tests y build», «E2E con Cypress» y «Desplegar en producción», los tres en verde.

## Comprobación con curl (https://app.calendarschools.es)

- `/` → 200 con la `Content-Security-Policy` de siempre (`content-security-policy.json` no cambia respecto a la versión anterior).
- CSS publicado `assets/index-nHVGSCuv.css` (el mismo hash que el build local): contiene `.cs-list-header`, `.cs-search`, `.cs-calendar-card` y `.cs-period-list`.
- `/cursos` y `/calendarios` → 200 `text/html`; `/api/health` → 200 `application/json`.

## Revisión visual de la persona usuaria

La persona usuaria revisó `/cursos` y `/calendarios` en escritorio y en móvil: "Todo bien".
