## Context

Hoy existen el registro (US01_b), la sesión tras el registro (US01_c: refresh token opaco de 24 horas guardado como hash, cookie `refresh_token` con `path=/api/auth` y `SameSite=Lax`, access token JWT de 15 minutos que solo emite `POST /api/auth/refresh`), el limitador genérico de intentos (US01_d) y reCAPTCHA v3/v2 (US01_e). En producción, la CloudFront Function `apiGuard.js` responde `404` a `/api/auth/*`, porque sin login nadie podría volver a entrar.

Piezas que el login reutiliza o toca:

- `AttemptLimiter.consume(key)` → `AttemptRepository.register(...)`, que acepta o rechaza con `pg_advisory_xact_lock` por clave y guarda una fila por intento aceptado. El registro lo usa como middleware en `authRouter`, antes de leer el cuerpo.
- `CaptchaVerifier.verify(captcha)`. `RecaptchaCaptchaVerifier` compara la acción con la constante `RECAPTCHA_REGISTER_ACTION`.
- `PasswordHasher.hash` (`BcryptPasswordHasher`, `@node-rs/bcrypt`, coste 12, `rejectLongPasswords`).
- `CreateSession.create(userId, context)` prepara el refresh token sin escribirlo. El registro lo guarda en su transacción, y `RefreshTokenRepository` solo tiene `findByHash`.
- `requireAllowedOrigin(appOrigin)` protege `/refresh`; `refreshTokenCookie(token)` construye la cookie.
- En el frontend: `SessionProvider` y `refresh()`, el módulo `captcha/` (`useCaptchaClient` y el reto v2 que pinta `RegisterPage`), `registrationValidation.ts` (regla de email compartida con el backend por `test-fixtures/registration-fields.json`) y `OnboardingPage`, que hoy redirige a `/registro` sin sesión.

Las decisiones de producto están en US02 (`docs/User_Stories_MVP.md`, «Decisiones tomadas»).

## Goals / Non-Goals

**Goals:**

- `POST /api/auth/login` con el orden de procesamiento de la spec `user-login` y sin consultar usuarios antes de pasar el límite y el captcha.
- Contar solo los intentos fallidos sin perder la atomicidad del limitador.
- Mismo trabajo de Bcrypt exista o no el email.
- Página `/login` que reutiliza la sesión, el captcha y los patrones de `RegisterPage`.
- Abrir `/api/auth/*` en producción como último paso, de forma reversible.

**Non-Goals:**

- Revocar sesiones o cerrar sesión (US03), rotar refresh tokens, limitar sesiones simultáneas.
- Límite por email, avisos por correo y verificación de email.
- Renovación transparente del access token tras un `401` (aún no hay endpoints protegidos).
- Más cambios en el modelo de datos que quitar la IP y el user agent de `refresh_tokens` (D11).

## Decisions

### D1. Caso de uso `LogIn` en `application/login/`, con la validación y el límite dentro

`LogIn.execute(body, context)` hace, en orden: validación Zod (`loginRequest.ts`) → `attemptLimiter.consume('login:<ip>')` → `captchaVerifier.verify(captcha, 'login')` → `userCredentialsRepository.findByEmail` → `passwordHasher.verify` → estado → `attemptLimiter.release` → guardar la sesión. Devuelve el refresh token en claro solo para el router, como `RegisterSchool`. El `Origin` lo comprueba `requireAllowedOrigin` en el router, que es lo único que conoce las cabeceras.

- *Alternativa descartada:* reutilizar el middleware de límite del registro. El registro cuenta antes de leer el cuerpo; el login valida primero (un `400` no cuenta) y necesita liberar el intento según el resultado de la contraseña. Ese ciclo de reserva y liberación pertenece al caso de uso, no a un middleware.
- Los errores nuevos `InvalidCredentials` y `AccountSuspended` viven en `domain/login/loginErrors.ts`. `errorHandler` los traduce a `401 INVALID_CREDENTIALS` y `403 ACCOUNT_SUSPENDED`.

