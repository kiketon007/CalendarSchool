# Step 6 Report - Pruebas manuales con curl

- Date: 2026-10-10
- Change: us01-f-resiliencia-formulario
- Agent: Claude (Sonnet 5.5)

Este cambio no toca el backend ni el contrato: la prueba es de regresión del registro y de la unicidad ante envíos simultáneos (el escenario «Dos pestañas con el mismo email»).

## Entorno
- Backend de desarrollo (`npm run dev -w backend`, puerto 3000) sin secretos de reCAPTCHA: se registra `CAPTCHA_FAKE_VERIFIER` y se acepta cualquier token.
- `GET /api/health` → `200 {"status":"ok","database":"up"}`.

## Pruebas
1. **Dos registros simultáneos con el mismo email** (dos `curl` en paralelo, colegios distintos `CEIP Curl F A` y `CEIP Curl F B`, `captcha` v3):
   - Uno respondió `201` con el usuario y el colegio creados.
   - El otro respondió `409 {"success":false,"error":{"code":"EMAIL_ALREADY_REGISTERED",...}}`.
   - `select count(*) from users/schools` → 2 y 2 al terminar la sección, es decir, 1 + 1 de esta prueba y 1 + 1 de la siguiente (una sola cuenta por email).
2. **Registro normal** (`captcha_curl.sh f1 v3 tok`): `201 Created` con `Set-Cookie: refresh_token=<oculto>; Max-Age=86400; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`.

## Base de datos
- Línea base (`calendarschool`): `users`=0, `schools`=0, `refresh_tokens`=0, `rate_limit_attempts`=0, `municipalities`=542.
- Tras las pruebas: 2 usuarios y 2 colegios (más sus `refresh_tokens` e intentos).
- Restauración: se borraron `rate_limit_attempts`, `refresh_tokens`, `users` y `schools` de `calendarschool`; el recuento vuelve a coincidir con la línea base en las dos bases y todos los esquemas (`diff` sin diferencias). Backend detenido.

## Outcome
- Step 6 status: PASS
- Blocking issues: none
