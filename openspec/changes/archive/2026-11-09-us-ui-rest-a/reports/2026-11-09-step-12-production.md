# Paso 12: despliegue y comprobación en producción (us-ui-rest-a)

Fecha: 2026-11-09. PR #175 integrada en `main` (69d5380).

## CI y despliegue

El CI del push a `main` salió en verde: «Lint, tests y build», «E2E con Cypress» y «Desplegar en producción».

## Comprobación con curl (https://app.calendarschools.es)

En esta máquina hace falta `--ssl-no-revoke` (el comprobador de revocación de Windows corta la conexión).

- `GET /horarios` → `200` con la SPA.
- Cabecera `Content-Security-Policy` presente y sin cambios.
- `GET /api/health` → `{"success":true,"data":{"status":"ok","database":"up"}}`.
- El CSS publicado (`index-BmkdJ2ix.css`) es el del build verificado, contiene `.cs-generation-card` y no tiene URLs externas.

## Revisión visual

La persona usuaria revisó `/horarios` con un navegador real, en escritorio y en móvil: **todo correcto**.
