# Informe del paso 12 - Producción

- Fecha: 2026-11-04
- Cambio: us-algo-run-motor
- Agente: Claude Sonnet 5.5

## Integración

- PR #144 integrada el 2026-11-04 (merge `6780e60`).
- CI del push a `main` (run 41791404836): en verde, con lint, tests, E2E con Cypress, migraciones, despliegue de CDK, publicación en S3, invalidación de CloudFront y smoke test.

## Comprobaciones en producción (`https://app.calendarschools.es`, curl con `--ssl-no-revoke`)

- `GET /api/schedule/readiness` sin token: **401**.
- `GET /api/health`: 200, `{"status":"ok","database":"up"}`.
- El bundle `assets/index-CfB22mrE.js` contiene el código `WORKLOAD_BELOW_SLOTS` y el texto «quedarán {{count}} huecos libres en cada clase.».

## Pendiente

- Comprobación manual en navegador real: hecha por la persona usuaria; el aviso de huecos libres se muestra bien. «Se puede generar» no aparece porque otros cursos tienen clases sin profesor (bloqueante `CLASSES_WITHOUT_PROFESSOR`), lo esperado al ser una comprobación de todo el colegio.

## Notas

- La primera comprobación falló por usar el dominio `calendarschool.es` (sin la «s» final) que no resuelve; el correcto es `calendarschools.es`. No hubo ningún fallo del despliegue.
