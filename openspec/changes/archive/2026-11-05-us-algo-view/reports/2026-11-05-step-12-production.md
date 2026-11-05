# Paso 12: despliegue y comprobación en producción (2026-11-05)

## CI

- PR #149 integrada en `main` (CI de la PR, tras dos correcciones: el desbordamiento a 360 px y la carrera del test de generaciones simultáneas; ver los informes de los pasos 8 y 10).
- Push a `main` (run 41993275732): Lint, tests y build ✓ (8 min 31 s), E2E con Cypress ✓ (7 min 1 s), Desplegar en producción ✓ (2 min 37 s).

## Comprobaciones con `curl` (https://app.calendarschools.es)

| Comprobación | Resultado |
| --- | --- |
| `GET /api/health` | `200`, `{"status":"ok","database":"up"}` |
| `GET /api/schedule/draft` sin token | `401 INVALID_SESSION` |
| `GET /horarios/borrador` (ruta de la SPA) | `200` |
| Bundle `/assets/index-Cs92vUzL.js` | contiene «horarios/borrador», «Ver horario», «Libre» y «Sin profesor» |

## Comprobación de la persona usuaria (navegador real)

La persona usuaria pulsó «Ver horario» y recorrió las tres vistas con el horario de su colegio: todo correcto (2026-11-05).
