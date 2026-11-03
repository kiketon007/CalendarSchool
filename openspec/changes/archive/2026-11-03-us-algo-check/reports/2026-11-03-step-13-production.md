# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-11-03
- Cambio: us-algo-check
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #142 integrada en `main` (commits `0c43539` y `f79ce5d`, merge `3f00207`).
- La primera ejecución de CI falló en un test unitario: `App.test.tsx` leía `mock.calls[0]` de `subjectsService.get` antes de que el efecto de la página llamara. Era una carrera del test (la página se pinta antes del efecto), no del producto; se corrigió con `waitFor` (`f79ce5d`).
- CI del push a `main` (run 41626920807): `Lint, tests y build`, `E2E con Cypress` y `Desplegar en producción`, los tres en verde.
- Antes de la PR: `lint`, `typecheck --workspaces` y `api:types:check` con código de salida 0.

## Comprobación con curl en `https://app.calendarschools.es`

- `GET /api/schedule/readiness` sin token: `401`, `WWW-Authenticate: Bearer`, `Cache-Control: no-store`.
- `GET /api/schedule/other` sin token: `401` (la autenticación va antes que el enrutado).
- `GET /api/health`: `{"success":true,"data":{"status":"ok","database":"up"}}`.
- `GET /horarios`: `200` (la SPA).
- El bundle `index-BDHJzyg6.js` contiene «Comprobando el colegio», «Impiden generar» y `schedule/readiness`.
- En esta máquina Windows, `curl` necesita `--ssl-no-revoke`: schannel no puede comprobar la revocación del certificado (`CRYPT_E_NO_REVOCATION_CHECK`). Es del cliente, no del servicio.

## Prueba de la persona usuaria en un navegador real

- Abrió «Horarios», vio el veredicto y los problemas de su colegio con sus enlaces, y comprobó que un bloqueante desaparece tras corregirlo. Resultado: «Todo bien».

## Resultado

- Estado del paso 13: **PASS**
- Incidencias bloqueantes: ninguna.
