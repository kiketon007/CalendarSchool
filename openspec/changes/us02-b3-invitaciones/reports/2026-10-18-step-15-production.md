# Informe del paso 15 - Despliegue y comprobación en producción

- Fecha: 2026-10-18
- Cambio: us02-b3-invitaciones
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #49 (`feature/us02-b3-invitaciones`), integrada por la persona usuaria en `main` (`9a55c29`, 2026-10-18 11:48 UTC).
- Ejecución de CI y despliegue sobre el commit de la integración (`39124719044`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el paso «Migraciones de la base de datos» aplicó `20261017180747_add_access_links` (de las 7 migraciones del repositorio) y terminó con «All migrations have been successfully applied».
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: las rutas nuevas cuelgan de `/api`, que CloudFront reenvía con `/api/*`.
- Smoke test (`scripts/smoke.mjs`) contra `https://app.calendarschools.es`: `GET /` (página de la aplicación), `POST /api/auth/login` (llega al backend), `GET <execute-api>/api/health` (sin `X-Origin-Verify`) y `GET /api/health`, los cuatro OK.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization`:

| Petición | Respuesta |
|---|---|
| `POST /api/invitations` con `{"role":"MEMBER"}` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store` |
| `GET /api/invitations` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store` |
| `POST /api/invitations/<uuid>/revoke` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store` |
| `GET /api/users` (referencia) | `401` |
| `GET /invitacion` | `200`, `text/html` (el `index.html` de la SPA) |

Ninguna de estas peticiones crea ni cambia datos: se rechazan antes, sin sesión.

Nota sobre la prueba: la primera vez, `GET /api/invitations` devolvió un `403` HTML de CloudFront («Bad request»). Lo provocó la propia prueba: `curl -X GET` con `-d` envía un cuerpo en un `GET`, y CloudFront lo rechaza. Sin cuerpo, la ruta responde `401` como las otras dos. No es un fallo de producción.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, con una cuenta de prueba, en `https://app.calendarschools.es/usuarios` como administrador: generó una invitación, copió el enlace, recargó la página, vio que la invitación seguía en la lista sin el enlace y la revocó. Confirmó que todo funcionó sin errores. Esta sesión no vio la pantalla, así que el detalle lo da esa confirmación y no una captura propia. La persona usuaria no indicó ningún error; no se le preguntó de forma expresa por la consola del navegador (violaciones de CSP), por lo que ese punto queda cubierto solo por el E2E `csp.cy.ts`.

## Hueco hasta US02_b4: el enlace aún no abre nada

La persona usuaria comprobó que el enlace de la invitación no funciona. Es el hueco aceptado en la decisión de US02_b3 («se acepta el hueco hasta US02_b4»): `/invitacion` es la página de aceptación de US02_b4 y todavía no existe.

- El servidor responde `200` con el `index.html` de la SPA (comprobado con `curl`).
- `App.tsx` no declara la ruta `/invitacion` ni una ruta comodín, así que React Router no pinta nada: **debería verse una página en blanco, y no la página de inicio** que decía la decisión. Esta sesión no lo vio en un navegador; es una deducción del código.
- Se acepta porque en producción no hay usuarios reales, solo cuentas de prueba. Se descartó añadir ahora una ruta comodín a `/` (cambio pequeño, pero toca el frontend en producción) y se cierra el hueco al implementar US02_b4.

## Datos de prueba en producción

- Las pruebas dejaron en producción una cuenta de prueba (su colegio y su administrador) y al menos una fila en `access_links`: la invitación que se generó y se revocó. La persona usuaria no indicó el nombre del colegio, así que aquí no se nombra.
- **Orden de borrado:** `access_links` referencia a `schools` y a `users` con `ON DELETE RESTRICT`, así que sus filas se borran **antes** que las del colegio y los usuarios, o los `delete` fallan por la clave foránea. Para el colegio de prueba (sustituye `<nombre>`):
  1. `delete from access_links where school_id = (select id from schools where name = '<nombre>')`
  2. `delete from users where school_id = (select id from schools where name = '<nombre>')`
  3. `delete from schools where name = '<nombre>'`
- Las sesiones se borran solas con los usuarios (`ON DELETE CASCADE`). Los intentos del limitador que dejó el registro los purga la tarea diaria de `backup.yml`.
- No se ha borrado nada en producción desde esta sesión.

## Observaciones

- El informe de US02_b2 dejó a cargo de la persona usuaria el borrado de su cuenta de prueba («Colegio17102026»); esta sesión no ha comprobado si se hizo. El orden de borrado de arriba solo afecta a los colegios que tengan filas en `access_links`.
- Sin límite de invitaciones pendientes ni purga de enlaces antiguos: decidido en US02_b3 y anotado como posible endurecimiento.

## Resultado

- Estado del paso 15: **PASA**
- Incidencias: ninguna en producción. Queda el hueco aceptado: el enlace de invitación no abre nada hasta US02_b4.
