# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-19
- Cambio: us02-c-restablecer-contrasena
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` contra `calendarschool` (PostgreSQL 17 en Docker), con el verificador de captcha **falso**. El `backend/.env` del equipo trae secretos reales de reCAPTCHA, así que el backend se arrancó cargando ese fichero sin las dos variables `RECAPTCHA_*` (con ellas, el registro responde `422 CAPTCHA_FAILED`).
- Dos arranques: el primero con el máximo por defecto (`PASSWORD_RESET_ATTEMPTS_MAX=10`) para 11.1 a 11.4 (primera parte) y el segundo con `PASSWORD_RESET_ATTEMPTS_MAX=3` para el límite y la base de datos parada.
- Los scripts imprimen solo estados y comprobaciones: ningún token, enlace ni contraseña aparece en este informe. Las credenciales son de pruebas locales.
- Contraseña del bcrypt de los usuarios creados con SQL: hash de coste 10 generado con `@node-rs/bcrypt`.

## Datos creados (11.1)

- `POST /api/auth/register` → `201` (colegio y administrador); `POST /api/auth/login` → `204`; `POST /api/auth/refresh` → access token.
- Con SQL (`INSERT INTO users`, con `updated_at`): un `MEMBER` activo, un `MEMBER` `SUSPENDED` y otro `MEMBER` activo, con contraseña conocida.
- Dos sesiones del `MEMBER` con `POST /api/auth/login` (`204` cada una); sus access tokens daban `403` en `GET /api/users` (válidos, pero sin rol de administrador).

## Generar y revocar (11.2)

| Petición | Resultado |
| --- | --- |
| `POST /api/users/{MEMBER}/password-reset` (administrador) | `201`, `Cache-Control: no-store`, `url` de la forma `<origen>/restablecer#<token>` |
| Comprobación en la base de datos | `token_hash` = SHA-256 del fragmento; el token en claro no está en ninguna fila |
| `GET /api/users` | `passwordResetPending: true` para el miembro y `false` para otro usuario |
| Generar para el `SUSPENDED` | `409 USER_NOT_ACTIVE` |
| Generar con un id que no es UUID | `404` |
| Generar otra vez | `201`; 1 abierto y 1 revocado |
| Forzar con SQL la caducidad del abierto y generar | `201`; sigue habiendo 1 solo abierto (el caducado sin revocar se revocó) |
| `POST .../password-reset/revoke` dos veces | `204` y `204` |
| Lookup del enlace revocado | `410` |

## Consultar y confirmar (11.3)

| Petición (sin `Authorization`) | Resultado |
| --- | --- |
| `POST /api/password-resets/lookup` × 3 con el enlace pendiente | `200` las tres veces, con el colegio y el email enmascarado (`m***@example.com`); ningún `used_at` |
| Lookup sin token / token inexistente / enlace revocado | `410 ACCESS_LINK_INVALID` los tres |
| `POST /api/password-resets/confirm` con una contraseña débil | `400` con `[{"field":"password","code":"INVALID_LENGTH"}]`; el enlace sigue pendiente |
| Confirmar con una contraseña válida | `204`, sin `Set-Cookie`; el hash de la contraseña cambia; el enlace queda con `used_at`; las 2 sesiones del miembro quedan revocadas (0 abiertas, 2 revocadas) |
| Access tokens de las dos sesiones | `401` ambos; `POST /api/auth/refresh` con la cookie de la sesión 1 → `401` |
| Login con la contraseña anterior / con la nueva | `401` / `204` |
| Confirmar otra vez el mismo enlace | `410` |
| Sesión del administrador que generó el enlace | intacta (`200`) |

## Carreras, baja, límite, log y base de datos parada (11.4)

- Dos confirmaciones simultáneas del mismo enlace (otro usuario): un `204` y un `410`; un único enlace con `used_at`.
- Un usuario dado de baja (`POST /api/users/{id}/suspend` → `200`) después de generar su enlace: lookup `410` y confirm `410`; el enlace queda sin usar.
- Límite con `PASSWORD_RESET_ATTEMPTS_MAX=3`: tres lookups con tokens inexistentes → `410`; el cuarto → `429` con `Retry-After` positivo; con el límite agotado, un enlace válido también da `429` en lookup y confirm (sin consumirse). El contador de invitaciones es independiente: `POST /api/invitations/lookup` con un token inexistente sigue dando `410`.
- Log: tras todas las pruebas, ni el token de los enlaces, ni su hash SHA-256, ni el fragmento `restablecer#`, ni las contraseñas aparecen en el log del backend. Eventos registrados: `PASSWORD_RESET_LINK_CREATED`, `PASSWORD_RESET_LINK_REVOKED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_RESET_REJECTED` y `PASSWORD_RESET_RATE_LIMITED`.
- Base de datos parada (`docker stop calendarschool-postgres-1`): lookup, confirm y generar responden `503 DATABASE_UNAVAILABLE`. Tras `docker start` y esperar a `pg_isready`, el lookup del enlace válido vuelve a responder `200`.

## Incidencias de la ejecución (no del producto)

- Primera pasada: el backend usaba los secretos reales de reCAPTCHA (`422`), el script de bcrypt llevaba mal las opciones y las consultas con enlaces inválidos de esa pasada agotaron el límite de la IP, de modo que las siguientes recibieron `429`. Se borraron los datos y los intentos y se repitió entera; los resultados de este informe son los de la repetición.
- El segundo arranque no sustituyó al primero (el proceso anterior seguía escuchando en el puerto 3000), así que la primera pasada del límite se ejecutó contra el backend con el máximo por defecto y no es válida. Se mató el proceso, se arrancó el de máximo 3 y se repitió esa parte.

## Limpieza (11.5)

- Datos borrados en este orden: `access_links`, `refresh_tokens`, `users`, `schools`, `rate_limit_attempts`.
- La base de desarrollo vuelve a la línea base del paso 10 (comparada con `diff`: idéntica).
- Backend parado y puerto 3000 libre; PostgreSQL vuelve a estar en marcha y sano.

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
