# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-19
- Cambio: us02-c-restablecer-contrasena
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #55 (`feature/us02-c-restablecer-contrasena`), integrada por la persona usuaria en `main` (`9306124`, 2026-10-19 07:58 UTC).
- Ejecución de CI y despliegue sobre el commit de la integración (`39219462488`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el paso «Migraciones de la base de datos» no encontró nada pendiente. Era lo previsto: este cambio no añade ninguna, reutiliza `access_links`.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: `/restablecer` ya se servía con el `index.html` de la aplicación (la CloudFront Function de las rutas de la SPA) y `/api/*` llega al backend. La variable `PASSWORD_RESET_ATTEMPTS_MAX` es opcional, así que no hizo falta añadirla a SSM (en producción rige el valor por defecto, 10).
- Smoke test (`scripts/smoke.mjs`) contra `https://app.calendarschools.es`: correcto.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `POST /api/password-resets/lookup` con un token inexistente | `410 ACCESS_LINK_INVALID`, `cache-control: no-store`, sin `Set-Cookie` |
| `POST /api/password-resets/lookup` sin token (`{}`) | `410 ACCESS_LINK_INVALID` |
| `POST /api/password-resets/confirm` con un token inexistente y una contraseña válida | `410 ACCESS_LINK_INVALID`, `cache-control: no-store`, sin `Set-Cookie` |
| `POST /api/password-resets/confirm` sin token | `410 ACCESS_LINK_INVALID` |
| `POST /api/users/{id}/password-reset` sin token | `401 INVALID_SESSION` |
| `POST /api/users/{id}/password-reset/revoke` sin token | `401 INVALID_SESSION` |
| `GET /restablecer` | `200`, `text/html` (el `index.html` de la SPA) |

Ninguna de estas peticiones crea ni cambia datos: la confirmación con un token inexistente se rechaza antes de tocar ninguna cuenta, y las rutas de administrador rechazan la petición sin sesión. Las peticiones públicas cuentan como intentos con un enlace no válido de la IP desde la que se hicieron (máximo 10 cada 15 minutos), sin más efecto.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, con una cuenta de prueba, en `https://app.calendarschools.es`: como administrador generó un restablecimiento en `/usuarios` para el usuario de prueba, abrió el enlace en otra ventana privada, definió la contraseña nueva, llegó a `/login` con el aviso y entró con la contraseña nueva. Confirmó que todo funcionó bien y **sin errores de CSP en la consola**. Esta sesión no vio la pantalla, así que el detalle lo da esa confirmación y no una captura propia; la ausencia de violaciones de CSP queda además cubierta por el E2E `csp.cy.ts` (carga de `/restablecer` con el formulario y con la vista de enlace no válido, sin violaciones y sin recursos de terceros).

## Datos de prueba en producción

- Usuario de prueba indicado por la persona usuaria: «Pepe RR», `pepe@gmail.com`. Dejó en producción su cuenta (con la contraseña cambiada), el restablecimiento ya usado y las sesiones revocadas o abiertas de las pruebas, además de la cuenta del administrador y el colegio con los que se hizo la prueba (la persona usuaria no indicó sus nombres, así que aquí no se nombran) y, posiblemente, filas de las pruebas de los cambios anteriores.
- **Orden de borrado:** `access_links` referencia a `schools` y a `users` con `ON DELETE RESTRICT`, así que sus filas se borran **antes** que las de los usuarios y el colegio, o los `delete` fallan por la clave foránea. Antes de borrar, comprueba que el colegio solo contiene datos de prueba (`select email, role from users where school_id = '<id>'`) y apunta su id, porque después de borrar los usuarios ya no se puede localizar por el email:
  1. `select school_id from users where email = 'pepe@gmail.com'` (guardar `<id>`)
  2. `delete from access_links where school_id = '<id>'`
  3. `delete from users where school_id = '<id>'`
  4. `delete from schools where id = '<id>'`
- Las sesiones se borran solas con los usuarios (`ON DELETE CASCADE`). Los intentos del limitador que dejaron las consultas los purga la tarea diaria de `backup.yml`.
- No se ha borrado nada en producción desde esta sesión.

## Observaciones

- La variable `PASSWORD_RESET_ATTEMPTS_MAX` no está en SSM: si en producción se quisiera un máximo distinto de 10, habría que añadirla a los parámetros de la Lambda.
- Tras restablecer, el login no rellena el email: el enlace solo conoce la versión enmascarada. Es una decisión deliberada, anotada en la PR.
- Sigue sin existir un tope de enlaces pendientes ni una purga de enlaces viejos (decisión de US02_b3, anotada como posible endurecimiento). Un restablecimiento caducado sin revocar solo se limpia al generar el siguiente del mismo usuario.
- El `CLAUDE.md` raíz ya describe `/restablecer` y los endpoints nuevos (tarea 13.2), así que no queda nada pendiente de documentar.

## Resultado

- Estado del paso 14: **PASA**
- Incidencias: ninguna en producción.
