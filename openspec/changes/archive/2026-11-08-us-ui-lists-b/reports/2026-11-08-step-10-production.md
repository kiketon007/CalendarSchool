# Paso 10: despliegue y comprobación en producción (2026-11-08)

Cambio: `us-ui-lists-b`. PR #168 integrada en `main` como `38d1c01` (commit de la funcionalidad, `40787e3`).

## 10.1 CI y despliegue

- CI del push a `main` (`38d1c01`): correcto. Trabajos «Lint, tests y build», «E2E con Cypress» y «Desplegar / Desplegar en producción»: los tres en `success`.

## 10.2 Producción (`https://app.calendarschools.es`)

Con `curl` (`--ssl-no-revoke`):

- `/api/health` → `{"success":true,"data":{"status":"ok","database":"up"}}`.
- `/`, `/profesores`, `/profesores/resumen` y `/alumnos` → 200; las tres rutas devuelven `text/html` con la SPA.
- CSS publicado: `assets/index-Bw4d3ESW.css` (225.221 bytes, el mismo fichero que el build local); contiene `.cs-search-wide`.
- `Content-Security-Policy` idéntica a la de antes: `git diff` de `frontend/content-security-policy.json` e `infrastructure/` entre `6f34a87` y `38d1c01` está vacío.

Revisión con un navegador real (`/profesores`, `/profesores/resumen` y `/alumnos`, en escritorio y en móvil): la persona usuaria la ha hecho y todo se ve bien.

## Nota

Al principio de la comprobación se usó por error el dominio `app.calendarschool.es` (sin la «s»), que no resuelve; el dominio correcto es `app.calendarschools.es`.

## Resultado

- Estado del paso 10: **PASS**: CI, despliegue, `curl` y revisión en navegador correctos.
- Incidencias bloqueantes: ninguna.
