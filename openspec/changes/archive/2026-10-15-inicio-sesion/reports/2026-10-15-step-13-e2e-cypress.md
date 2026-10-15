# Informe del paso 13 - E2E con Cypress

- Fecha: 2026-10-15
- Cambio: inicio-sesion
- Agente: Claude Sonnet 5.5

## Entorno

- `npm run test:e2e` (`scripts/e2e.mjs`): compila los dos workspaces, aplica las migraciones al esquema `public` de `calendarschool_test`, vacía los datos de esa base (menos `_prisma_migrations` y `municipalities`), arranca el backend compilado en `:3001` y `vite preview` en `:4173` (con la misma `Content-Security-Policy` que CloudFront) y lanza Cypress 16.1.1 en modo headless con Electron.
- Verificador de captcha falso (sin claves de reCAPTCHA) y `LOGIN_ATTEMPTS_MAX=1000` y `REGISTRATION_ATTEMPTS_MAX=1000`: todas las peticiones de Cypress salen de la misma IP, y los límites reales se prueban en los tests de integración.
- Los datos de cada test son únicos por ejecución (`Date.now()` y un contador), porque la base solo se vacía al empezar.

## Cambios en la infraestructura de los E2E

- **Tarea de Cypress `setUserStatus`** (`frontend/cypress.config.ts` → `scripts/e2eData.mjs`): cambia el estado de un usuario en la base de test, para preparar una cuenta `SUSPENDED` (la aplicación aún no puede suspender a nadie: US02_b). Solo actúa sobre bases cuyo nombre termina en `_test`, valida el nombre del esquema y el estado, y no incluye credenciales en sus errores. 7 tests de integración en `backend/test/support/e2eData.int.test.ts`.
- `scripts/e2e.mjs` pasa la URL de la base de test a Cypress en `E2E_DATABASE_URL`, y el backend del E2E arranca con `LOGIN_ATTEMPTS_MAX=1000`.

## Specs escritas o actualizadas

- **`login.cy.ts` (nuevo, 21 tests):**
  - *Vuelta tras perder la sesión:* registro por el formulario → sin cookies → `/onboarding` redirige a `/login` → login → `/onboarding` con el nombre del colegio; la cookie `refresh_token` es `httpOnly`, `secure`, `sameSite=lax`, `Path=/api/auth`, de 24 horas y no legible desde `document.cookie`; ni el almacenamiento del navegador ni el HTML guardan la contraseña o un token; email en mayúsculas y con espacios; recarga de Onboarding conserva la sesión.
  - *Con sesión:* `/login` lleva a `/onboarding` sin mostrar el formulario.
  - *Credenciales inválidas:* mensaje genérico, email conservado y contraseña vacía, sin cookie; el mismo mensaje para un email no registrado (una sola alerta); reintento con la contraseña correcta; formulario vacío o con email mal formado no hace ninguna petición y mueve el foco al primer campo inválido.
  - *Cuenta suspendida:* mensaje específico, sin sesión, formulario usable; con una contraseña incorrecta, el `401` genérico y sin revelar el estado.
  - *Reto v2:* con `fake-low-score` (sustituyendo el token con `cy.intercept`) aparece el reto, se conservan los datos, no hay alertas y el botón queda bloqueado hasta resolverlo; resuelto, el login se completa con `{ version: 'v2', token: 'fake-v2-token' }`. Captcha fallido y Google no disponible muestran su mensaje sin detalles técnicos.
  - *Fallos del servicio:* `429` con `Retry-After: 840` indica «14 minutos»; sesión rechazada tras un login correcto avisa de las cookies sin navegar; sin conexión, error temporal sin el texto técnico.
  - *La página:* enlace a `/registro`, enlace de «email ya registrado» del registro hacia `/login`, aviso de Google y script de reCAPTCHA sin cargar sin claves.
- **`csp.cy.ts` (ampliado, 9 tests):** la cabecera de `/registro` y de `/login` es la del JSON y no hay `Report-Only`; `/login` carga sin violaciones; un login completo, del formulario a Onboarding, tampoco las provoca.
- **`session.cy.ts` (1 test actualizado):** sin sesión, `/onboarding` redirige a `/login` (antes a `/registro`).
- **`registration.cy.ts` (solo la clave de i18n):** `es.registration.captcha.*` pasa a `es.captcha.*`, porque esos textos se comparten ahora con el login.

## Comandos ejecutados y resultados

1. `npm run test:e2e -- --spec "cypress/e2e/login.cy.ts,cypress/e2e/csp.cy.ts"` (50 s): 30 pasan (21 + 9), 0 fallan, 0 pendientes.
2. `npm run test:e2e` completo (93 s): **78 pasan, 0 fallan, 0 pendientes**, en 6 specs: `csp` 9, `health` 1, `home` 1, `login` 21, `registration` 33, `session` 13.
3. Tras la migración que borra `ip_address` y `user_agent` de `refresh_tokens` (tareas 4.6 a 4.8), `npm run test:e2e` completo otra vez (95 s): el script aplicó la migración al esquema `public` de la base de test («Applying migration `20261015141957_drop_refresh_token_client_data`»), la tabla quedó con `created_at`, `expires_at`, `id`, `revoked_at`, `token_hash` y `user_id`, y **78 pasan, 0 fallan**.

Ninguna ejecución necesitó reintentos ni hubo tests inestables.

## Persistencia y estado de la base de datos

- Tras la primera ejecución completa, `public` de `calendarschool_test` contenía `municipalities` 542, `schools` 37, `users` 37 (35 `ACTIVE` y 2 `SUSPENDED`, los de las pruebas de cuenta suspendida), `refresh_tokens` 46 (como máximo 2 sesiones por usuario) y `rate_limit_attempts` 55, 7 de ellos intentos de login fallidos: lo que los escenarios dejan, y los estados que preparan.
- Restauración: `TRUNCATE` de `refresh_tokens`, `users`, `schools` y `rate_limit_attempts` en `public` de `calendarschool_test`, el mismo criterio que `cleanE2eData`. Se hizo tras cada ejecución completa.
- Comparación con `diff` del recuento de las cinco tablas en todos los esquemas: tras la segunda restauración, `calendarschool_test` y `calendarschool` quedan **idénticas** al estado previo (`municipalities` 542 y el resto a 0). Los esquemas `test_N` no los usa el E2E.
- Los puertos 3001 y 4173 quedan libres.

## Notas

- Los logs del backend durante el E2E incluyen un `error` con la traza de `CaptchaUnavailable`: es el fallo simulado de reCAPTCHA que provoca el test de «Google no disponible» (`fake-unavailable`), registrado por el manejador central de errores como corresponde. Ningún log del E2E contiene contraseñas ni tokens; los emails salen enmascarados (`l***@example.com`).
- **No se ejecutó reCAPTCHA real.** Todo corre con el verificador falso. La comprobación con claves reales (dominio y secreto v2) es la tarea 16.6 y solo es posible con el registro abierto.
- Estos E2E no sustituyen a los tests de integración del límite de intentos (que usan un máximo de 3 y un reloj controlado), porque aquí el máximo es 1000.

## Resultado

- Estado del paso 13: **PASS**
- Incidencias bloqueantes: ninguna.
