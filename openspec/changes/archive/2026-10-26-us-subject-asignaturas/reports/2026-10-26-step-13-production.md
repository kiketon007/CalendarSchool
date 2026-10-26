# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-26
- Cambio: us-subject-asignaturas
- Agente: Claude Sonnet 5.5

## Integración y despliegue

- PR [#114](https://github.com/kiketon007/CalendarSchool/pull/114), integrada por la persona usuaria en `main` (commit `1da990f`) a las 15:49 UTC.
- El workflow `CI` del push a `main` terminó con éxito: **Lint, tests y build**, **E2E con Cypress** y **Desplegar / Desplegar en producción** (el despliegue lo llama `ci.yml` solo cuando los dos anteriores pasan).
- Pasos del despliegue, todos en verde: comprobar que el commit pertenece a `main`, instalar, build, **migraciones de la base de datos** (aplica `add_subjects`), leer el secreto de origen, desplegar la infraestructura y el backend con CDK, publicar el frontend en S3, invalidar `index.html` en CloudFront y **smoke test**.

## Comprobaciones con curl contra `https://app.calendarschools.es`

Solo lecturas y peticiones sin token: no se crea ningún dato en producción.

| Comprobación | Resultado |
|---|---|
| `GET /asignaturas`, `/asignaturas/nueva`, `/calendarios` y `/` | `200`, `text/html`, con la cabecera `Content-Security-Policy` (la SPA se sirve en cada ruta, también en las nuevas) |
| Bundle (`/assets/index-DkEt7ZRj.js`, 621 598 bytes) | Contiene los textos nuevos: «Todavía no hay asignaturas», «Crear asignatura», «Solo los administradores pueden crear y modificar las asignaturas», «Marca al menos un curso», «Verde azulado», «No hay asignaturas que coincidan», «Primero crea los cursos» y la ruta `/asignaturas/nueva` (1 aparición de cada uno) |
| `GET /api/subjects` sin token | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer`, `Cache-Control: no-store` |
| `POST /api/subjects` sin token (cuerpo `{}`) | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer`: no se crea nada |
| `GET /api/health` | `200` |

## Una nota sobre curl en Windows

Con el `curl` de Windows (Schannel) todas las peticiones fallaban al principio con el código 35 (`CRYPT_E_NO_REVOCATION_CHECK`): Schannel no puede consultar la lista de revocación de certificados desde esta red. No es un fallo de producción (el smoke test del despliegue pasa). Las comprobaciones se hicieron con `--ssl-no-revoke`, que solo omite la comprobación de revocación: la cadena de certificados y el nombre del sitio se siguen validando.

## Comprobación en un navegador real (hecha por la persona usuaria)

Lo que no se puede comprobar con `curl` lo comprobó la persona usuaria con un navegador real, en escritorio y en el móvil, y confirmó que todo fue bien (2026-10-26):

- Crear una asignatura con varios cursos y sus sesiones, y verla en el listado con su color.
- Filtrar y buscar el listado, y desplegar los cursos.
- Verlo como `MEMBER` (sin «Crear asignatura»).
- Que no aparezcan violaciones de CSP en la consola.

## Resultado

- Despliegue: PASA (CI, migración y smoke test en verde).
- Comprobaciones con curl: PASAN.
- Comprobación en navegador real: PASA (confirmada por la persona usuaria).
