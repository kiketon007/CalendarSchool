## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/inicio-sesion` desde `main` actualizado, llevando los artefactos de este cambio y la versión enriquecida de US02 (`docs/User_Stories_MVP.md`)
- [x] 0.2 Verificar que la rama actual es `feature/inicio-sesion` y que el árbol de trabajo solo contiene esos ficheros

## 1. Contrato de la API (D1, D6)

- [x] 1.1 Añadir a `docs/api-spec.yml` `POST /api/auth/login`: cuerpo `{ email, password, captcha }`, `204` sin cuerpo con `Set-Cookie`, y `400`, `401`, `403`, `422`, `429` y `503` reutilizando `components.responses`; añadir `INVALID_CREDENTIALS` y `ACCOUNT_SUSPENDED` al enum `ErrorCode` y al esquema de los errores que corresponda
- [x] 1.2 Verificar que `appError.test.ts` falla; añadir los dos códigos a `ERROR_CODES` y verificar que pasa
- [x] 1.3 Regenerar los tipos con `npm run api:types -w frontend`, fijar la petición y los códigos en `api/schema.test.ts` (`expectTypeOf`) y verificar con `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`

## 2. Backend: limitador con liberación (TDD, D2)

- [x] 2.1 Escribir en `attemptLimiter.test.ts` que `consume` devuelve el id del intento aceptado y que `release(id)` lo delega en el repositorio; verificar que falla
- [x] 2.2 Cambiar `AttemptRepository.register` para devolver `{ accepted: true, attemptId }`, añadir `release(attemptId)` al puerto y a `AttemptLimiter`, y adaptar los dobles; verificar que pasa y que `LimitRegistrationAttempts` no cambia de comportamiento
- [x] 2.3 Escribir en `prismaAttemptRepository.int.test.ts` los escenarios de «Liberación de un intento aceptado» (liberado, solo ese, en vuelo cuentan, liberación repetida); verificar que falla
- [x] 2.4 Implementar `release` en `PrismaAttemptRepository` (`deleteMany` por id) y devolver el id en `register`; verificar que pasa

## 3. Backend: captcha con acción por operación (TDD, D5)

- [x] 3.1 Escribir en `recaptchaCaptchaVerifier.test.ts` que acepta la acción `login` cuando se espera `login` y rechaza `register` en ese caso (y al revés); verificar que falla
- [x] 3.2 Añadir el tipo `CaptchaAction` y el parámetro `expectedAction` a `CaptchaVerifier.verify`, compararlo en `RecaptchaCaptchaVerifier` (eliminar `RECAPTCHA_REGISTER_ACTION`), aceptarlo e ignorarlo en `FakeCaptchaVerifier`, y pasar `'register'` desde `RegisterSchool` (con su test); verificar que pasan todos los tests del captcha y del registro

## 4. Backend: contraseñas y credenciales (TDD, D3, D4)