### D2. Reservar y liberar en el limitador

- **Repositorio:** `AttemptRepository.register` devuelve `{ accepted: true, attemptId }`, y se añade `release(attemptId)`, un `deleteMany` por id, idempotente y fuera de la transacción del bloqueo.
- **Limitador:** `AttemptLimiter.consume(key)` devuelve el `attemptId`, y `AttemptLimiter.release(attemptId)` lo delega. El registro ignora el id.
- **Si liberar falla:** `LogIn` captura el error de `release`, lo registra (`LOGIN_ATTEMPT_RELEASE_FAILED`) y continúa. El usuario ya ha demostrado conocer la contraseña, y el coste de fallar es solo un intento de más en el contador.
- *Alternativa descartada:* comprobar antes y registrar después del fallo. Con dos operaciones separadas, N peticiones simultáneas pasarían la comprobación antes de que se registre ninguna, que es la carrera que el `advisory lock` evita hoy.
- *Alternativa descartada:* una columna `outcome` en `rate_limit_attempts`. Obligaría a una migración y a filtrar en el recuento, sin ventaja sobre borrar la fila.

### D3. Comparación de contraseñas con hash ficticio en el adaptador

El puerto `PasswordHasher` (que se mueve de `application/registration/` a `application/credentials/`, porque ya lo usan dos features) gana `verify(password, passwordHash: string | null): Promise<boolean>`. Con `null`, `BcryptPasswordHasher` compara contra `DUMMY_PASSWORD_HASH`, un hash Bcrypt constante de coste `BCRYPT_COST` generado una vez y versionado. Un test comprueba que su prefijo es `$2b$12$`, de modo que cambiar el coste obliga a regenerarlo. Siempre devuelve `false` con `null`.

- *Alternativa descartada:* calcular el hash ficticio al arrancar. Añade unos 250 ms a cada arranque en frío de Lambda.
- *Alternativa descartada:* esperar hasta completar ~500 ms. Cuesta tiempo facturado de Lambda y no iguala el trabajo de CPU, que es lo que mide un atacante.

### D4. Lectura de credenciales y escritura de la sesión

- **Lectura:** nuevo puerto `UserCredentialsRepository.findByEmail(email)` en `domain/user/`, que devuelve `{ id, passwordHash, status }` o `null` y usa el índice único de `users.email`. Lo implementa `PrismaUserCredentialsRepository`.
- **Escritura:** `RefreshTokenRepository` gana `save(refreshToken)`, y el login usa `CreateSession.create` + `save`.
- *Alternativa descartada:* añadir los métodos a `RegistrationRepository`, que es específico del alta y transaccional.

### D5. Acción del captcha indicada por quien llama

- **Backend:** `CaptchaVerifier.verify(captcha, expectedAction: CaptchaAction)`, con `CaptchaAction = 'register' | 'login'`. `RecaptchaCaptchaVerifier` compara con `expectedAction` (desaparece `RECAPTCHA_REGISTER_ACTION`). `FakeCaptchaVerifier` ignora la acción y conserva sus tokens reservados. `RegisterSchool` pasa `'register'`.
- **Frontend:** el cliente de `captcha/` ya recibe la acción al pedir el token, y `LoginPage` pide `'login'`.
- **Reto v2:** el que hoy pinta `RegisterPage` se extrae a un componente (`CaptchaChallenge`) si no lo es ya, para que lo usen las dos páginas.

### D6. Respuesta `204` y sesión por `/refresh`

El router responde `204` con `Set-Cookie` (`refreshTokenCookie`) y `Cache-Control: no-store`, sin cuerpo. El frontend llama a `refresh()` del contexto, igual que tras el registro. Así hay una sola operación que emite access tokens y la misma detección de cookies rechazadas.

- *Alternativa descartada:* devolver el access token en el login. Habría dos caminos de emisión, y además haría falta la comprobación de la cookie igualmente.

