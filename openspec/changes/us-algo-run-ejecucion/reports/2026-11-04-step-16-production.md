# Informe del paso 16 - Producción

- Fecha: 2026-11-04
- Cambio: us-algo-run-ejecucion
- Agente: Claude Sonnet 5.5

## Integración

- PR #146 integrada el 2026-11-04 (merge `1239a22`).
- CI del push a `main` (run 41867380849): en verde. Lint, tests y build; E2E con Cypress; y despliegue en producción, que aplicó la migración `20261104114453_add_schedule_tables` (17 migraciones) y desplegó el stack de CDK.
- Los errores `duplicate key … schedule_generations_in_progress_key` del log de PostgreSQL en el CI son los de los tests que comprueban el índice único.

## Comprobaciones en producción (`https://app.calendarschools.es`, curl con `--ssl-no-revoke`)

- `GET /api/health`: 200, `{"status":"ok","database":"up"}`.
- `POST` y `GET /api/schedule/generate`, `GET /api/schedule/generate/{id}` y `DELETE /api/schedule/generate/{id}` sin token: **401** los cuatro.
- El bundle `assets/index-D-HgKR5j.js` contiene «Generando horarios».
- No se pudo consultar la configuración de la Lambda del worker con la CLI de AWS (sesión caducada); el despliegue en verde implica que el stack se creó, pero no se ha visto su configuración ni su primer arranque.

## Pendiente

- Prueba en navegador real por la persona usuaria: generar, ver el progreso y el resumen, y cancelar. Es la primera ejecución real del worker (arranque en frío, lectura de SSM, conexión a Supabase).
