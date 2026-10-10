# Step 11 Report - Manual Endpoint Testing with curl

- Date: 2026-10-09
- Change: us01-d-limite-intentos-registro
- Agent: Claude (Sonnet 5.5)
- Entorno: backend de desarrollo en `http://localhost:3000` (`node --env-file-if-exists=.env --import tsx src/server.ts`) contra la base `calendarschool` de PostgreSQL 18 (Docker). Primero con la configuración por defecto (máximo 5, `TRUST_PROXY_HOPS=0`) y después con `TRUST_PROXY_HOPS=1`. Datos de prueba: correos `curl.limite.<marca>@example.com` y colegios `CEIP Curl Limite <marca>`.

## 11.1 Arranque
- `GET /api/health` → `200 {"success":true,"data":{"status":"ok","database":"up"}}`.

## 11.2 El sexto intento recibe 429 (CA9)
Cinco `POST /api/auth/register` desde la misma IP (curl llega como `::1`), mezclando resultados, y un sexto con datos válidos y nuevos:

| Intento | Petición | Respuesta |
|---|---|---|
| 1 | alta correcta | `201 Created` con `Set-Cookie: refresh_token=…; Max-Age=86400; Path=/api/auth; HttpOnly; Secure; SameSite=Lax` |
| 2 | email sin `@` y contraseña corta | `400 VALIDATION_ERROR` (`email` `INVALID_FORMAT`, `password` `INVALID_LENGTH`) |
| 3 | email del intento 1 | `409 EMAIL_ALREADY_REGISTERED` |
| 4 | otra alta correcta | `201 Created` con cookie |
| 5 | datos inválidos | `400 VALIDATION_ERROR` |
| 6 | datos válidos y nuevos | `429 Too Many Requests`, `Retry-After: 899`, `{"success":false,"error":{"code":"TOO_MANY_REQUESTS","message":"Se ha superado el número máximo de intentos"}}`, sin `Set-Cookie` |

`Retry-After: 899` son los 900 s de la ventana menos el segundo transcurrido desde el primer intento. El mensaje no revela la clave ni el número de intentos. Cuentan también los `400` y el `409`, como pide la historia.

## 11.3 El sexto intento no deja rastro
- `rate_limit_attempts`: una sola clave, `register:::1`, con **5** filas (el sexto no se guardó).
- Se crearon 2 colegios, 2 usuarios y 2 refresh tokens (las dos altas correctas); el sexto colegio no existe.

## 11.4 JSON roto y log
- Tres `POST` con `{"schoolName":` → `400 INVALID_JSON`; `rate_limit_attempts` sigue en 5: no cuentan.
- Log: `{"level":"warn",…,"event":"USER_REGISTER_RATE_LIMITED","ip":"::1","user_agent":"curl/8.18.0","retry_after":900,"msg":"Registro rechazado: se ha superado el número máximo de intentos"}`. Sin email ni contraseña (0 coincidencias).

## 11.5 Con `TRUST_PROXY_HOPS=1`
| Petición | Respuesta |
|---|---|
| 5 intentos con `X-Forwarded-For: 203.0.113.7` | `400` ×5 |
| 6.º con `203.0.113.7` | `429`, `Retry-After: 900` |
| 1 alta con `X-Forwarded-For: 198.51.100.9` | `201 Created` (otro cliente, no limitado) |
| `X-Forwarded-For: 192.0.2.55, 203.0.113.7` | `429` (la parte izquierda falsificada no cambia la IP) |
| `X-Forwarded-For: 192.0.2.99, 203.0.113.7` | `429` |

Claves guardadas: `register:203.0.113.7` (5) y `register:198.51.100.9` (1). Con `TRUST_PROXY_HOPS=0` la cabecera se ignora (cubierto por `app.test.ts` y `registrationAttempts.int.test.ts`).

## Incidencia del entorno de pruebas (no de la aplicación)
En la primera serie los nombres con acentos (`José`, `García`) llegaron al servidor con una codificación de consola que no es UTF-8 y la validación los rechazó con `INVALID_CHARACTERS`; el script de pruebas pasó a usar `Jose` y `Garcia`. Esa serie consumió igualmente los 5 intentos (y el sexto dio `429` con `Retry-After: 900`), lo que confirma que los `400` cuentan. Se vació `rate_limit_attempts` y se repitió la serie completa, que es la que figura en 11.2.

## 11.6 Restauración de la base de datos
- Línea base de `calendarschool`: `users=0`, `schools=0`, `refresh_tokens=0`, `rate_limit_attempts=0`, `municipalities=542`, `_prisma_migrations=4`.
- Tras las pruebas: `users=3`, `schools=3`, `refresh_tokens=3`, `rate_limit_attempts=6`. (3 altas: dos de la serie por defecto y una con otro cliente en 11.5.)
- Limpieza: se detuvo el backend y se ejecutaron `DELETE FROM users WHERE email LIKE 'curl.limite.%'` (los refresh tokens se borran en cascada), `DELETE FROM schools WHERE name LIKE 'CEIP Curl Limite %'` y `DELETE FROM rate_limit_attempts`.
- Estado final: idéntico a la línea base (`diff` sin diferencias).

## Outcome
- Step 11 status: PASS
- Blocking issues: none
- No probado con curl: `503` del limitador con la base de datos caída (exige parar PostgreSQL; lo cubren `prismaAttemptRepository.int.test.ts`, `registerRoute.test.ts` y `registrationAttempts.int.test.ts`).