### D7. Frontend

- **Ficheros nuevos:**
  - `pages/LoginPage.tsx`;
  - `services/loginService.ts`, que devuelve estados como `loggedIn`, `invalidCredentials`, `accountSuspended`, `challengeRequired`, `captchaFailed`, `tooManyAttempts(retryAfter)` o `unavailable`, y nunca lanza;
  - `validation/loginValidation.ts`, que reutiliza la regla de email exportada por `registrationValidation.ts`.
- **Rutas:** `App.tsx` declara `/login`. `OnboardingPage` redirige a `/login` sin sesión. `LoginPage` redirige a `/onboarding` con sesión y muestra el indicador mientras la sesión se resuelve.
- **Patrones de `RegisterPage` que se repiten:**
  - guarda síncrona `isSubmittingRef`;
  - minutos de `Retry-After`;
  - aviso de cookies;
  - aviso de Google.

  Si al implementarlo aparece duplicación literal (el cálculo de minutos, el aviso de Google), se extrae a una utilidad o componente compartido en el mismo paso.
- **Textos:** todos van en `es.json` y `en.json`, incluida la política de privacidad ampliada.

### D8. Apertura en infraestructura

- **CloudFront Function:** se elimina `infrastructure/functions/apiGuard.js`, su asociación `viewer-request` del comportamiento `/api/*` en `appStack.ts` y sus casos en `cloudFrontFunctions.test.ts`. La plantilla deja de tener esa función, y lo comprueba un test de CDK.
- **Smoke test:** `scripts/smoke.mjs` sustituye la comprobación «registro cerrado» por `POST /api/auth/login` con `{}` y `Origin: <url>`, esperando `400 VALIDATION_ERROR`. Llega al backend sin tocar la base de datos ni el contador, porque la validación va antes del límite.
- *Alternativa descartada:* dejar la función sin condición. Sería código muerto en cada petición a la API.

### D9. Configuración y tests

- **Configuración:**
  - `LOGIN_ATTEMPTS_MAX` entra en `loadConfig` (10 por defecto). Vale 1000 en `test/support/realApp.ts` y en `scripts/e2e.mjs`, porque todo el E2E sale de una IP.
  - La ventana `LOGIN_ATTEMPTS_WINDOW_MS = 15 min` es una constante en `application/login/`.
- **Tests:**
  - **Integración:** reserva y liberación contra PostgreSQL real.
  - **E2E:** el reto se fuerza sustituyendo el token por `fake-low-score` con un `intercept`, como en `registration.cy.ts`. La cuenta suspendida se prepara con una actualización directa en la base de datos de test desde una tarea de Cypress.

### D10. Política de privacidad

El texto de `privacyPolicy` se amplía al login: los datos del formulario, reCAPTCHA en el login, la IP de los intentos fallidos y que los logs de actividad (30 días) contienen la IP y el user agent de las peticiones. `privacyPolicy.lastUpdated` y `PRIVACY_POLICY_VERSION` pasan a la fecha del cambio de texto, y el test existente obliga a que coincidan.

### D11. La sesión deja de guardar la IP y el user agent

`refresh_tokens.ip_address` y `user_agent` se escriben desde US01_c, pero nada los lee (solo `CreateSession` los escribe), no hay purga de `refresh_tokens` y el borrado solo llega en cascada con el usuario. Eso contradice la política de privacidad, que dice que la IP se conserva como máximo unas 48 horas, y es un dato personal sin finalidad. Se borran las dos columnas.

