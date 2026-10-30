# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-30
- Cambio: us19-b-reglas-maximo-y-bloques
- Agente: Claude (Sonnet 5.5)

## Integración y despliegue (14.1)

- `lint`, `typecheck --workspaces` y `api:types:check`: 0 con el árbol final, antes de abrir la PR. El hook de pre-commit (ESLint y Prettier) pasó.
- PR #123 integrada en `main` (`effb3c7`).
- CI de `main` (push, ejecución 41066273149) en verde:
  - Lint, tests y build.
  - E2E con Cypress.
  - Despliegue en producción, con todos sus pasos en `success`: comprobación de que el commit pertenece a `main`, **migraciones de la base de datos** (`Applying migration 20261030105431_add_scheduling_constraints`, «have been applied»), CDK, publicación en S3, invalidación de `index.html` en CloudFront y **smoke test**.

## Comprobación con curl en `app.calendarschools.es` (14.2)

En este equipo (Windows, `schannel`) `curl` no puede comprobar la revocación del certificado (`CRYPT_E_NO_REVOCATION_CHECK`, error 35 y código `000`), así que se usó `--ssl-no-revoke`; el certificado se sigue validando. Es un fallo del cliente local, no del servidor.

- `GET /cursos/<id>/carga`: 200, sirve la SPA y lleva `Content-Security-Policy`.
- El bundle nuevo (`assets/index-C-p4HBwW.js`) contiene los textos de la historia: «Máximo al día», «Sin bloques», «Al guardar se borrarán», «reglas de reparto» y el código `BLOCK_LARGER_THAN_LOAD`.
- `PATCH /api/courses/<id>/workload` sin token: 401 `INVALID_SESSION`, sin cambiar datos.
- `GET /api/courses/<id>/impact` sin token: 401 `INVALID_SESSION`.
- `GET /api/courses/<id>/workload` sin token: 401 `INVALID_SESSION`.

## Comprobación en navegador real (la persona usuaria)

Resultado: «Todo ok», en escritorio y en el móvil y sin violaciones de CSP:

- Puso un máximo al día y unos bloques y los vio en la tarjeta de `/asignaturas`. Al principio no vio «· N reglas» porque está en la lista de cada curso, que solo se ve al desplegar la tarjeta (el resumen plegado no la lleva, como dice la especificación); al desplegarla apareció. No fue un fallo.
- Vio el aviso de un bloque mayor que la carga y los avisos de las reglas que se perderían.
- Como `MEMBER`, vio las reglas como texto sin poder editarlas.

## Resultado

PASA. No hay incidencias abiertas. Posible mejora de diseño, no pedida: añadir el total de reglas al resumen plegado de la tarjeta.
