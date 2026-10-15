## Why

Un usuario registrado no puede volver a entrar en CalendarSchool cuando pierde la sesión (24 horas, otro navegador, cookies borradas), porque no existe el inicio de sesión. Por eso el registro sigue cerrado en producción desde US00_b: abrirlo sin login dejaría cuentas a las que nadie puede volver. Este cambio implementa **US02** (`docs/User_Stories_MVP.md`, versión enriquecida el 2026-10-15) dentro del alcance de autenticación del MVP (PRD §3, módulo de autenticación) y abre `/api/auth/*` en producción.

## What Changes

- **Nuevo endpoint `POST /api/auth/login`** (`{ email, password, captcha }`), definido primero en `docs/api-spec.yml`: responde `204` con una cookie `refresh_token` nueva y deja la emisión del access token a `POST /api/auth/refresh`, como tras el registro. Orden de procesamiento: `Origin` → validación → límite de intentos → reCAPTCHA (acción `login`) → Bcrypt → estado de la cuenta.
- **Códigos de error nuevos:** `INVALID_CREDENTIALS` (`401`) y `ACCOUNT_SUSPENDED` (`403`), en el contrato y en `ERROR_CODES`.
- **Comparación de contraseñas con tiempo constante:** si el email no existe, se compara contra un hash ficticio con el mismo coste de Bcrypt.
- **Límite de intentos de login que solo cuenta los fallidos:** 10 por IP cada 15 minutos (`LOGIN_ATTEMPTS_MAX`). El limitador gana la operación de **liberar** un intento reservado: se reserva antes de comprobar la contraseña y se libera si es correcta.
- **reCAPTCHA también en el login:** el verificador deja de tener la acción `register` fija y comprueba la acción de cada operación; el frontend reutiliza el cliente y el reto v2 del registro.
- **Página `/login`** (`LoginPage`) con validación inline, mensajes por código de error, aviso de cookies, enlace a `/registro` y redirección a `/onboarding`. `/onboarding` sin sesión pasa a redirigir a `/login` (antes a `/registro`), y `/login` con sesión redirige a `/onboarding`.
- **Política de privacidad ampliada al login** (reCAPTCHA, la IP de los intentos fallidos y que los logs de actividad contienen la IP y el user agent), con una versión nueva de `PRIVACY_POLICY_VERSION` y de `privacyPolicy.lastUpdated`.
- **La sesión deja de guardar la IP y el user agent.** `refresh_tokens.ip_address` y `user_agent` se escribían desde el registro y nadie los lee, y no se purgan: la IP quedaba en la base de datos mientras existiera la cuenta, en contra de lo que dice la política. Una migración borra las dos columnas y la IP y el user agent de una sesión solo quedan en los logs (30 días).
- **BREAKING (producción): apertura de `/api/auth/*`.** Se elimina la CloudFront Function `apiGuard.js`, y el smoke test pasa a comprobar `POST /api/auth/login` → `400 VALIDATION_ERROR` en lugar de `404`. Es la última tarea, condicionada al E2E de vuelta a la sesión y a la revisión legal del texto ampliado de `/privacidad`.

### Fuera de alcance

- Avisos por email (intentos fallidos, dispositivo desconocido, «asegurar mi cuenta») y la verificación de email: el MVP no tiene proveedor de correo ni ese dato.
- Límite de intentos por email (riesgo aceptado, con reCAPTCHA frente a los ataques distribuidos).
- Prueba de carga de 1000 logins simultáneos y retención de logs de 90 días (se mantienen los 30 días).
- Dashboard y comprobación del onboarding completado (US04); cierre de sesión y revocación (US03); rotación de refresh tokens; renovación transparente tras un `401` (llega con el primer endpoint protegido).
- Purga programada de refresh tokens caducados: al dejar de guardar datos personales en ellos, ya no es una cuestión de privacidad (se verá con US03).

## Capabilities

### New Capabilities

- `user-login`: inicio de sesión con email y contraseña: contrato de `POST /api/auth/login`, orden de procesamiento, credenciales con tiempo constante, estado de la cuenta, creación de la sesión, eventos de log y la página `/login` con sus redirecciones.

### Modified Capabilities

- `attempt-limiting`: el limitador permite liberar un intento ya aceptado, para las operaciones que solo cuentan los fallidos.
- `captcha-verification`: la acción esperada de v3 la indica cada operación (`register` o `login`), y el cliente del frontend se usa también en `/login`.
- `app-configuration`: nueva variable `LOGIN_ATTEMPTS_MAX`.
- `cloud-deployment`: se elimina el requisito «Registro cerrado en producción» y se añade la apertura de la API de autenticación con su smoke test; el escenario de reCAPTCHA de la CSP deja de suponer el registro cerrado.
- `user-registration`: `/onboarding` sin sesión redirige a `/login`, y la política de privacidad cubre también el inicio de sesión y los datos de los logs.
- `session-management`: el refresh token ya no guarda la IP ni el user agent del cliente.

## Impact

- **Contrato:** `docs/api-spec.yml` (nueva operación y dos códigos); `frontend/src/api/generated/schema.ts` regenerado.
- **Backend:** nuevo caso de uso de login y sus puertos (búsqueda de usuario por email, comparación de contraseñas), `AttemptLimiter` y su repositorio Prisma (`release`), `CaptchaVerifier` (acción por operación), `errorHandler`, `authRouter`, `composeApp`, `loadConfig`, `PRIVACY_POLICY_VERSION`; `RefreshToken`, `CreateSession` y los repositorios Prisma de sesión y de registro dejan de manejar la IP y el user agent.
- **Frontend:** `LoginPage`, servicio y validación de login, `App.tsx`, `OnboardingPage`, módulo `captcha/` (reto v2 reutilizable), `es.json` y `en.json` (incluida la política de privacidad).
- **Infraestructura:** se elimina `infrastructure/functions/apiGuard.js` con su asociación en `appStack.ts` y sus tests; cambia `scripts/smoke.mjs` y sus tests.
- **Modelo de datos:** una migración borra `refresh_tokens.ip_address` y `refresh_tokens.user_agent` (sin datos en producción: el registro está cerrado). El login reutiliza `users`, `refresh_tokens` y `rate_limit_attempts`. `MODELO_DATOS.md` documenta el cambio y el uso de `rate_limit_attempts` por el login.
- **Documentación:** `README.md`, `CLAUDE.md`, `docs/arquitectura/ARQUITECTURA_COMPLETA.md`, `docs/despliegue/PUESTA_EN_MARCHA.md`, `docs/backend-standards.md`, `docs/frontend-standards.md` y `docs/User_Stories_MVP.md` (US00_b y la nota de revisión legal de US01_e).
- **Operación:** tras el despliegue, comprobación en producción del dominio y del secreto v2 de reCAPTCHA (`PUESTA_EN_MARCHA.md`).
