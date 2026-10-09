## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us01-c-sesion-tras-registro` desde `main` actualizado (si ya se creó al proponer el cambio, verificar que existe y parte de `main`)
- [x] 0.2 Verificar que la rama actual es `feature/us01-c-sesion-tras-registro` y que el árbol de trabajo solo contiene los artefactos de este cambio

## 1. Contrato: sesión en el registro y refresh (D8)

- [x] 1.1 Añadir `INVALID_SESSION` y `ORIGIN_NOT_ALLOWED` al enum `ErrorCode` de `docs/api-spec.yml`; verificar que `appError.test.ts` falla porque `ERROR_CODES` no los tiene
- [x] 1.2 Añadir ambos códigos a `ERROR_CODES` de `backend/src/presentation/http/appError.ts` (estado `401` y `403`); verificar que `appError.test.ts` pasa
- [x] 1.3 Documentar en la respuesta `201` de `POST /api/auth/register` las cabeceras `Set-Cookie` (`refresh_token`) y `Cache-Control: no-store`, sin cambiar su cuerpo, y añadir los esquemas `Session` (`accessToken`, `expiresIn`), `SessionUser` (`id`, `email`, `firstName`, `lastName`, `role`) y `SessionSchool` (`id`, `name`)
- [x] 1.4 Añadir `POST /api/auth/refresh` (`operationId: refreshSession`, `security: []`, cookie `refresh_token`): `200` con `session`, el usuario y su colegio, `401 INVALID_SESSION`, `403 ORIGIN_NOT_ALLOWED`, `503` y `500` comunes
- [x] 1.5 Validar el contrato con `npx @redocly/cli lint docs/api-spec.yml` (sin añadirlo como dependencia)
- [x] 1.6 Regenerar los tipos con `npm run api:types -w frontend`, ampliar `frontend/src/api/schema.test.ts` con `expectTypeOf` de la respuesta de `refresh`, de que el `201` del registro no cambia y de los nuevos códigos de error, y verificar `npm run api:types:check -w frontend` y `npm run typecheck --workspaces`

## 2. Configuración: secreto y origen (TDD)

- [x] 2.1 Ampliar `config.test.ts` con los escenarios de `JWT_SECRET` (ausente, 31 caracteres, válido) y `APP_ORIGIN` (sin esquema, con ruta, válido y normalizado); verificar que falla y que el mensaje de `ConfigError` no incluye valores
- [x] 2.2 Añadir `JWT_SECRET` y `APP_ORIGIN` al esquema Zod y a `AppConfig` (`jwtSecret`, `appOrigin`) de `config.ts`; verificar que pasa
- [x] 2.3 Añadir ambas variables, con valores de desarrollo, a `backend/.env.example` y a `backend/.env` local; comprobar con un test de `config.test.ts` que `loadConfig` acepta la plantilla
- [x] 2.4 Definir las variables en el entorno explícito del backend de `scripts/e2e.mjs` (`APP_ORIGIN` apunta al `vite preview` en `:4173`); el workflow de CI no las necesita porque solo arranca el backend a través de ese script

## 3. Modelo de datos y migración (D1)

- [x] 3.1 Escribir el test de integración `refreshTokenSchema.int.test.ts`: unicidad de `token_hash`, clave foránea a `users`, borrado en cascada al eliminar el usuario y valor por defecto de `created_at`; verificar que falla porque no existe la tabla
- [x] 3.2 Añadir el modelo `RefreshToken` a `backend/prisma/schema.prisma` (`@@map("refresh_tokens")`, `snake_case`, `tokenHash @db.Char(64)`, índices por `userId` y `expiresAt`, relación con `User` con `onDelete: Cascade`)
- [x] 3.3 Generar la migración con `prisma migrate dev --create-only` y revisar el SQL (nunca aplicar de forma implícita); regenerar el cliente Prisma
- [x] 3.4 Aplicar la migración con `npm run db:migrate` y verificar que el test de 3.1 pasa
- [x] 3.5 Comprobar que `resetDatabase()` vacía `refresh_tokens` y ampliar `resetDatabase.int.test.ts`; verificar que `scripts/e2eData.mjs` también la limpia y que ambas listas siguen coincidiendo

## 4. Backend: dominio (TDD)

