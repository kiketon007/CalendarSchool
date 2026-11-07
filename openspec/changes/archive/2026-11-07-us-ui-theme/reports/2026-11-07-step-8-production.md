# Paso 8: despliegue y comprobación en producción (2026-11-07)

Cambio: `us-ui-theme`. PR #162, integrada en `main` como `69b3f92` (commit `1beea13`).

## CI y despliegue (8.1)

Antes de abrir la PR, `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` dieron 0. El CI del push a `main` (ejecución 42354654236) terminó en verde: «Lint, tests y build», «E2E con Cypress» y «Desplegar / Desplegar en producción».

## Producción con curl (8.2)

Contra `https://app.calendarschools.es` (con `--ssl-no-revoke`, por el error de revocación de Schannel en Windows):

- `GET /api/health` → 200.
- `GET /` → 200 con `Content-Security-Policy` idéntica a la serializada desde `frontend/content-security-policy.json`: no ha cambiado.
- CSS publicado `assets/index-CZDBf4Bs.css` (200, 221.866 B; el mismo nombre con hash que el del build local, así que es el mismo contenido): contiene `--bs-primary:#5b5bd6`, `--bs-body-bg:#f7f8fc`, `.cs-card` y `.cs-tone-mint`, y no tiene `@font-face` ni `@import`.

## Comprobación visual de la persona usuaria

Confirmado por la persona usuaria en un navegador real (login, cursos y horarios): todo bien.

## Notas

- Ninguna incidencia en el despliegue.
