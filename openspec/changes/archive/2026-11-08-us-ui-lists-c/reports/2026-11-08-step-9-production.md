# Paso 9: despliegue y comprobación en producción (2026-11-08)

Cambio: `us-ui-lists-c`. PR #170, integrada en `main` (`414a1ef`) el 2026-11-08.

## 9.1 CI y despliegue

- Ejecución del push a `main` (`42493659777`): **success**. Jobs: «Lint, tests y build», «E2E con Cypress» y «Desplegar en producción», los tres en verde. El despliegue incluye publicar el frontend en S3, invalidar `index.html` en CloudFront y el smoke test, todos correctos.

## 9.2 Producción con `curl` (`https://app.calendarschools.es`)

- `/asignaturas` y `/reglas`: 200 `text/html` con la raíz (`id="root"`) de la SPA.
- `/api/health`: `{"success":true,"data":{"status":"ok","database":"up"}}`.
- CSS servido: `assets/index-Bw4d3ESW.css`, el mismo nombre (mismo contenido) que el build local; no hay CSS nuevo. La CSP no cambia: `frontend/content-security-policy.json` no se tocó en el cambio.
- **Revisión visual de la persona usuaria:** `/asignaturas` y `/reglas` revisadas en escritorio y en móvil con un navegador real, sin incidencias (OK).
