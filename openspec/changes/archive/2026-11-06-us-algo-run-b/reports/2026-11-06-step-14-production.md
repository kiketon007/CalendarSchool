# Paso 14 — Despliegue y comprobación en producción (us-algo-run-b)

Fecha: 2026-11-06

## Integración y CI

- PR #158 integrada en `main` (merge `29f7645`).
- CI del push a `main` (run 42267218919): `Lint, tests y build`, `E2E con Cypress` y `Desplegar / Desplegar en producción` en verde.
- Migración: el despliegue ejecutó `prisma migrate deploy` y aplicó `20261106152430_schedule_score` («All migrations have been successfully applied»).

## Comprobaciones con curl (`https://app.calendarschools.es`)

| Comprobación | Resultado |
|---|---|
| `GET /api/health` | `{"success":true,"data":{"status":"ok","database":"up"}}` |
| `POST /api/schedule/generate` sin token | `401` |
| `GET /api/schedule/generate` sin token | `401` |
| Bundle `/assets/index-CjrNfHDc.js` contiene «Mejorar el horario con las preferencias» | sí (1 coincidencia) |

Nota: en Windows, `curl` con Schannel falla con `CRYPT_E_NO_REVOCATION_CHECK` al consultar la revocación del certificado; se usó `--ssl-no-revoke`. No es un fallo de producción.

## Prueba en navegador real

Realizada por la persona usuaria con un navegador real: generó con la casilla marcada y desmarcada, vio las dos fases y el desglose, y lo vio en el borrador. Resultado: todo correcto.
