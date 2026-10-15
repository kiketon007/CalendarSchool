# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-15
- Cambio: cierre-sesion
- Agente: Claude Sonnet 5.5

## Entorno

- Backend de desarrollo en `http://localhost:3000`, arrancado con `node --env-file=<copia de backend/.env sin las claves de reCAPTCHA> --import tsx src/server.ts`. Sin secretos de reCAPTCHA se usa el verificador falso (el backend lo avisa en el log con `CAPTCHA_FAKE_VERIFIER`).
- Base de datos de desarrollo `calendarschool` (PostgreSQL 17 en Docker Compose), con `APP_ORIGIN=http://localhost:5173`.
- Los recuentos de la base de datos se hicieron con `docker compose exec -T postgres psql -U calendarschool -d calendarschool -At -c "<consulta>"`.
- Las cookies y los tokens se guardaron en variables y se enmascararon en la salida (`refresh_token=<token>`, `accessToken":"<jwt>`); las contraseñas y tokens de captcha de los cuerpos se muestran como `<pwd>` y `<captcha>`.
- Usuario de prueba: `curl.logout@example.com`, del colegio «Colegio Curl Logout» (municipio `46250`), creado por el propio registro.
- Las comprobaciones se ejecutaron con scripts (`curl_part1.sh`, `curl_part2.sh` y `curl_part3.sh`, en el directorio temporal de la sesión) para que cada paso quedara reproducible.

## Primera parte: comportamiento del cierre de sesión

Todas las peticiones llevan `Origin: http://localhost:5173`, salvo donde se indica. La sesión A es la del registro; la B, la de un segundo login (otro navegador).

| # | Petición | Respuesta | Comprobación en la BD |
|---|---|---|---|
| 0 | `POST /api/auth/register` (sesión A) y `POST /api/auth/login` (sesión B) | `201` y `204` con su cookie | 2 sesiones, 0 revocadas |
| 2 | `POST /api/auth/refresh` con A, antes de cerrar | `200` con el access token (`<jwt>`), el usuario y el colegio, `Cache-Control: no-store` | — |
| 3 | `POST /api/auth/logout` con A | `204 No Content`, `Cache-Control: no-store`, `Set-Cookie: refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax` | 1 sesión revocada |
| 4 | `POST /api/auth/refresh` con A, después de cerrar | `401 INVALID_SESSION` («La sesión no es válida»), con la cookie borrada | — |
| 5 | `POST /api/auth/refresh` con B | `200`; el claim `sid` del access token (decodificado, solo el cuerpo) **coincide** con el `id` de la sesión B en `refresh_tokens` | — |
| 6 | Segundo `POST /api/auth/logout` con A | `204` con la cookie borrada (idempotente) | `revoked_at` de A **sin cambios** |
| 7 | `POST /api/auth/logout` sin cookie | `204` con la cookie borrada | sin cambios |
| 8 | `POST /api/auth/logout` con un token desconocido | `204` con la cookie borrada | sin cambios (1 sesión viva: la B) |
| 9 | `POST /api/auth/logout` sin `Origin` | `403 ORIGIN_NOT_ALLOWED`, **sin** `Set-Cookie` | la sesión B sigue viva |
| 10 | `POST /api/auth/logout` con `Origin: https://malicioso.example` | `403 ORIGIN_NOT_ALLOWED`, **sin** `Set-Cookie` | la sesión B sigue viva |
| 11 | `POST /api/auth/logout` con B | `204` con la cookie borrada | 0 sesiones vivas |

Cabeceras de caché (`Cache-Control`):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200`, `no-store` |
| `GET /api/municipalities` | `200`, `public, max-age=86400` |
| `GET /api/no-existe` | `404`, `no-store` |
| `POST /api/auth/refresh` con un cuerpo JSON roto | `400`, `no-store` |
| `POST /api/auth/logout` | `204`, `no-store` |

Observaciones:

- El log del backend registró `USER_LOGOUT` (con el id del usuario, la IP y el user agent) y `USER_LOGOUT_WITHOUT_SESSION`, sin el token ni su hash.
- Un cierre de sesión no toca las demás sesiones del usuario: tras el paso 3, `refresh` con B seguía respondiendo `200`.

## Segunda parte: base de datos parada (y un hallazgo)

Se creó una sesión, se paró el contenedor de PostgreSQL (`docker compose stop postgres`) y se llamó a `logout` y a `refresh` con la cookie.

- **Primera ejecución: fallo.** `POST /api/auth/logout` y también `POST /api/auth/refresh` respondieron `500 INTERNAL_ERROR` en lugar de `503 DATABASE_UNAVAILABLE`. La cookie no se borró y la sesión quedó viva (esa parte era correcta), pero el código de estado no era el que dice la spec.
  - **Causa:** con el contenedor parado, el proxy de puertos de Docker acepta la conexión TCP y la cierra al recibir el mensaje de arranque de PostgreSQL. `pg` lanza entonces un `Error` **sin código** con el mensaje `Connection terminated unexpectedly`, y `translateDatabaseErrors` solo reconocía códigos (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` y `P1xxx`). Los tests de integración existentes simulaban la base caída con una contraseña incorrecta y no lo detectaban. Afectaba a todos los endpoints, no solo al cierre de sesión (en producción pasaría ante un reinicio de la base de datos o un corte del *pooler*).
  - **Tratamiento:** se actualizaron primero los artefactos (requisito «Fallos de conexión con la base de datos traducidos a 503» en `api-error-handling`, decisión D9 de `design.md` y tareas 3.3 y 3.4), se escribieron los tests en rojo (2 unitarios y 4 de integración con un servidor TCP que cierra tras recibir el mensaje de arranque) y se implementó el reconocimiento de los dos mensajes fijos de `pg` (`Connection terminated unexpectedly` y `Connection terminated due to connection timeout`).
- **Repetición tras la corrección:**

| # | Petición | Respuesta |
|---|---|---|
| 12 | `POST /api/auth/logout` con la base de datos parada | `503 DATABASE_UNAVAILABLE` («La base de datos no está disponible»), **sin** `Set-Cookie`, `Cache-Control: no-store` |
| 13 | `POST /api/auth/refresh` con la base de datos parada | `503 DATABASE_UNAVAILABLE`, sin `Set-Cookie` |
| 13b | `GET /api/health` (referencia) | `503` |
| 14 | Tras volver a arrancar la base de datos (sano en pocos segundos): la sesión seguía viva (no se había revocado); `POST /api/auth/logout` | `204`, 0 sesiones vivas |

## Limpieza y estado de la base de datos

- Datos creados y borrados: el usuario `curl.logout@example.com`, su colegio, sus refresh tokens (en cascada) y los intentos del limitador.
- Línea base previa (`calendarschool`): `municipalities` 542 y `users`, `schools`, `refresh_tokens` y `rate_limit_attempts` a 0.
- Estado final tras cada ejecución y al terminar: **idéntico** a la línea base (`users` 0, `schools` 0, `refresh_tokens` 0, `rate_limit_attempts` 0, `municipalities` 542).
- Backend parado tras cada ejecución y puertos 3000, 3001 y 4173 libres (comprobado con `Get-NetTCPConnection`).
- Contenedor de PostgreSQL vuelto a arrancar y sano.

## Resultado

- Estado del paso 10: **PASS**, tras corregir en este cambio el hallazgo de la segunda parte.
- Incidencias bloqueantes: ninguna.
