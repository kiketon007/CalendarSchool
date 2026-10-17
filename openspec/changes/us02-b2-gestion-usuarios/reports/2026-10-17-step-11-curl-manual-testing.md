# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-17
- Cambio: us02-b2-gestion-usuarios
- Agente: Claude Sonnet 5.5

## Entorno

- Backend de desarrollo en `http://localhost:3000`, arrancado con `node --env-file=<copia de backend/.env sin las claves de reCAPTCHA> --import tsx src/server.ts`. Sin secretos de reCAPTCHA se usa el verificador falso (el backend lo avisa en el log con `CAPTCHA_FAKE_VERIFIER`).
- Base de datos de desarrollo `calendarschool` (PostgreSQL 17 en Docker Compose), con `APP_ORIGIN=http://localhost:5173`. Línea base: `users`, `schools`, `refresh_tokens` y `rate_limit_attempts` a 0 y `municipalities` a 542.
- Los usuarios que el registro no puede crear (un miembro y un segundo administrador del mismo colegio) se insertaron con SQL directo (`docker compose exec -T postgres psql -U calendarschool -d calendarschool -At -c "<consulta>"`), copiando el hash de contraseña del administrador para poder iniciar sesión con ellos.
- Los tokens y las cookies se guardaron en variables y no se muestran; las respuestas de la tabla están sin `accessToken` y las contraseñas no aparecen. Los nombres se enviaron sin tildes (Git Bash en Windows corrompe los acentos al pasar el cuerpo a curl).
- Todas las comprobaciones salen de un script (`curl_part1.sh`, en el directorio temporal de la sesión) que imprime estado, `Cache-Control`, `WWW-Authenticate` y cuerpo de cada petición. Las peticiones a `/api/users` no llevan cabecera `Origin`.
- Usuarios de prueba: `curl.admin@example.com` (administrador del colegio «Colegio Curl Gestion», creado por el registro), `curl.miembro@example.com` (miembro con dos sesiones abiertas), `curl.admin2@example.com` (segundo administrador) y `curl.otro@example.com` (administrador de un segundo colegio, «Colegio Curl Otro», creado por el registro).

## Primera parte: gestión de usuarios

Todas las respuestas llevan `Cache-Control: no-store`; los `401` llevan además `WWW-Authenticate: Bearer` y ningún `403`, `404` ni `409` lo lleva.

### Cambiar el rol

| # | Petición | Respuesta |
|---|---|---|
| 1 | `GET /api/users` con el token del miembro | `403 FORBIDDEN` |
| 2 | `PUT /api/users/{miembro}/role` con `{"role":"ADMIN"}` | `200` con el usuario, `role: ADMIN`, `status: ACTIVE` y los siete campos de la lista |
| 3 | `GET /api/users` con el **mismo** token de antes | `200` con los tres usuarios del colegio: el rol nuevo se aplica desde la siguiente petición |
| 4 | `PUT …/role` con `{"role":"MEMBER"}` (restaurar) y otra vez con el mismo rol | `200` y `200`, sin cambios la segunda vez |
| 5 | Sesiones del miembro sin revocar tras cambiarle el rol | 2 de 2: el cambio de rol no cierra sesiones |

### Validación y `404`

| # | Petición | Respuesta |
|---|---|---|
| 6 | `PUT …/role` con `{"role":"OWNER"}` | `400 VALIDATION_ERROR`, `details: [{field: role, code: INVALID_FORMAT}]` |
| 7 | `PUT …/role` con `{}` y sin cuerpo | `400 VALIDATION_ERROR`, `details: [{field: role, code: REQUIRED}]` |
| 8 | `PUT …/role` con `{"role":"MEMBER","schoolId":"x"}` | `200`: la propiedad desconocida se ignora, el colegio sale de la sesión |
| 9 | `PUT /api/users/no-es-un-uuid/role`, `POST /api/users/<UUID inexistente>/suspend` y `POST /api/users/123/reactivate` | `404 NOT_FOUND` en las tres |

### Baja