- [x] 4.1 Mover el puerto `PasswordHasher` a `application/credentials/` y actualizar sus importaciones; verificar `npm run typecheck --workspaces`
- [x] 4.2 Escribir en `bcryptPasswordHasher.test.ts`: `verify` devuelve `true` con la contraseña correcta y `false` con otra; con `null` devuelve `false` tras comparar contra `DUMMY_PASSWORD_HASH`; el prefijo de `DUMMY_PASSWORD_HASH` es `$2b$<BCRYPT_COST>$`. Verificar que falla
- [x] 4.3 Generar `DUMMY_PASSWORD_HASH` una vez con `BCRYPT_COST`, añadir `verify` al puerto y a `BcryptPasswordHasher` y verificar que pasa
- [x] 4.4 Crear el puerto `UserCredentialsRepository.findByEmail` en `domain/user/` y escribir el `*.int.test.ts` de `PrismaUserCredentialsRepository` (usuario existente con `id`, `passwordHash` y `status`; email inexistente → `null`; base de datos caída → `DatabaseUnavailable`); verificar que falla, implementarlo y verificar que pasa
- [x] 4.5 Escribir en `prismaRefreshTokenRepository.int.test.ts` que `save` guarda la fila con su hash, caducidad, user agent e IP; verificar que falla, añadir `save` al puerto y al repositorio Prisma y verificar que pasa
- [x] 4.6 Escribir los tests de «sin IP ni user agent» y verificar que fallan: `createSession.test.ts` (el registro del refresh token no lleva `userAgent` ni `ipAddress` y `create` solo recibe el id del usuario), `prismaRefreshTokenRepository.int.test.ts` y `prismaRegistrationRepository.int.test.ts` (lo guardado no incluye esos campos), `refreshTokenSchema.int.test.ts` (la tabla no tiene las columnas `ip_address` ni `user_agent`) y `login.int.test.ts` y `session.int.test.ts` (ningún valor de `refresh_tokens` contiene la IP ni el user agent de la petición)
- [x] 4.7 Quitar `userAgent` e `ipAddress` de `RefreshToken` (dominio) y el contexto de `CreateSession.create(userId)`; adaptar `RegisterSchool`, `LogIn` y los dobles de los tests; verificar `npm run typecheck --workspaces` y los tests unitarios
- [x] 4.8 Quitar las dos columnas de `RefreshToken` en `schema.prisma`, crear la migración con `prisma migrate dev --create-only` (`DROP COLUMN` de `ip_address` y `user_agent`) y aplicarla con `npm run db:migrate`; ajustar `PrismaRefreshTokenRepository` y `PrismaRegistrationRepository`, regenerar el cliente y verificar que pasan los tests de 4.6 y toda la suite de integración

## 5. Backend: caso de uso `LogIn` (TDD, D1)

- [x] 5.1 Crear los errores `InvalidCredentials` y `AccountSuspended` en `domain/login/loginErrors.ts` con su test
- [x] 5.2 Escribir `loginRequest.test.ts`: email normalizado con la regla de `test-fixtures/registration-fields.json`, contraseña obligatoria de hasta 72 bytes sin reglas de variedad, `REQUIRED`, `INVALID_FORMAT` o `INVALID_LENGTH` por campo; verificar que falla, implementar `loginRequest.ts` y verificar que pasa
- [x] 5.3 Escribir `logIn.test.ts` con dobles para el orden de procesamiento: validación inválida → `ValidationError` sin `consume`; `TooManyAttempts` → sin captcha ni consulta (y evento `USER_LOGIN_RATE_LIMITED`); captcha rechazado o con reto → sin consulta y sin `release`, con la acción `login`; verificar que falla e implementar lo mínimo para que pase
- [x] 5.4 Escribir en `logIn.test.ts` las ramas de credenciales: email inexistente → `verify(password, null)` e `InvalidCredentials` (`reason` `NOT_FOUND`); contraseña incorrecta → `InvalidCredentials` (`PASSWORD`); `DELETED` → `InvalidCredentials` (`NOT_FOUND`); `SUSPENDED` con contraseña correcta → `release` y `AccountSuspended`; con incorrecta → `InvalidCredentials`. Verificar que falla e implementarlo
- [x] 5.5 Escribir en `logIn.test.ts` el login correcto: `release`, `CreateSession.create` + `save`, devuelve el token en claro y registra `USER_LOGIN_SUCCESS` con el email enmascarado; si `release` falla, el login continúa y se registra `LOGIN_ATTEMPT_RELEASE_FAILED`; ningún log contiene la contraseña ni los tokens. Verificar que falla e implementarlo
- [x] 5.6 Definir `LOGIN_ATTEMPTS_WINDOW_MS` (15 minutos) en `application/login/` y añadirla al test de `ATTEMPT_RETENTION_HOURS` (ninguna ventana igual o mayor que 24 horas)

## 6. Backend: configuración y presentación (TDD, D6, D9)

