# Step 11 Report - Manual Endpoint Testing with curl

- Date: 2026-10-10
- Change: us01-e-recaptcha-registro
- Agent: Claude (Sonnet 5.5)
- Entorno: backend de desarrollo en `http://localhost:3000` (`node --env-file-if-exists=.env --import tsx src/server.ts`) contra la base `calendarschool` de PostgreSQL 18 (Docker), con `REGISTRATION_ATTEMPTS_MAX=1000` para que la serie no choque con el límite de US01_d. Datos de prueba: `curl.captcha.<marca>@example.com` y `CEIP Curl Captcha <marca>` (nombres sin acentos: la consola no usa UTF-8, ver el informe de US01_d).

## 11.1 Arranque con el verificador falso
- `GET /api/health` → `200`.
- El log de arranque, sin secretos de reCAPTCHA, incluye `{"level":"warn","event":"CAPTCHA_FAKE_VERIFIER","msg":"Sin secretos de reCAPTCHA: se usa el verificador falso, que acepta casi cualquier token. Solo para desarrollo, tests y E2E"}`. Con secretos, ese aviso no aparece (0 avisos).

## 11.2 Los tokens reservados del verificador falso
| # | Petición | Respuesta |
|---|---|---|
| 1 | `captcha: { version: 'v3', token: 'cualquier-token' }` | `201 Created` con `Set-Cookie: refresh_token=…; Max-Age=86400; Path=/api/auth; HttpOnly; Secure; SameSite=Lax` |
| 2 | `fake-low-score` (v3) | `422 CAPTCHA_CHALLENGE_REQUIRED`, sin cookie |
| 3 | los mismos datos con `version: 'v2'` y un token (el reto resuelto) | `201 Created` con cookie |
| 4 | `fake-fail` | `422 CAPTCHA_FAILED` |
| 5 | `fake-unavailable` | `503 CAPTCHA_UNAVAILABLE` («La verificación de reCAPTCHA no está disponible») |
| 6 | sin campo `captcha` | `422 CAPTCHA_FAILED` (no `400`) |
| 7 | versión desconocida (`v1`) | `422 CAPTCHA_FAILED` |
| 8 | email sin `@` junto con `fake-fail` | `422 CAPTCHA_FAILED`: el captcha se verifica antes que la validación |

- Solo los casos 1 y 3 crearon datos: 2 usuarios, 2 colegios y 2 refresh tokens. Los 8 intentos quedaron registrados en `rate_limit_attempts` (el límite de US01_d cuenta también los rechazos por captcha).
- Eventos de log: `USER_REGISTER_CAPTCHA_CHALLENGE` (`info`, `score=0.3`) y 4 `USER_REGISTER_CAPTCHA_FAILED` (`warn`) con `reason` `INVALID` (×2) y `MISSING` (×2) y `version` cuando la hay. La indisponibilidad se registró como error (`CaptchaUnavailable`, con su causa) una sola vez.
- **Ningún token del captcha ni email aparece en el log** (0 coincidencias de `cualquier-token`, `fake-*`, `token-del-reto` y `curl.captcha`).

## 11.3 Producción sin secretos
- `NODE_ENV=production` sin secretos: no arranca (exit 1) con `ConfigError: Configuración inválida: revisa las variables de entorno RECAPTCHA_V2_SECRET, RECAPTCHA_V3_SECRET`.
- Solo `RECAPTCHA_V3_SECRET` definida (desarrollo): no arranca y nombra `RECAPTCHA_V2_SECRET`.
- Ningún mensaje muestra el valor de un secreto.

## 11.4 Pruebas contra Google real (sin claves propias)
**La prueba con claves de Google Cloud propias sigue pendiente** (aún no existen) y es requisito antes de publicar el registro. Aun así, el adaptador real se ha probado contra el endpoint real de Google (`https://www.google.com/recaptcha/api/siteverify`, 230–580 ms por llamada):

| Prueba | Resultado |
|---|---|
| Secretos inventados y un token inventado | Google responde `{"success":false,"error-codes":["invalid-input-response"]}` → el adaptador responde `422 CAPTCHA_FAILED` (motivo `INVALID`), en v3 y en v2 |
| Respuesta cruda de Google con secreto inventado y **sin** token, o con token y **sin** secreto | también `invalid-input-response` |
| Secreto de prueba público de reCAPTCHA v2 de Google (documentado para pruebas automáticas), `APP_ORIGIN=http://testkey.google.com:5173`, token v2 cualquiera | Google responde `success: true` con `hostname: testkey.google.com` → `201 Created`: la ruta v2 funciona de extremo a extremo con Google real |
| Mismo secreto y token v3 | Google no devuelve acción ni score → `422 CAPTCHA_FAILED`, motivo `ACTION_MISMATCH` |
| Mismo secreto, token v2 y `APP_ORIGIN=http://localhost:5173` | Google devuelve `testkey.google.com` → `422 CAPTCHA_FAILED`, motivo `HOSTNAME_MISMATCH` |

### Lo que se ha aprendido de Google
- **Google valida primero el token**: con un token inválido responde `invalid-input-response` aunque el secreto sea inválido o falte. Por eso `invalid-input-secret` (que el adaptador traduce a `503 CAPTCHA_UNAVAILABLE`, porque es un fallo de configuración nuestro) solo aparecerá con un token de formato válido y un secreto equivocado, y no se ha podido provocar sin claves. Su traducción está cubierta por los tests con la forma documentada de la respuesta.
- La forma real de la respuesta (`success`, `challenge_ts`, `hostname`, `error-codes`) coincide con el esquema del adaptador.
- No se ha podido responder la pregunta del spike (si las claves nuevas de Google Cloud admiten `siteverify`): las claves de prueba son clásicas.

## 11.5 Restauración de la base de datos
- Línea base de `calendarschool`: `users=0`, `schools=0`, `refresh_tokens=0`, `rate_limit_attempts=0`, `municipalities=542`, `_prisma_migrations=4`.
- Tras las pruebas: `users=3`, `schools=3`, `refresh_tokens=3`, `rate_limit_attempts=13`.
- Limpieza: se detuvo el backend y se ejecutaron `DELETE FROM users WHERE email LIKE 'curl.captcha.%'` (los refresh tokens se borran en cascada), `DELETE FROM schools WHERE name LIKE 'CEIP Curl Captcha %'` y `DELETE FROM rate_limit_attempts`.
- Estado final: idéntico a la línea base (`diff` sin diferencias).

## Outcome
- Step 11 status: PASS (con la prueba de claves propias pendiente, como preveía la tarea)
- Blocking issues: none
