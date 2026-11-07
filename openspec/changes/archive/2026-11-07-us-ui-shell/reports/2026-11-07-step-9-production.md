# Paso 9: producción (us-ui-shell)

## Integración y despliegue

- PR #164 integrada en `main` (`8323512`).
- CI del push a `main`: lint, tests y build correcto; E2E con Cypress correcto; despliegue en producción correcto.
- Antes de la PR: `lint`, `typecheck --workspaces` y `api:types:check` con código de salida 0.

## Comprobación con curl (https://app.calendarschools.es)

| Comprobación | Resultado |
| --- | --- |
| `/api/health` | 200 |
| `/`, `/cursos`, `/horarios/borrador`, `/profesores/resumen` | 200 (la SPA) |
| CSS publicado (`index-DS_i7bMo.css`) | contiene `.cs-sidebar`, `.cs-topbar`, `.cs-nav-link`, `.cs-avatar`, `.cs-skip-link` y `--bs-offcanvas-width:254px` |
| URLs externas en el CSS | 0 |
| `Content-Security-Policy` | sin cambios |

## Comprobación visual (persona usuaria, navegador real)

Barra lateral en escritorio y en móvil, menú de usuario, «Cerrar sesión» y enlace «Saltar al contenido»: confirmado, «Todo bien».