- [x] 6.1 Escribir en `config.test.ts` los escenarios de `LOGIN_ATTEMPTS_MAX` (por defecto 10, válido 1000, inválidos `0` y `2.5`); verificar que falla, implementarlo en `loadConfig` y documentarlo en `backend/.env.example`; verificar que pasa
- [x] 6.2 Escribir en `errorHandler.test.ts` la traducción de `InvalidCredentials` → `401 INVALID_CREDENTIALS` y `AccountSuspended` → `403 ACCOUNT_SUSPENDED` (mismo cuerpo genérico para todo `401`); verificar que falla e implementarlo
- [x] 6.3 Escribir `loginRoute.test.ts` (dobles): `Origin` ajeno o ausente → `403 ORIGIN_NOT_ALLOWED` sin llamar al caso de uso; login correcto → `204` sin cuerpo, `Set-Cookie` de `refresh_token` y `Cache-Control: no-store`; una cookie recibida no llega al caso de uso. Verificar que falla, añadir la ruta a `authRouter` con `requireAllowedOrigin` y verificar que pasa
- [x] 6.4 Cablear en `composeApp` el `AttemptLimiter` del login (`loginAttemptsMax`, `LOGIN_ATTEMPTS_WINDOW_MS`), los repositorios nuevos y `LogIn`; dar a `defaultDependencies` un doble de `LogIn` y a `realApp` `loginAttemptsMax: 1000`; verificar `npm run typecheck --workspaces`
- [x] 6.5 Escribir el test de integración de `POST /api/auth/login` (`realApp`): registro y login correcto (`204`, cookie, `refresh` devuelve el usuario y no queda intento); contraseña incorrecta y email inexistente con la misma respuesta `401`; `SUSPENDED` → `403`; cookie previa sustituida; dos sesiones válidas; `{}` → `400` sin filas en `rate_limit_attempts`. Verificar que pasa
- [x] 6.6 Escribir el test de integración del límite con un `realApp` de `loginAttemptsMax: 3`: tres fallos y el cuarto (correcto) → `429` con `Retry-After`; cinco logins correctos seguidos → `204`; seis fallos simultáneos → como mucho tres comparan la contraseña

## 7. Política de privacidad ampliada (D10)

- [x] 7.1 Ampliar `PrivacyPolicyPage.test.tsx`: la página menciona los datos del inicio de sesión, reCAPTCHA en el inicio de sesión y la IP de los intentos fallidos; verificar que falla
- [x] 7.2 Ampliar el texto de `privacyPolicy.*` en `es.json` y `en.json`, y cambiar `privacyPolicy.lastUpdated` y `PRIVACY_POLICY_VERSION` a la fecha del nuevo texto; verificar que pasan ese test, el de la versión (`privacyPolicy.test.ts`) y `locales.test.ts`
- [x] 7.3 Ampliar `PrivacyPolicyPage.test.tsx`: la sección de IP y la de plazos dicen que los logs de actividad contienen la IP y el user agent de las peticiones durante 30 días; verificar que falla
- [x] 7.4 Ampliar el texto de `privacyPolicy.*` en `es.json` y `en.json` con esa frase (el texto aún no se ha publicado, así que la fecha de la versión sigue siendo la misma); verificar que pasan ese test, el de la versión (`privacyPolicy.test.ts`) y `locales.test.ts`
- [x] 7.5 Pedir a la persona usuaria la revisión legal del texto ampliado y aplicar sus cambios; si cambia el texto tras la revisión, actualizar la fecha de la versión en los tres sitios

## 8. Frontend: captcha y validación compartidos (TDD, D5, D7)

- [x] 8.1 Extraer el reto v2 de `RegisterPage` a un componente reutilizable (si no lo es ya) y el cálculo de minutos de `Retry-After` a una utilidad, con sus tests; verificar que los tests de `RegisterPage` siguen pasando sin cambios
- [x] 8.2 Exportar la regla de email de `registrationValidation.ts` y escribir `loginValidation.test.ts` (obligatorios y formato de email, recorriendo los ejemplos de email de la tabla compartida); verificar que falla, implementar `loginValidation.ts` y verificar que pasa
- [x] 8.3 Escribir `loginService.test.ts`: `204` → `loggedIn`; `401` → `invalidCredentials`; `403 ACCOUNT_SUSPENDED` → `accountSuspended`; `422` → `challengeRequired`/`captchaFailed`; `429` con `Retry-After`; `503`, otros códigos y error de red → `unavailable`; nunca lanza. Verificar que falla, implementarlo y verificar que pasa

