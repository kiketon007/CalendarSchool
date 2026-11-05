# Paso 15: despliegue y comprobación en producción (2026-11-05)

## CI y despliegue

- PR #154 integrada en `main`.
- Push a `main` (run 42107634994): Lint, tests y build ✓ (6 min 57 s), E2E con Cypress ✓ (9 min 3 s el job entero) y Desplegar en producción ✓ (2 min 43 s).
- **Migración en producción:** el despliegue aplicó `20261105173345_confirm_schedules` («All migrations have been successfully applied», 18 migraciones).

## Comprobaciones con `curl` (https://app.calendarschools.es)

| Comprobación | Resultado |
| --- | --- |
| `GET /api/health` | `200`, `{"status":"ok","database":"up"}` |
| `GET /api/schedule/official`, `/overview` y `/draft` sin token | `401` |
| `POST /api/schedule/{id}/confirm` y `DELETE /api/schedule/{id}` sin token | `401` |
| `GET /horarios/oficial` (ruta de la SPA) | `200` |
| Bundle `/assets/index-pT_qW6if.js` | contiene «Confirmar como oficial», «Descartar el borrador», «Horario oficial», «Este horario es el oficial», «Este borrador ya no existe» y «confirmado el» |

## Comprobación de la persona usuaria (navegador real)

La persona usuaria confirmó su borrador real como oficial, vio `/horarios/oficial`, lo exportó y comprobó el resumen y el panel de `/horarios`: todo correcto (2026-11-05).
