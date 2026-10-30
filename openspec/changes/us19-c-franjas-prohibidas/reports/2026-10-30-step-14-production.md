# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-30
- Cambio: us19-c-franjas-prohibidas
- Agente: Claude (Sonnet 5.5)

## Integración y despliegue (14.1)

- `lint`, `typecheck --workspaces` y `api:types:check`: 0 con el árbol final, antes de abrir la PR. El hook de pre-commit (ESLint y Prettier) pasó.
- PR #125 integrada en `main` (`a86beae`).
- CI de `main` (push, ejecución 41115728617) en verde: lint, tests y build, E2E con Cypress y despliegue en producción con todos sus pasos en `success`, incluidos las **migraciones de la base de datos** (`Applying migration 20261030153909_add_scheduling_constraint_slots`, «have been applied») y el **smoke test**.

## Comprobación con curl en `app.calendarschools.es` (14.2)

`curl` en este equipo (Windows, `schannel`) no puede comprobar la revocación del certificado (`CRYPT_E_NO_REVOCATION_CHECK`), así que se usó `--ssl-no-revoke`; el certificado se sigue validando.

- `GET /cursos/<id>/carga/<id>/prohibidas`: 200, sirve la SPA y lleva `Content-Security-Policy`.
- El bundle nuevo (`assets/index-h7uKNLL1.js`) contiene los textos de la historia («Franjas prohibidas de», «Marcar o desmarcar todas las sesiones», «fuera del calendario actual», «Asigna un calendario para definir franjas») y el código `SLOTS_OUTSIDE_CALENDAR`.
- `GET` y `PUT /api/courses/<id>/subjects/<id>/forbidden-slots` sin token: 401 `INVALID_SESSION`, sin cambiar datos.
- `GET /api/courses/<id>/workload` sin token: 401 `INVALID_SESSION`.

## Comprobación en navegador real (la persona usuaria)

Pendiente: marcar y guardar franjas y ver el número en la matriz, ver el aviso de «no cabe», y verlo como `MEMBER` sin poder editar, en escritorio y en el móvil y sin violaciones de CSP.