## 9. Frontend: página `/login` y redirecciones (TDD, D7)

- [x] 9.1 Escribir `LoginPage.test.tsx` con los escenarios de «Página de inicio de sesión»: errores inline con `role="alert"` y `aria-describedby`, sin token ni petición si la validación falla, token v3 con la acción `login`, doble envío, enlace a `/registro` y aviso de Google; verificar que falla
- [x] 9.2 Implementar `LoginPage` con sus textos en `es.json` y `en.json` y la ruta `/login` en `App.tsx`; verificar que pasa
- [x] 9.3 Escribir en `LoginPage.test.tsx` los escenarios de «Respuestas del servidor en la página de inicio de sesión» (incluidos el reto v2, el aviso de cookies y el script que no carga); verificar que falla, implementarlo y verificar que pasa
- [x] 9.4 Escribir las redirecciones: `/login` con sesión → `/onboarding`, indicador mientras se resuelve, y `/onboarding` sin sesión → `/login` (actualizar el test existente de `OnboardingPage`); verificar que falla, implementarlo y verificar que pasa
- [x] 9.5 Escribir `LoginPage.a11y.test.tsx` sin violaciones WCAG 2.1 AA con el formulario vacío, con errores y con el reto

## 10. Revisar y actualizar los tests unitarios (MANDATORY)

- [x] 10.1 Revisar los tests afectados por los cambios de firma (`CaptchaVerifier.verify`, `AttemptRepository.register`, `PasswordHasher`) y por la redirección de `/onboarding` (unitarios y `session.cy.ts`), y actualizarlos
- [x] 10.2 Añadir `LOGIN_ATTEMPTS_MAX=1000` a `scripts/e2e.mjs` junto a `REGISTRATION_ATTEMPTS_MAX`
- [x] 10.3 Verificar que ningún test depende de que `/onboarding` sin sesión lleve a `/registro`

## 11. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 11.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 11.2 Ejecutar los tests de los módulos modificados de backend, frontend e infraestructura
- [x] 11.3 Ejecutar `npm test`, `npm test -w infrastructure`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 11.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 11.5 Crear el informe `reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`
- [x] 11.6 Repetir 11.2, 11.3 y 11.4 tras las tareas 4.6 a 4.8 y 7.3 a 7.4, y añadir al informe del paso 11 un apartado con el resultado

