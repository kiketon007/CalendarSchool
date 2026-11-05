# Paso 14: despliegue y comprobación en producción (2026-11-05)

## CI

- PR #151 integrada en `main`.
- Push a `main` (run 42055214080): Lint, tests y build ✓ (8 min 20 s), E2E con Cypress ✓ (9 min 15 s, el job entero) y Desplegar en producción ✓ (2 min 37 s).
- Vigilar: el E2E del CI ya está cerca de los 9 minutos del job; el límite de Cypress en `scripts/e2e.mjs` es de 10 minutos solo para la fase de Cypress, pero cada spec nuevo lo acerca.

## Comprobaciones con `curl` (https://app.calendarschools.es)

| Comprobación | Resultado |
| --- | --- |
| `GET /api/health` | `200`, `{"status":"ok","database":"up"}` |
| `GET /api/schedule/draft` sin token | `401` |
| `GET /horarios/borrador` (ruta de la SPA) | `200` |
| Bundle `/assets/index-CMqG0tKK.js` | contiene «Exportar horario», «Todas las clases», «Todos los profesores», «Markdown (.md)», «HTML (.html)», «Borrador generado el» y «horarios-clases» |

## Comprobación de la persona usuaria (navegador real)

La persona usuaria exportó una clase y todos los horarios en Markdown y en HTML, abrió los ficheros y los probó a 360 px: todo correcto (2026-11-05).