| # | Petición | Respuesta |
|---|---|---|
| 10 | `POST …/suspend` sobre el propio administrador, habiendo otro | `409 CANNOT_SUSPEND_SELF` |
| 11 | `POST …/suspend` sobre el miembro | `200` con `status: SUSPENDED`; sus 2 sesiones pasan a revocadas (sin revocar: 0) |
| 12 | `GET /api/users` con cada uno de los dos tokens del miembro | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` |
| 13 | `POST /api/auth/refresh` con cada una de sus dos cookies | `401` y `401` |
| 14 | `POST /api/auth/login` del miembro dado de baja | `403 ACCOUNT_SUSPENDED` |
| 15 | `POST …/suspend` otra vez sobre el mismo usuario | `200` con el usuario sin cambios (idempotente) |
| 16 | `PUT …/role` sobre el miembro dado de baja | `409 USER_NOT_ACTIVE` |

### Reactivar

| # | Petición | Respuesta |
|---|---|---|
| 17 | `POST …/reactivate` y otra vez | `200` con `status: ACTIVE` y `role: MEMBER`, y `200` sin cambios la segunda vez |
| 18 | `POST /api/auth/login` del miembro reactivado | `204` con la cookie: su contraseña de antes sigue valiendo |
| 19 | `POST /api/auth/refresh` con la cookie de antes de la baja | `401`: las sesiones revocadas no reviven |

### Último administrador

| # | Petición | Respuesta |
|---|---|---|
| 20 | El administrador pasa al segundo administrador a `MEMBER` | `200` |
| 21 | El administrador, ya único, se pasa a sí mismo a `MEMBER` | `409 LAST_ADMIN_REQUIRED`; su rol sigue siendo `ADMIN` en la base de datos |
| 22 | Devolver el rol `ADMIN` al segundo administrador | `200` |
| 23 | El administrador se pasa a `MEMBER` habiendo otro administrador activo | `200` |
| 24 | `GET /api/users` con su token de antes | `403 FORBIDDEN` (ya no es administrador) |
| 25 | El otro administrador le devuelve el rol `ADMIN` | `200` |

### Control de acceso

| # | Petición | Respuesta |
|---|---|---|
| 26 | Las tres rutas sin `Authorization` | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` (también con un id que no es un UUID: el `401` va antes que el `404`) |
| 27 | Las tres rutas con el token de un `MEMBER` | `403 FORBIDDEN` |

### Aislamiento entre colegios

| # | Petición | Respuesta |
|---|---|---|
| 28 | Las tres rutas, con el token del administrador del segundo colegio, sobre el miembro del primero | `404 NOT_FOUND` en las tres |
| 29 | Estado del miembro del primer colegio después de los intentos | `MEMBER ACTIVE`, sin cambios |
| 30 | `GET /api/users` del segundo colegio | `200` con un único usuario: el suyo |

## Segunda parte: base de datos parada

| # | Petición | Respuesta |
|---|---|---|
| 31 | `docker compose stop postgres` y las tres rutas con un token válido | `503 DATABASE_UNAVAILABLE` en las tres (nunca `401`) |
| 32 | Con la base parada, `POST …/suspend` sin token | `401 INVALID_SESSION`: no necesita la base de datos |
| 33 | `docker compose start postgres`, esperar a `healthy` y `POST …/reactivate` con el mismo token | `200`: el servicio se recupera sin reiniciar el backend |

## Limpieza y estado final

- Se borraron de `calendarschool` las filas creadas: 6 `refresh_tokens`, 4 `users`, 2 `schools` y 2 `rate_limit_attempts`.
- La captura posterior de `calendarschool` y la de `calendarschool_test` son **idénticas** a las de la línea base (comparadas con `diff`, salida 0).
- El contenedor de PostgreSQL vuelve a estar `healthy`.
- Backend parado (`taskkill` del árbol del proceso que escuchaba en el puerto): el puerto 3000 queda libre y `GET /api/health` ya no responde.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
- Observación: `LAST_ADMIN_REQUIRED` al dar de baja no se puede provocar con peticiones secuenciales (quien actúa es siempre otro administrador activo, y la baja propia se rechaza antes); solo aparece en una carrera entre dos administradores, y lo cubren los tests de integración.
