# Paso 10: despliegue y comprobación en producción (us-prof-summary-b)

Fecha: 2026-11-02. Entorno: `https://app.calendarschools.es`.

## Integración y CI

- PR #140 integrada en `main` (`2c72673`), con un commit (`c5333a7`).
- CI del push a `main` (run 41419276438): lint, tests, build, E2E, despliegue de CDK, publicación en S3, invalidación de CloudFront y smoke test, todo en verde.

## Producción con curl

| Comprobación | Resultado |
| --- | --- |
| `GET /` | `200` |
| `GET /profesores/resumen` (ruta de la SPA) | `200` |
| Bundle `index-Dwrm_eLf.js` con «Detalle de …», «Disponible siempre», «Aunque le tocaran las sesiones más cortas», «lo comprueba la generación de horarios» y los equivalentes en inglés | los seis presentes |
| `GET /api/professors/summary` sin token | `401` |
| `GET /api/calendars` sin token | `401` |
| `GET /api/professors/<id>/availability` sin token | `401` |

## Prueba en un navegador real

La persona usuaria probó el detalle de un profesor en el resumen de carga en producción (botón «Detalle», asignaciones con la duración de las sesiones de su calendario, desglose por calendario con el total, cuadrícula de disponibilidad con selector, avisos ampliados con sus enlaces, un solo detalle abierto a la vez, cierre al filtrar, inglés, 360 px y un usuario `MEMBER`) y confirmó que todas las pruebas estaban correctas.