## 12. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 En local, con el backend arrancado y el verificador falso: registrar un usuario y hacer login correcto (`204` con `Set-Cookie`, `refresh` con esa cookie → `200`, sin fila en `rate_limit_attempts`); contraseña incorrecta y email inexistente → `401` idénticos; `{}` → `400` sin contar; sin `Origin` → `403`; token `fake-low-score` → `422 CAPTCHA_CHALLENGE_REQUIRED`; usuario puesto en `SUSPENDED` → `403 ACCOUNT_SUSPENDED`
- [x] 12.2 Con `LOGIN_ATTEMPTS_MAX=3`: tres fallos y el cuarto → `429` con `Retry-After`
- [x] 12.3 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 12.4 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-12-curl-manual-testing.md`

## 13. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Escribir `login.cy.ts`: registro → borrar cookies → `/onboarding` redirige a `/login` → login → `/onboarding` con la cookie `httpOnly`, `secure` y `sameSite=lax`; contraseña incorrecta; reto v2 con `fake-low-score` (sustituyendo el token con `intercept`) que, resuelto, completa el login; cuenta suspendida (preparada con una tarea de Cypress sobre la base de test); `/login` con sesión → `/onboarding`
- [x] 13.2 Ampliar `csp.cy.ts` para que `/login` cargue sin violaciones de CSP
- [x] 13.3 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 13.4 Verificar y restaurar la base de datos de test
- [x] 13.5 Repetir la suite E2E completa (`npm run test:e2e`) tras la migración de 4.8, y restaurar y comprobar de nuevo la base de datos de test
- [x] 13.6 Documentar el resultado, incluida la repetición de 13.5, en `reports/YYYY-MM-DD-step-13-e2e-cypress.md`

## 14. Actualizar la documentación técnica (MANDATORY)

- [x] 14.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (reservar y liberar intentos, comparación con hash ficticio) y `docs/frontend-standards.md` (página de login y redirecciones), si añaden una regla nueva
- [x] 14.2 Actualizar `README.md` y `CLAUDE.md` (login, `/login`, `LOGIN_ATTEMPTS_MAX`, `/onboarding` → `/login`), y `docs/arquitectura/ARQUITECTURA_COMPLETA.md` (login)
- [x] 14.3 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md`: `refresh_tokens` sin `userAgent` ni `ipAddress` (con una nota de que la IP y el user agent de una sesión solo están en los logs) y los usos de `rate_limit_attempts` (clave `login:<ip>`); y la descripción de `refresh_tokens` del `README.md`
- [x] 14.4 Actualizar `docs/User_Stories_MVP.md`: US02 («Base de datos: sin migraciones» pasa a una migración que borra `ip_address` y `user_agent` de `refresh_tokens`) y una nota en la decisión «Persistencia de los refresh tokens» de US01_c de que la IP y el user agent ya no se guardan
- [x] 14.5 Verificar con `openspec validate inicio-sesion --strict` que el cambio es válido

## 15. Despliegue con el registro aún cerrado

- [ ] 15.1 Abrir la PR con los grupos 0–14 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test (que sigue esperando `404` en `/api/auth/*`)
- [ ] 15.2 Comprobar con `curl` que `/login` responde `200` con la CSP completa y que `POST /api/auth/login` sigue respondiendo `404 NOT_FOUND` de CloudFront

## 16. Apertura de `/api/auth/*` (D8; condición: E2E en verde y revisión legal confirmada)

- [ ] 16.1 Confirmar con la persona usuaria que la revisión legal del texto ampliado de `/privacidad` está hecha
- [ ] 16.2 Escribir en el test de CDK que el comportamiento `/api/*` no tiene ninguna CloudFront Function asociada; verificar que falla, eliminar `infrastructure/functions/apiGuard.js`, su asociación en `appStack.ts` y sus casos en `cloudFrontFunctions.test.ts`, y verificar que pasa
- [ ] 16.3 Cambiar en el test del smoke test la comprobación de «registro cerrado» por `POST /api/auth/login` con `{}` y `Origin` → `400 VALIDATION_ERROR`; verificar que falla, cambiar `scripts/smoke.mjs` y verificar que pasa
- [ ] 16.4 Actualizar la documentación del cierre: `CLAUDE.md`, `README.md`, `docs/arquitectura/ARQUITECTURA_COMPLETA.md`, `docs/despliegue/PUESTA_EN_MARCHA.md` y `docs/User_Stories_MVP.md` (US00_b y la nota de revisión legal de US01_e)
- [ ] 16.5 Abrir la PR de la apertura y, tras integrarla la persona usuaria, verificar el despliegue y el smoke test con la nueva expectativa
- [ ] 16.6 Comprobar en producción con Playwright: login con un email no registrado en `https://app.calendarschools.es/login` carga reCAPTCHA sin violaciones de CSP y recibe `401` (o `422` con reto); comprobar el dominio y el secreto v2 según `docs/despliegue/PUESTA_EN_MARCHA.md`; borrar `.playwright-mcp/` si se crea
- [ ] 16.7 Documentar el resultado en `reports/YYYY-MM-DD-step-16-production-opening.md`
