# Step 12 Report - Manual Endpoint Testing with curl

- Date: 2026-10-09
- Change: us01-c-sesion-tras-registro
- Agent: Claude (Sonnet 5.5)
- Entorno: backend de desarrollo en `http://localhost:3000` (`node --env-file-if-exists=.env --import tsx src/server.ts`), con `JWT_SECRET` y `APP_ORIGIN=http://localhost:5173` de `backend/.env`, contra la base `calendarschool` de PostgreSQL 18 (Docker). Los datos de prueba usan el correo `curl.<marca de tiempo>@example.com`.

## 12.1 Arranque
- `GET /api/health` → `200 {"success":true,"data":{"status":"ok","database":"up"}}`.

## 12.2 Registro: `POST /api/auth/register`
`curl -i -c cookies.txt -X POST /api/auth/register -H 'Content-Type: application/json' --data @reg.json`
- `201 Created`, `Cache-Control: no-store`.
- `Set-Cookie: refresh_token=<43 caracteres base64url>; Max-Age=86400; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`.
- Cuerpo: `{"success":true,"data":{"user":{id,email,firstName,lastName},"school":{id,name,municipality}}}`. Sin access token, sin refresh token, sin contraseña ni hash: el cuerpo es el de US01_b.
- `cookies.txt` guarda la cookie como `#HttpOnly_localhost … /api/auth TRUE …`.

## 12.3 Renovación: `POST /api/auth/refresh`
`curl -i -b cookies.txt -X POST /api/auth/refresh -H 'Origin: http://localhost:5173'`
- `200 OK`, `Cache-Control: no-store`, sin `Set-Cookie` (no se rota la cookie).
- Cuerpo: `data.session.accessToken` (JWT), `data.session.expiresIn=900`, `data.user` (con `role: ADMIN`) y `data.school` (`id`, `name`).
- Una segunda llamada devuelve `200` y el `refresh_token` de `cookies.txt` no cambia.
- JWT decodificado: cabecera `{"alg":"HS256"}`; carga `{schoolId, role:"ADMIN", sub:<id del usuario>, iat, exp}` con `exp - iat = 900 s`.
- Fila en `refresh_tokens`: `token_hash` de 64 caracteres igual al SHA-256 del token de la cookie; `revoked_at` nulo; `expires_at - created_at` ≈ 24 h (23:59:59.975, por la diferencia entre el reloj de la aplicación y el `now()` de la base); `user_agent=curl/8.18.0`, `ip_address=::1`. El token en claro no aparece en ninguna columna.

## 12.4 Casos de error
| Petición | Resultado |
|---|---|
| `refresh` sin cookie (Origin válido) | `401 INVALID_SESSION`, `Set-Cookie: refresh_token=; Max-Age=0; …` |
| `refresh` con cookie desconocida | `401 INVALID_SESSION`, cookie borrada |
| `refresh` con `Origin: https://malicioso.example` y cookie válida | `403 ORIGIN_NOT_ALLOWED`, sin `Set-Cookie` |
| `refresh` sin cabecera `Origin` y cookie válida | `403 ORIGIN_NOT_ALLOWED` |
| `OPTIONS /api/auth/refresh` con origen ajeno (preflight) | `200` sin ninguna cabecera `Access-Control-*` |
| registro con email sin `@` y contraseña corta | `400 VALIDATION_ERROR` con `details` (`schoolName`, `email`, `password`), sin `Set-Cookie` |
| registro repetido (mismo email) | `409 EMAIL_ALREADY_REGISTERED`, sin `Set-Cookie` |
| registro con `Cookie: refresh_token=fijado-por-el-atacante` | `201` con una cookie nueva generada por el servidor; el valor del cliente no existe en la base de datos |

## 12.5 Token revocado y usuario suspendido
- Con `UP2026-10-09 refresh_tokens SET revoked_at = now()` sobre el token del primer usuario, `refresh` → `401 INVALID_SESSION`.
- Con `UP2026-10-09 users SET status = 'SUSPENDED'` sobre el segundo usuario (token vigente), `refresh` → `401 INVALID_SESSION`.
- Log del servidor: cuatro `SESSION_REFRESHED` y cuatro `SESSION_REFRESH_FAILED` con `reason` = `MISSING`, `UNKNOWN`, `REVOKED` y `USER_INACTIVE`. Los dos `403` no generan evento porque el guard rechaza antes del caso de uso. Ningún refresh token ni access token aparece en el log (0 coincidencias).

## 12.6 Restauración de la base de datos
- Línea base de `calendarschool`: `users=0`, `schools=0`, `refresh_tokens=0`, `municipalities=542`, `_prisma_migrations=3`.
- Tras las pruebas: `users=2`, `schools=2`, `refresh_tokens=2`.
- Limpieza: se detuvo el backend y se ejecutaron `DELETE FROM users WHERE email LIKE 'curl.%@example.com'` (los tokens se borran en cascada) y `DELETE FROM schools WHERE name LIKE 'CEIP Curl %'`. El primer `DELETE` de colegios, lanzado antes que el de usuarios, falló por la restricción de clave foránea de `users.school_id` y no modificó nada; los dos siguientes borraron 2 filas cada uno.
- Estado final: idéntico a la línea base (`diff` sin diferencias).

## Outcome
- Step 12 status: PASS
- Blocking issues: none
- No probado con curl: `503 DATABASE_UNAVAILABLE` (exige parar PostgreSQL; lo cubren `session.int.test.ts`, `refreshRoute.test.ts` y `prismaRefreshTokenRepository.int.test.ts`).
