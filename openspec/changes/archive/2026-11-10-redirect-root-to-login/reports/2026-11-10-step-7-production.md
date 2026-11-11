# Paso 7 - Entrega y comprobación en producción

- Fecha: 2026-11-10
- Cambio: redirect-root-to-login
- Agente: Claude

## Entrega (7.1)

- Antes de comitear se repitieron, cada uno con código de salida 0: `npm run lint`, `npm run typecheck --workspaces` y los tests (frontend 5223, backend 4916, infraestructura 89), más el E2E (393 de 393).
- Commit `71daa83` en `feature/redirect-root-to-login`, subido y **PR #182** abierta tras la confirmación de la persona usuaria; fusionada por ella con el commit `47574d9`.
- La CI del push a `main` (run 42907404342): «Lint, tests y build», «E2E con Cypress» y «Desplegar en producción», los tres en verde. El log del despliegue: `No pending migrations to apply`, `Motor de generación de horarios: BACKTRACKING` y el smoke test correcto (`GET /`, `POST /api/auth/login`, `execute-api` sin cabecera y `GET /api/health`).

## Comprobación en producción con curl (7.2)

Contra https://app.calendarschools.es, tras el despliegue:

| Petición | Resultado |
| --- | --- |
| `GET /` | `200 text/html` |
| `GET /login` | `200 text/html`, **el mismo `index.html`** que `/` |
| Bundle de producción (`/assets/index-DAtFABsv.js`) | **no** contiene «Bienvenido a CalendarSchool» (el texto de la página eliminada) y **sí** «Iniciar sesión» |
| `GET /api/health` | `{"success":true,"data":{"status":"ok","database":"up"}}` |
| `POST /api/schedule/generate` sin token | `401` |

Las Lambdas de la API y del worker siguen con `SCHEDULE_ENGINE=BACKTRACKING` (el cambio no las toca).

## Comprobación de la persona usuaria en el navegador (7.2)

La redirección ocurre en el navegador y `curl` no ejecuta JavaScript. La persona usuaria lo comprobó en producción: sin sesión (ventana privada), `https://app.calendarschools.es/` acaba en `/login` con el formulario; con sesión, en la bienvenida. Confirmación: «todo ok». Sin incidencias.

## Estado en que queda producción

- La raíz del dominio lleva a `/login` (o a `/onboarding` con sesión). El motor de horarios sigue en `BACKTRACKING`. No hay migraciones ni cambios de infraestructura.
- Rama remota borrada tras fusionar.

## Resultado

- Paso 7: **PASA**. Incidencias bloqueantes: ninguna.
