# Informe del paso 11 - Despliegue y comprobación en producción

- Fecha: 2026-11-08
- Cambio: us-ui-home
- Agente: Claude Sonnet 5.5

## CI y despliegue

- PR #173 integrada en `main` (`c1ba107`). Ejecución de CI 42519114633: **success**.
  - Lint, tests y build: success.
  - E2E con Cypress: success.
  - Desplegar en producción (publicar el frontend en S3, invalidar `index.html` en CloudFront y smoke test): success.

## Comprobación con curl (https://app.calendarschools.es)

- `/onboarding` devuelve 200 con la raíz (`id="root"`) de la SPA.
- La cabecera `Content-Security-Policy` está presente y `frontend/content-security-policy.json` no ha cambiado respecto a `08be55d`.
- El CSS publicado es `assets/index-C3V2dryo.css` (227.364 bytes), el mismo nombre con hash y tamaño que el build local del paso 8; contiene `.cs-home-banner` y `.cs-feature-card`.
- El JS publicado contiene «¿Qué quieres gestionar hoy?» y ya no contiene «Gestión de comedor».
- `/api/health` responde 200 con `{"status":"ok","database":"up"}`.

## Revisión visual de la persona usuaria

La persona usuaria revisó la portada en https://app.calendarschools.es/onboarding con un navegador real, en escritorio y en móvil: **todo correcto** (banner, siete secciones enlazadas y, como administrador, «Administración» con «Usuarios»).

## Resultado

- Estado del paso 11: **PASS**
- Incidencias: ninguna.