- [x] 4.1 Escribir `refreshToken.test.ts` de la regla de vigencia (`refreshTokenStatus(token, now)`, que devuelve `USABLE`, `REVOKED` o `EXPIRED` para que el log distinga la causa): utilizable, revocado, caducado justo en `expiresAt`; verificar que falla
- [x] 4.2 Implementar la entidad `RefreshToken` y `refreshTokenStatus` en `domain/session`; verificar que pasa
- [x] 4.3 Definir el error de dominio `InvalidSession` (con `reason`) en `domain/session/sessionErrors.ts` y su test
- [x] 4.4 Definir el puerto `RefreshTokenRepository` (`findByHash`) con el usuario asociado (`status`, `role`, datos de perfil y colegio con `id` y `name`)
- [x] 4.5 Ampliar el puerto `RegistrationRepository.createSchoolWithAdmin` con el registro del refresh token (D4)

## 5. Backend: aplicación (TDD)

- [x] 5.1 Definir los puertos `TokenIssuer` (`issueAccessToken`, `verifyAccessToken`) y `RefreshTokenGenerator` (`generate`, `hash`) en `application/session`
- [x] 5.2 Escribir `createSession.test.ts` con dobles: genera el token y su hash, calcula `expiresAt` a 24 h con un reloj inyectado y separa el token en claro (para la cookie) del registro que se persiste, que solo lleva el hash; verificar que falla
- [x] 5.3 Implementar `CreateSession` y verificar que pasa
- [x] 5.4 Ampliar `registerSchool.test.ts`: el resultado incluye el refresh token en claro (solo para la cookie, nunca para el cuerpo) y ningún access token, el registro del token se pasa a `createSchoolWithAdmin` y los errores de validación, de duplicado y de captcha no emiten ninguna sesión; verificar que falla
- [x] 5.5 Ampliar `RegisterSchool` para crear la sesión con `CreateSession` y pasarla al repositorio; separar en su resultado los datos del alta (`registration`, lo único que envía el router) del refresh token en claro, y ajustar el doble de `registerRoute.test.ts`; verificar que pasa
- [x] 5.6 Escribir `refreshSession.test.ts`: éxito con access token, usuario y colegio (`SESSION_REFRESHED`), cookie ausente, token desconocido, revocado, caducado y usuario `SUSPENDED`/`DELETED` (`InvalidSession` con su `reason` y `SESSION_REFRESH_FAILED`, a nivel `info` si falta el token y a `warn` en el resto), sin que el log contenga el token; verificar que falla
- [x] 5.7 Implementar `RefreshSession` y verificar que pasa

## 6. Backend: infraestructura (TDD)

- [x] 6.1 Instalar `jose` y declarar `cookie` como dependencia explícita del backend (`cookie@^2`, con tipos propios y `parseCookie`/`stringifySetCookie`; Express sigue usando internamente la 0.7); aprobar scripts de instalación solo si npm lo exige, nunca con `--all`
- [x] 6.2 Escribir `joseTokenIssuer.test.ts`: contenido y TTL de 900 s, token válido, caducado (reloj inyectado), firma de otro secreto, algoritmo `none` y cuerpo modificado; verificar que falla
- [x] 6.3 Implementar `JoseTokenIssuer` y verificar que pasa
- [x] 6.4 Escribir `cryptoRefreshTokenGenerator.test.ts`: longitud y unicidad del token, hash SHA-256 de 64 caracteres hexadecimales y determinista; verificar que falla, implementarlo y verificar que pasa
- [x] 6.5 Escribir `prismaRefreshTokenRepository.int.test.ts` (Prisma real): `findByHash` devuelve el token con su usuario y su colegio, `null` si no existe y traduce los fallos de conexión a `DatabaseUnavailable`; verificar que falla, implementarlo y verificar que pasa
- [x] 6.6 Ampliar `registration.int.test.ts` y el repositorio Prisma de registro: el alta guarda colegio, usuario y refresh token en una transacción, y si falla la inserción del token no queda ninguno de los tres; verificar que falla, implementar y verificar que pasa

## 7. Backend: presentación (TDD)

