# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-16
- Cambio: us02-b1-usuarios-colegio
- Agente: Claude Sonnet 5.5

## Entorno

- Backend de desarrollo en `http://localhost:3000`, arrancado con `node --env-file=<copia de backend/.env sin las claves de reCAPTCHA> --import tsx src/server.ts`. Sin secretos de reCAPTCHA se usa el verificador falso (el backend lo avisa en el log con `CAPTCHA_FAKE_VERIFIER`).
- Base de datos de desarrollo `calendarschool` (PostgreSQL 17 en Docker Compose), con `APP_ORIGIN=http://localhost:5173`. Línea base: `users`, `schools`, `refresh_tokens` y `rate_limit_attempts` a 0 y `municipalities` a 542.
- Los cambios de estado de la base de datos se hicieron con `docker compose exec -T postgres psql -U calendarschool -d calendarschool -At -c "<consulta>"`.
- Las cookies y los tokens se guardaron en variables y se enmascararon en la salida (`refresh_token=<token>`, `"accessToken":"<jwt>"`); las contraseñas no se muestran.
- Usuario de prueba: `curl.users@example.com`, del colegio «Colegio Curl Users» (municipio `46250`), creado por el propio registro. Los nombres se enviaron sin tildes: Git Bash en Windows corrompe los acentos al pasar el cuerpo a curl y el backend responde `400 INVALID_CHARACTERS` (un primer intento con «José María» falló por eso y no creó nada; es un detalle del terminal, no del backend).
- Las comprobaciones se ejecutaron con dos scripts (`curl_part1.sh` y `curl_part2.sh`, en el directorio temporal de la sesión) para que cada paso quedara reproducible. Las peticiones a `GET /api/users` no llevan cabecera `Origin`.

## Primera parte: autenticación, rol, baja y cierre de sesión

| # | Petición | Respuesta |
|---|---|---|
| 1 | `POST /api/auth/register` | `201`, con la cookie `refresh_token` |
| 2 | `POST /api/auth/refresh` con la cookie | `200` con el access token (`<jwt>`), el usuario (`role: ADMIN`) y el colegio |
| 3 | `GET /api/users` con `Authorization: Bearer <jwt>`, sin `Origin` | `200`, `Cache-Control: no-store`, un único usuario con exactamente `id`, `firstName`, `lastName`, `email`, `role: ADMIN`, `status: ACTIVE` y `createdAt` en ISO 8601 |
| 4 | `GET /api/users?schoolId=00000000-0000-7000-8000-000000000999` | `200` con el mismo usuario: el parámetro se ignora |
| 5 | `GET /api/users` sin `Authorization` | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` |
| 6 | `GET /api/users` con `Authorization: Basic …` | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` |
| 7 | `GET /api/users` con `Authorization: Bearer ` vacío | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` |
| 8 | `GET /api/users` con el token alterado (último carácter cambiado) | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` |
| 9 | `UPDATE users SET role='MEMBER'` y `GET /api/users` con el mismo token | `403 FORBIDDEN`, sin `WWW-Authenticate`. Tras restaurar `ADMIN`, el mismo token vuelve a dar `200` |
| 10 | `UPDATE users SET status='SUSPENDED'` y `GET /api/users` con el mismo token | `401 INVALID_SESSION`, `WWW-Authenticate: Bearer`. Tras restaurar `ACTIVE`, el mismo token vuelve a dar `200` |
| 11 | `POST /api/users` y `GET /api/users/x` con el token | `404 NOT_FOUND` en ambos |
| 12 | `POST /api/auth/logout` con la cookie y después `GET /api/users` con el mismo token | `204` con la cookie borrada; `401 INVALID_SESSION`, `WWW-Authenticate: Bearer` |
| 13 | Recuento tras la parte 1 (`users / schools / refresh_tokens`) | 1 / 1 / 1, con 1 refresh token revocado |

Todas las respuestas llevan `Cache-Control: no-store`. El rol cambiado en la base de datos se aplica desde la siguiente petición con el mismo token, tanto al degradar como al restaurar, sin cerrar la sesión (decisión del cambio).

## Segunda parte: base de datos parada

| # | Petición | Respuesta |
|---|---|---|
| 14 | `POST /api/auth/login` y `POST /api/auth/refresh` (sesión nueva), y `GET /api/users` con su token | `204`, `200` y `200` |
| 15 | `docker compose stop postgres` y `GET /api/users` con ese token | `503 DATABASE_UNAVAILABLE` (nunca `401`) |
| 15b | Con la base parada, `GET /api/users` sin token | `401 INVALID_SESSION`: no necesita la base de datos |
| 16 | `docker compose start postgres`, esperar a `healthy` y `GET /api/users` con el mismo token | `200`: el servicio se recupera sin reiniciar el backend |

## Limpieza y estado final

- Se borraron de `calendarschool` las filas creadas: 2 `refresh_tokens`, 1 `users`, 1 `schools` y 2 `rate_limit_attempts`.
- La captura posterior de `calendarschool` y la de `calendarschool_test` son **idénticas** a las de la línea base (comparadas con `diff`).
- El contenedor de PostgreSQL vuelve a estar `healthy`.
- Backend parado (`taskkill` del proceso que escuchaba en el puerto): el puerto 3000 queda libre y `GET /api/health` ya no responde.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
