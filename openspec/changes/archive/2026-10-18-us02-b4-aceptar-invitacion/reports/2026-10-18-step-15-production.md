# Informe del paso 15 - Despliegue y comprobación en producción

- Fecha: 2026-10-18
- Cambio: us02-b4-aceptar-invitacion
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #52 (`feature/us02-b4-aceptar-invitacion`), integrada por la persona usuaria en `main` (`7888939`, 2026-10-18 15:06 UTC).
- Ejecución de CI y despliegue sobre el commit de la integración (`39138983785`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el paso «Migraciones de la base de datos» respondió «No pending migrations to apply» (7 migraciones en el repositorio, todas ya aplicadas). Era lo previsto: este cambio no añade ninguna.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: `/invitacion` ya se servía con el `index.html` de la aplicación y `/api/*` llega al backend. La variable `INVITATION_ATTEMPTS_MAX` es opcional, así que no hizo falta añadirla a SSM (en producción rige el valor por defecto, 10).
- Smoke test (`scripts/smoke.mjs`) contra `https://app.calendarschools.es`: `GET /` (página de la aplicación), `GET <execute-api>/api/health` (sin `X-Origin-Verify`), `POST /api/auth/login` (llega al backend) y `GET /api/health`, los cuatro OK.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `POST /api/invitations/lookup` con un token inexistente | `410 ACCESS_LINK_INVALID`, `cache-control: no-store` |
| `POST /api/invitations/accept` con un token inexistente y campos válidos | `410 ACCESS_LINK_INVALID`, `cache-control: no-store`, sin `Set-Cookie` |
| `POST /api/invitations/lookup` sin token (`{}`) | `410 ACCESS_LINK_INVALID` |
| `GET /invitacion` | `200`, `text/html` (el `index.html` de la SPA) |
| `GET /api/invitations` sin token (referencia) | `401` |

Ninguna de estas peticiones crea ni cambia datos: la aceptación con un token inexistente se rechaza antes del alta, y el email que se usó (`sin.efecto.comprobacion@example.com`) no existe en producción. Las peticiones cuentan como intentos con un enlace no válido de la IP desde la que se hicieron (máximo 10 cada 15 minutos), sin más efecto.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, con una cuenta de prueba, en `https://app.calendarschools.es`: como administrador generó una invitación en `/usuarios`, abrió el enlace, vio el colegio y el rol, creó la cuenta, llegó a `/login` con el aviso de cuenta creada e inició sesión con ella. Confirmó que todo funcionó bien. Esta sesión no vio la pantalla, así que el detalle lo da esa confirmación y no una captura propia. Se le pidió revisar la consola del navegador (violaciones de CSP) y no indicó ningún error; no detalló ese punto por separado, por lo que queda cubierto también por el E2E `csp.cy.ts` (carga de `/invitacion` con el formulario y con la vista de enlace no válido, sin violaciones y sin recursos de terceros).

El hueco que dejó US02_b3 (el enlace abría una página en blanco) queda cerrado: `/invitacion` consulta la invitación y permite crear la cuenta.

## Datos de prueba en producción

- Las pruebas dejaron en producción, al menos: la cuenta de prueba del administrador con su colegio, la invitación generada (ya usada) y el usuario creado al aceptarla. La persona usuaria no indicó los nombres, así que aquí no se nombran. Pueden quedar además las filas de las pruebas del cambio anterior (invitaciones revocadas) si no se borraron.
- **Orden de borrado:** `access_links` referencia a `schools` y a `users` con `ON DELETE RESTRICT`, así que sus filas se borran **antes** que las de los usuarios y el colegio, o los `delete` fallan por la clave foránea. Para el colegio de prueba (sustituye `<nombre>`):
  1. `delete from access_links where school_id = (select id from schools where name = '<nombre>')`
  2. `delete from users where school_id = (select id from schools where name = '<nombre>')`
  3. `delete from schools where name = '<nombre>'`
- Las sesiones se borran solas con los usuarios (`ON DELETE CASCADE`). Los intentos del limitador que dejaron los registros y las consultas los purga la tarea diaria de `backup.yml`.
- No se ha borrado nada en producción desde esta sesión.

## Observaciones

- La variable `INVITATION_ATTEMPTS_MAX` no está en SSM: si en producción se quisiera un máximo distinto de 10, habría que añadirla a los parámetros de la Lambda.
- El `CLAUDE.md` raíz ya describe `/invitacion` y las rutas públicas nuevas (tarea 14.2), así que no queda nada pendiente de documentar.
- Sigue sin existir un tope de invitaciones pendientes ni una purga de enlaces viejos (decisión de US02_b3, anotada como posible endurecimiento).

## Resultado

- Estado del paso 15: **PASA**
- Incidencias: ninguna en producción.