- [x] 7.1 Escribir `sessionCookie.test.ts`: atributos `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth` y `Max-Age=86400`, borrado con `Max-Age=0` y lectura de la cookie entre otras; verificar que falla, implementarlo y verificar que pasa
- [x] 7.2 Escribir `requireAllowedOrigin.test.ts`: origen permitido, ajeno, ausente y que no se llame al siguiente manejador; verificar que falla, implementarlo y verificar que pasa
- [x] 7.3 Ampliar los tests de rutas con Supertest y dobles (`registerRoute.test.ts` y el nuevo `refreshRoute.test.ts`; los dobles comunes pasan a `defaultDependencies` de `test/support/appDoubles.ts`): `POST /register` fija la cookie y `Cache-Control: no-store` con el cuerpo de US01_b sin cambios ni tokens, los errores no fijan cookie, `POST /refresh` cubre `200`, `401` con borrado de cookie, `403`, `503` sin borrar la cookie, y no hay cabeceras CORS; verificar que falla
- [x] 7.4 Ampliar `authRouter` con la cookie en `/register` y `POST /refresh` protegido por `requireAllowedOrigin`; ampliar `errorHandler` con `INVALID_SESSION` (401) y `ORIGIN_NOT_ALLOWED` (403); verificar que pasa
- [x] 7.5 Montar `refreshSession` y el origen permitido en `AppDependencies` y en `createApp`, y cablear en `server.ts` los adaptadores con `jwtSecret` y `appOrigin` de la configuración (sin lógica nueva en `server.ts`)
- [x] 7.6 Escribir el test de integración de extremo a extremo de la API (`session.int.test.ts`, sobre `test/support/realApp.ts`, que comparte con `registration.int.test.ts` el cableado real de `server.ts`): registro → cookie → refresh `200`; fijación de sesión (cookie del cliente ignorada); refresh con token revocado, caducado y usuario suspendido

## 8. Frontend: sesión y servicio (TDD)

- [x] 8.1 Escribir `sessionService.test.ts` con `fetch` simulado: `refresh` correcto, `401 INVALID_SESSION`, otros errores y fallo de red, y que se envían las cookies del mismo origen; verificar que falla
- [x] 8.2 Implementar `services/sessionService.ts` y verificar que pasa
- [x] 8.3 Escribir `SessionProvider.test.tsx`: estados `loading`, `authenticated` y `anonymous`, una sola llamada en `StrictMode`, `401` sin error visible y que `localStorage` y `sessionStorage` quedan vacíos; verificar que falla
- [x] 8.4 Implementar `session/SessionProvider` y el hook `useSession` y verificar que pasa
- [x] 8.5 Montar `SessionProvider` en `main.tsx` sin lógica propia (el fichero sigue excluido de cobertura)

## 9. Frontend: registro, Onboarding y textos (TDD)

- [x] 9.1 Añadir las claves i18n (bienvenida provisional, indicador de carga, aviso de cookies deshabilitadas y de sesión no iniciada) a `es.json` y `en.json`, y retirar `registration.success.*`; verificar que `locales.test.ts` pasa
- [x] 9.2 Escribir `OnboardingPage.test.tsx`: bienvenida con nombre de usuario y colegio, indicador `role="status"` mientras carga y redirección a `/registro` si es anónima; verificar que falla
- [x] 9.3 Implementar `pages/OnboardingPage.tsx` y declarar la ruta `/onboarding` en `App.tsx`; verificar que pasa y que el test de `App` conserva `/` y `/registro`
- [x] 9.4 Ampliar `RegisterPage.test.tsx` y su test de accesibilidad (`registrationService` no cambia: el `201` conserva su cuerpo): `201` llama a `refresh` a través del contexto de sesión, que queda `authenticated`, y navega a `/onboarding`; `refresh` con `401` muestra el aviso de cookies con `role="alert"` sin redirigir; fallo de red en `refresh` muestra el mensaje genérico; el resto de respuestas (`400`, `409`, `5xx`) no cambian; verificar que falla
- [x] 9.5 Adaptar `RegisterPage` (se retira el mensaje de confirmación de US01_b); verificar que pasa, y que no queda código ni claves i18n sin uso

## 10. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 10.1 Revisar los tests de backend y frontend afectados por el nuevo resultado de `RegisterSchool`, la configuración y las rutas, y ajustar los que sigan asumiendo la respuesta de US01_b
- [x] 10.2 Confirmar que no queda ningún test que dependa de la ausencia de cookie, de `JWT_SECRET` o del mensaje de confirmación

