# Informe del paso 12 - Despliegue y comprobación en producción

- Fecha: 2026-10-27
- Cambio: us-subject-b-editar-asignaturas
- Agente: Claude Sonnet 5.5

## Integración y despliegue

- PR [#116](https://github.com/kiketon007/CalendarSchool/pull/116), integrada por la persona usuaria en `main` (commit `9dfd8fa`) a las 13:12 UTC.
- El workflow `CI` del push a `main` terminó con éxito: **Lint, tests y build**, **E2E con Cypress** y **Desplegar / Desplegar en producción** (el despliegue lo llama `ci.yml` solo cuando los dos anteriores pasan).
- Pasos del despliegue, todos en verde: comprobar que el commit pertenece a `main`, instalar, build, **migraciones de la base de datos**, leer el secreto de origen, desplegar la infraestructura y el backend con CDK, publicar el frontend en S3, invalidar `index.html` en CloudFront y **smoke test**.
- **Migraciones:** `prisma migrate deploy` encontró 12 migraciones y respondió «No pending migrations to apply»: el cambio no tiene migraciones, como estaba previsto.
- **Smoke test** (4 comprobaciones, todas `OK`): `GET /` (página de la aplicación), `GET <execute-api>/api/health` sin `X-Origin-Verify`, `POST /api/auth/login` (llega al backend) y `GET /api/health`.

## Comprobaciones con curl contra `https://app.calendarschools.es`

Solo lecturas y peticiones sin token: no se crea ningún dato en producción.

| Comprobación | Resultado |
|---|---|
| `GET /`, `/asignaturas`, `/asignaturas/nueva`, `/asignaturas/<id>/editar` y `/calendarios` | `200`, `text/html`, con la cabecera `Content-Security-Policy` (la SPA se sirve en cada ruta, también en la nueva) |
| Bundle (`/assets/index-BYn0SPYV.js`, 627 849 bytes) | Contiene los textos nuevos: «Editar la asignatura», «Esta asignatura no existe o ya no está disponible», «Esta asignatura no tiene cursos: marca al menos uno para guardarla», «Solo los administradores pueden modificar asignaturas», «actualizada», «Cargando la asignatura», el texto en inglés «Edit the subject» y la ruta `/asignaturas/:id/editar` (1 aparición de cada uno) |
| `GET /api/subjects/{id}` sin token | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer`, `Cache-Control: no-store` |
| `PUT /api/subjects/{id}` sin token (cuerpo `{}`) | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer`, `no-store`: no se cambia nada |
| `GET /api/subjects/no-es-un-uuid` sin token | `401` (la sesión se comprueba antes que el id) |
| `GET /api/health` | `200` (`database: up`) |

El `curl` de Windows (Schannel) no puede consultar la lista de revocación de certificados desde esta red, así que las comprobaciones se hicieron con `--ssl-no-revoke`, que solo omite esa comprobación: la cadena de certificados y el nombre del sitio se siguen validando. El smoke test del propio despliegue pasa.

## Comprobación en un navegador real (hecha por la persona usuaria)

Lo que no se puede comprobar con `curl` lo comprobó la persona usuaria con un navegador real, en escritorio y en el móvil, y confirmó que todo fue bien (2026-10-27):

- Editar una asignatura (nombre, código, estado, color, cursos y sesiones) y ver el aviso «Asignatura «X» actualizada».
- Inactivarla y encontrarla con el filtro «Inactiva».
- Verla como `MEMBER` sin el enlace «Editar».
- Que no aparezcan violaciones de CSP en la consola.

## Resultado

- Despliegue: PASA (CI, sin migraciones pendientes y smoke test en verde).
- Comprobaciones con curl: PASAN.
- Comprobación en navegador real: PASA (confirmada por la persona usuaria).
