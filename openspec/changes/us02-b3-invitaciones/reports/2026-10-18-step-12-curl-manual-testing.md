# Informe del paso 12 - Pruebas manuales con curl

- Fecha: 2026-10-18
- Cambio: us02-b3-invitaciones
- Agente: Claude Sonnet 5.5

## Entorno

- Backend de desarrollo en `http://localhost:3000`, arrancado con `node --env-file=<copia de backend/.env sin las claves de reCAPTCHA> --import tsx src/server.ts`. Sin secretos de reCAPTCHA se usa el verificador falso (el backend lo avisa en el log con `CAPTCHA_FAKE_VERIFIER`). La copia del `.env` estaba en el directorio temporal de la sesión y se borró al terminar.
- Base de datos de desarrollo `calendarschool` (PostgreSQL 17 en Docker Compose), con `APP_ORIGIN=http://localhost:5173`. Línea base: `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `access_links` a 0 y `municipalities` a 542.
- Datos de prueba: dos colegios («CEIP Manual A» y «CEIP Manual B») con su administrador, creados por `POST /api/auth/register`; un miembro del colegio A insertado con SQL directo (`docker exec … psql -U calendarschool -d calendarschool`), con una sesión en `refresh_tokens` y un access token emitido con `JoseTokenIssuer` del propio backend para poder llamar con él; y dos enlaces insertados con SQL: un restablecimiento de contraseña (`PASSWORD_RESET`, con `user_id`) y una invitación caducada.
- Los tokens, las cookies, el fragmento de los enlaces y su hash se guardaron en ficheros temporales y no se muestran aquí; las respuestas de las tablas no incluyen el `url` ni ningún token. Las peticiones a `/api/invitations` no llevan cabecera `Origin` (se autentican con bearer, sin cookies).
- Todas las comprobaciones se hicieron con `curl` desde la propia sesión; el estado de la base de datos se leyó con `psql`.

## Generar y listar

| # | Petición | Respuesta |
|---|---|---|
| 1 | `POST /api/invitations` con `{"role":"MEMBER"}` (administrador A) | `201` con `invitation` (`id`, `role`, `createdAt`, `expiresAt`, `createdBy`) y `url` (`http://localhost:5173/invitacion#<token>`); `Cache-Control: no-store` |
| 2 | `POST /api/invitations` con `{"role":"ADMIN"}` | `201`, con las mismas cabeceras y campos |
| 3 | Fila de cada invitación en `access_links` | `token_hash` es el SHA-256 del fragmento del `url` en las dos (comprobado con `psql`) |
| 4 | `POST /api/invitations` con `{}` | `400 VALIDATION_ERROR`, `details: [{field: role, code: REQUIRED}]` |
| 5 | `POST /api/invitations` con `{"role":"OWNER"}` | `400 VALIDATION_ERROR`, `details: [{field: role, code: INVALID_FORMAT}]` |
| 6 | `GET /api/invitations` | `200` con las dos, la más reciente primero (`ADMIN`, `MEMBER`), con cinco campos cada una y sin `url` ni token |

## Revocar

| # | Petición | Respuesta |
|---|---|---|
| 7 | `POST /api/invitations/{id}/revoke` sobre la de `MEMBER` | `204` sin cuerpo; `revoked_at` queda fijado |
| 8 | Lo mismo otra vez | `204`; `revoked_at` no cambia |
| 9 | `GET /api/invitations` | `200` con una sola, la de `ADMIN` |
| 10 | `POST …/not-a-uuid/revoke` | `404 NOT_FOUND` |
| 11 | `POST …/<UUID inexistente>/revoke` | `404 NOT_FOUND` |
| 12 | `POST …/{id de A}/revoke` con el token del administrador B | `404 NOT_FOUND`; la invitación de A sigue sin revocar |
| 13 | `POST …/{restablecimiento insertado con SQL}/revoke` | `404 NOT_FOUND` |
| 14 | `GET /api/invitations` con una invitación caducada insertada con SQL | `200` con la de `ADMIN` únicamente: la caducada no aparece |

## Autenticación, autorización, logs y base de datos

| # | Petición | Respuesta |
|---|---|---|
| 15 | Las tres rutas sin `Authorization` | `401` en las tres, con `WWW-Authenticate: Bearer` |
| 16 | Las tres rutas con el access token de un `MEMBER` | `403 FORBIDDEN` en las tres; la invitación sigue sin revocar |
| 17 | Log del backend tras todas las pruebas | 2 `INVITATION_CREATED`, 1 `INVITATION_REVOKED` y 3 `AUTHORIZATION_DENIED`. Ninguna coincidencia con los fragmentos de los enlaces, sus hashes, los `url`, el texto `invitacion#` ni los access tokens |
| 18 | Las tres rutas con PostgreSQL parado (`docker stop`) | `503 DATABASE_UNAVAILABLE` en las tres |
| 19 | `GET /api/invitations` tras volver a arrancar la base | `200` en el primer intento, sin reiniciar el backend |

## Limpieza

- Se borraron los datos creados: 4 enlaces de acceso (los 2 de la API, el restablecimiento y la invitación caducada), 3 sesiones, 3 usuarios y 2 colegios.
- El registro dejó 2 filas en `rate_limit_attempts`, que solo se purgan en la copia de seguridad; se borraron para volver a la línea base (estaba a 0).
- El estado de `calendarschool` es idéntico a la línea base (`users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `access_links` a 0, `municipalities` a 542, 7 migraciones).
- El backend se paró (`taskkill`) y el puerto 3000 quedó libre.
- Se borraron del directorio temporal el `.env` sin reCAPTCHA, los tokens, las cookies y las respuestas.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
- Observación: el `INSERT` de un usuario con SQL exige `updated_at` (la columna no tiene valor por defecto).
