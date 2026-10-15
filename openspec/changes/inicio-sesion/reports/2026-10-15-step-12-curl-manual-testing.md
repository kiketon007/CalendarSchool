# Informe del paso 12 - Pruebas manuales con curl

- Fecha: 2026-10-15
- Cambio: inicio-sesion
- Agente: Claude Sonnet 5.5

## Entorno

- Backend de desarrollo en `http://localhost:3000`, arrancado con `node --env-file=<copia de backend/.env sin las claves de reCAPTCHA> --import tsx src/server.ts`. Sin secretos de reCAPTCHA se usa el verificador falso (el backend lo avisa en el log con `CAPTCHA_FAKE_VERIFIER`).
- Base de datos de desarrollo `calendarschool` (PostgreSQL 17 en Docker Compose), con `APP_ORIGIN=http://localhost:5173`.
- Primera parte con la configuración por defecto (`LOGIN_ATTEMPTS_MAX=10`). Segunda parte con el backend reiniciado con `LOGIN_ATTEMPTS_MAX=3`, tras borrar los intentos de login de la primera.
- Los recuentos de la base de datos se hicieron con `docker compose exec -T postgres psql -U calendarschool -d calendarschool -At -c "<consulta>"`.
- Las contraseñas y los tokens se enmascaran: la salida se guardó con `refresh_token=<token>` y `accessToken":"<jwt>`, y las contraseñas y tokens de captcha de los cuerpos se muestran como `<pwd>` y `<captcha>`. Se comprobó después que ninguna salida guardada contiene un valor de cookie.
- Usuario de prueba: `curl.login@example.com`, del colegio «Colegio Curl Login» (municipio `46250`), creado por el propio registro.

## Primera parte: comportamiento del login (`LOGIN_ATTEMPTS_MAX=10`)

Todas las peticiones llevan `Content-Type: application/json` y, salvo donde se indica, `Origin: http://localhost:5173`. Los intentos son las filas de `rate_limit_attempts` con la clave `login:%`.

| # | Petición | Respuesta | Intentos de login en la BD |
|---|---|---|---|
| 0 | `POST /api/auth/register` con el usuario de prueba | `201`, `Set-Cookie: refresh_token=<token>; Max-Age=86400; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`, `Cache-Control: no-store` | 0 (1 de `register:`) |
| 1 | `POST /api/auth/login` correcto | `204 No Content`, misma cookie, `Cache-Control: no-store`, cuerpo de 0 bytes | 0 |
| 2 | `POST /api/auth/refresh` con la cookie del login | `200` con `session.expiresIn: 900`, el usuario (`role: ADMIN`) y el colegio; `accessToken` enmascarado | — |
| 3 | Contraseña incorrecta | `401 INVALID_CREDENTIALS`, «Email o contraseña incorrectos» | 1 |
| 4 | Email no registrado | `401 INVALID_CREDENTIALS`, **cuerpo idéntico** al del paso 3 | 2 |
| 5 | Cuerpo `{}` | `400 VALIDATION_ERROR` con `details`: `email` y `password` `REQUIRED` | 2 (sin cambio) |
| 6 | Email `sin-arroba` | `400 VALIDATION_ERROR`, `email` `INVALID_FORMAT` | 2 (sin cambio) |
| 7 | Cuerpo `{ roto` | `400 INVALID_JSON` | 2 (sin cambio) |
| 8 | Sin cabecera `Origin` | `403 ORIGIN_NOT_ALLOWED` | 2 (sin cambio) |
| 9 | `Origin: https://malicioso.example` | `403 ORIGIN_NOT_ALLOWED` | 2 (sin cambio) |
| 10 | Sin campo `captcha` | `422 CAPTCHA_FAILED` | 3 |
| 11 | Token `fake-low-score` (v3) | `422 CAPTCHA_CHALLENGE_REQUIRED` | 4 |
| 12 | Token `fake-fail` | `422 CAPTCHA_FAILED` | 5 |
| 13 | Token `fake-unavailable` | `503 CAPTCHA_UNAVAILABLE` | 6 |
| 14 | Reto v2 superado, contraseña correcta | `204` con cookie | 6 (el correcto no suma) |
| 15 | Email `  CURL.LOGIN@EXAMPLE.COM  ` | `204` con cookie | 6 (el correcto no suma) |
| 16 | Login con `Cookie: refresh_token=fixed-by-attacker` | `204` con una cookie **distinta**, creada por el servidor; `refresh` con la cookie fijada responde `401 INVALID_SESSION` | 6 |
| 17a | Usuario puesto en `SUSPENDED`, contraseña correcta | `403 ACCOUNT_SUSPENDED`, sin `Set-Cookie`; no se crea ninguna sesión | 6 (el intento se libera) |
| 17b | `SUSPENDED`, contraseña incorrecta | `401 INVALID_CREDENTIALS` (no revela el estado de la cuenta) | 7 |
| 18 | Usuario puesto en `DELETED`, contraseña correcta | `401 INVALID_CREDENTIALS` | 8 |