- **Dominio y aplicación:** `RefreshToken` pierde `userAgent` e `ipAddress`, y `CreateSession.create(userId)` ya no necesita el `RequestContext`. `RegisterSchool` y `LogIn` siguen recibiendo el contexto, que usan para los logs.
- **Infraestructura:** `schema.prisma` y una migración de Prisma con `DROP COLUMN` de las dos columnas; `PrismaRefreshTokenRepository` y `PrismaRegistrationRepository` dejan de mapearlas.
- **Dónde quedan la IP y el user agent de una sesión:** solo en los logs de actividad (`USER_LOGIN_SUCCESS`, `SESSION_REFRESHED`...), 30 días, y la política lo dice (D10).
- *Alternativa descartada, solo documentarlo (A):* la política sería cierta, pero reconocería que se guarda sin límite un dato que no se usa.
- *Alternativa descartada, purgar los tokens caducados (B):* un SQL, un paso en `backup.yml` y un plazo en el texto, para conservar unos datos que ninguna historia del MVP necesita. Si US03 los necesita, se reintroducen con su purga y su texto.
- *Alternativa descartada, quitar solo la IP:* el user agent, junto con otros datos, también identifica, y tampoco se usa.

## Risks / Trade-offs

- **[Dos operaciones de base de datos por login correcto (reserva y liberación)]** → Cada una tarda unos milisegundos frente a los ~250 ms de Bcrypt. Si la liberación falla, el usuario entra igualmente (D2).
- **[Bcrypt de coste 12 en Lambda: ~250–400 ms por login, también para los emails inexistentes]** → Es el coste aceptado para no revelar qué emails existen. El throttling de API Gateway (10 req/s) y el límite por IP acotan el gasto.
- **[Caída de Google bloquea todos los logins]** → Riesgo aceptado en US02: las sesiones abiertas siguen funcionando 24 horas, y se revisará si las caídas resultan frecuentes.
- **[IP compartida en un colegio (NAT)]** → Solo cuentan los fallos, el máximo es 10 y es configurable sin desplegar código, desde SSM.
- **[Ataque distribuido contra una cuenta]** → Lo frena reCAPTCHA. El límite por email queda fuera hasta que haya avisos por correo.
- **[Abrir `/api/auth/*` expone también el registro]** → Ya tiene límite, captcha, consentimiento y CSP (`publicacion-registro`). La apertura va al final y exige la revisión legal confirmada.
- **[Volver a un despliegue anterior a esta migración]** → el código antiguo espera las dos columnas, que ya no existen. En producción no hay datos ni tráfico a `/api/auth/*` (cerrado), y el rollback de la apertura (`workflow_dispatch` con la referencia anterior) vuelve a una versión que ya lleva la migración. No se usa un cambio en dos pasos (dejar de escribir y borrar después) porque ninguna instancia con tráfico depende de las columnas.
- **[El login no se puede probar en producción antes de abrir]** → `apiGuard` también cierra `/api/auth/login`. La comprobación previa es el E2E contra `vite preview` con la misma CSP, y la posterior es el smoke test más la prueba manual con claves reales.

## Migration Plan

1. Todo el cambio, salvo la apertura, se despliega con `/api/auth/*` aún cerrado. El backend nuevo queda inaccesible desde fuera y el smoke test sigue esperando `404`. La migración que borra `ip_address` y `user_agent` de `refresh_tokens` se aplica en este despliegue, antes de publicar el backend (como todas); no hay filas en producción.
2. **Última tarea:** eliminar `apiGuard` y cambiar el smoke test, solo con el E2E en verde y la revisión legal confirmada por la persona responsable.
3. **Tras el despliegue:**
   - smoke test en verde;
   - login manual con un email no registrado y claves reales: `401` sin violaciones de CSP;
   - comprobación del dominio y del secreto v2 según `docs/despliegue/PUESTA_EN_MARCHA.md`.
4. **Rollback:** `workflow_dispatch` del despliegue con la referencia anterior a la apertura. CDK vuelve a crear `apiGuard` y `/api/auth/*` queda cerrado de nuevo. No hay migraciones que revertir.

## Open Questions

- **Fecha de la nueva versión de la política:** se fija cuando se escriba el texto ampliado, y puede cambiar si la revisión legal pide retoques. La revisión debe confirmarse antes de la tarea de apertura.