## 11. Ejecutar tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Levantar PostgreSQL (`docker compose up -d`) y capturar la línea base de `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens` y `municipalities`)
- [x] 11.2 Ejecutar los tests de los módulos modificados (`npm exec -w backend -- vitest run <ruta>` y `npm exec -w frontend -- vitest run <ruta>`)
- [x] 11.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces` y `npm run build`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 11.4 Verificar el estado posterior de la base de datos (mismos indicadores que en 11.1) y restaurarlo si hace falta
- [x] 11.5 Crear el informe `reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md` en la carpeta del cambio, con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 12. Pruebas manuales de endpoints con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Arrancar el backend con `JWT_SECRET` y `APP_ORIGIN` de desarrollo y comprobar la conexión a la base de datos
- [x] 12.2 `POST /api/auth/register` con datos únicos (`curl -i -c cookies.txt`): `201` con el cuerpo de US01_b sin tokens y `Set-Cookie` con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth` y `Max-Age=86400`
- [x] 12.3 `POST /api/auth/refresh` con la cookie y `Origin` permitido: `200` con access token, usuario y colegio; repetirlo y comprobar que el refresh token no cambia
- [x] 12.4 Casos de error: sin cookie (`401`), cookie desconocida (`401` con borrado de cookie), `Origin` ajeno y ausente (`403`), registro con datos inválidos (`400`, sin `Set-Cookie`) y registro duplicado (`409`, sin `Set-Cookie`)
- [x] 12.5 Revocar el token en la base de datos y comprobar que `refresh` responde `401`
- [x] 12.6 Restaurar la base de datos (borrar los datos creados) y verificar que coincide con la línea base
- [x] 12.7 Documentar los comandos y respuestas en `reports/YYYY-MM-DD-step-12-curl-manual-testing.md`

## 13. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Ajustar la spec de registro y añadir `frontend/cypress/e2e/session.cy.ts`: registro con datos únicos → `/onboarding` con la bienvenida y la cookie `refresh_token` (`httpOnly`, `secure`, `sameSite=lax`, ilegible desde `document.cookie`)
- [x] 13.2 Añadir recarga en `/onboarding` (la sesión se recupera), acceso a `/onboarding` sin sesión (redirige a `/registro`) y el aviso de cookies deshabilitadas simulando `refresh` con `cy.intercept` (`401`)
- [x] 13.3 Añadir la prueba de seguridad por API: `refresh` con `Origin` ajeno responde `403` y sin cabeceras CORS
- [x] 13.4 Ejecutar con `npm run test:e2e` (headless; `scripts/e2e.mjs` pasa a Cypress los argumentos tras `--`) primero la spec dirigida con `-- --spec cypress/e2e/session.cy.ts` y después la suite completa; capturar el resumen y las capturas de los fallos
- [x] 13.5 Verificar la persistencia (colegio, usuario y `refresh_tokens` creados) y restaurar la base de datos de test
- [x] 13.6 Documentar los escenarios y resultados en `reports/YYYY-MM-DD-step-13-e2e-cypress.md`

## 14. Actualizar la documentación técnica (MANDATORY)

- [x] 14.1 Aplicar la skill `update-docs`: `docs/Modelo_de_Datos/MODELO_DATOS.md` (`refresh_tokens` pasa a «implementado», con UUID, `tokenHash`, `revokedAt` y sin `isRevoked`) y su nota de estado, y `docs/backend-standards.md` y `docs/frontend-standards.md` (`jose`, `cookie`, variables de sesión y sesión solo en memoria)
- [x] 14.2 Actualizar `README.md` (variables `JWT_SECRET` y `APP_ORIGIN`, limitación de `Secure` en Safari local) y el estado del registro y la arquitectura de la sesión en `CLAUDE.md` (US01_c hecha; quedan US01_d, e y f)
- [x] 14.3 Actualizar `docs/User_Stories_MVP.md` marcando como resueltas las dos decisiones pendientes de US01_c (persistencia de `refresh_tokens` y Onboarding provisional)
- [x] 14.4 Verificar con `openspec validate us01-c-sesion-tras-registro` que el cambio es válido antes de archivarlo