Observaciones:

- Los cuatro fallos del captcha (pasos 10 a 13) cuentan como intentos fallidos y ninguno llega a comprobar la contraseña, como exige el orden de procesamiento: límite → captcha → credenciales.
- Los validaciones previas (pasos 5 a 9) no dejan ningún intento: se rechazan antes del límite.
- El estado del usuario se restauró a `ACTIVE` tras los pasos 17 y 18.
- `refresh_tokens` muestra una fila de más en el paso 1 y siguientes porque el script de pruebas hizo ese login dos veces (una para ver las cabeceras y otra para contar los bytes del cuerpo). No es un comportamiento del backend: cada login correcto crea exactamente una fila, y los pasos 14, 15 y 16 suman una cada uno.

## Segunda parte: límite de intentos fallidos (`LOGIN_ATTEMPTS_MAX=3`)

| # | Petición | Respuesta | Intentos de login en la BD |
|---|---|---|---|
| 1 a 3 | Tres logins con contraseña incorrecta | `401 INVALID_CREDENTIALS` cada uno | 3 |
| 4 | Cuarto login, con la contraseña **correcta** | `429 TOO_MANY_REQUESTS`, `Retry-After: 899`, sin `Set-Cookie` | 3 |
| 5 y 6 | Dos intentos más (uno incorrecto y uno correcto) | `429`, `Retry-After: 899` | 3 (el rechazo no se guarda ni alarga el bloqueo) |
| 7a, 7b | Con la tabla vacía: dos fallos | `401` cada uno | 2 |
| — | Cinco logins correctos seguidos | `204` los cinco | 2 (los correctos no cuentan) |
| 7c | Un tercer fallo | `401` (aún cabía) | 3 |
| 7d | Siguiente intento, correcto | `429`, `Retry-After: 898` | 3 |

El `Retry-After` es de unos 15 minutos (la ventana) y baja con el tiempo, como corresponde a una ventana deslizante. El mensaje del `429` no revela la clave ni el número de intentos.

## Casos de error con el formato de la API

Todas las respuestas de error siguen el formato común `{ "success": false, "error": { "code", "message" } }` y el `400` de validación añade `details` con un `{ field, code }` por campo. Ninguna respuesta expone la causa técnica de un fallo del captcha ni distingue un email inexistente de una contraseña incorrecta.

## Restauración del estado

- Borrado de los datos creados: `refresh_tokens` (11 filas), el usuario `curl.login@example.com`, el colegio «Colegio Curl Login» y los intentos de `rate_limit_attempts` (4 filas).
- Recuento de las cinco tablas en todos los esquemas de `calendarschool` comparado con la línea base del paso 11: **idéntico** (`municipalities` 542 y el resto a 0).
- Backend parado con `taskkill //PID <pid> //T //F`. Los puertos 3000, 3001, 4173 y 5173 quedan libres (comprobado con `netstat`).
- Borrado el fichero de cookies temporal.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
