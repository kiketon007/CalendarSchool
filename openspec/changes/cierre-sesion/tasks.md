## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/cierre-sesion` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la historia US03 enriquecida y `.claude/settings.json`

## 1. Contrato de la API (D8)

- [x] 1.1 Añadir `POST /api/auth/logout` a `docs/api-spec.yml` (sin cuerpo, cookie opcional, `204` con `Set-Cookie`, `403` y `503` con `components.responses`) y documentar `Cache-Control` como cabecera de respuesta común
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar la operación en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: `sid` en el access token (TDD, D4)

- [x] 2.1 Test que falla: el emisor de tokens firma `sid` con el `sessionId` de los claims, `verifyAccessToken` lo devuelve y rechaza un token bien firmado sin `sid`
- [x] 2.2 Añadir `sessionId` a `AccessTokenClaims` e implementarlo en `JoseTokenIssuer`
- [x] 2.3 Test que falla: `RefreshSession` emite el access token con `sessionId` igual al id del refresh token de la cookie; implementarlo y ajustar los dobles que construyen claims

## 3. Backend: revocación y errores de conexión en el repositorio (TDD, D2, D9)

- [x] 3.1 Test de integración que falla: `revoke(id, at)` informa `revokedAt` de una sesión utilizable, no cambia una ya revocada (conserva el primer instante), no toca otras sesiones del usuario y traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 3.2 Añadir `revoke` al puerto `RefreshTokenRepository` e implementarlo en `PrismaRefreshTokenRepository` con `updateMany` filtrado por `revokedAt: null`
- [x] 3.3 Tests que fallan: `translateDatabaseErrors` traduce `Connection terminated unexpectedly` y `Connection terminated due to connection timeout` (sin código) a `DatabaseUnavailable` conservando la causa, y propaga un error sin código con otro mensaje; un test de integración con un servidor TCP que cierra la conexión tras recibir el mensaje de arranque comprueba que `findByHash` y `revoke` lanzan `DatabaseUnavailable`
- [x] 3.4 Reconocer esos dos mensajes en `translateDatabaseErrors` y comprobar que `/logout` y `/refresh` responden `503` con ese servidor

## 4. Backend: caso de uso `LogOut` (TDD, D1)

- [x] 4.1 Tests que fallan: sin token, token desconocido, revocado y caducado terminan sin error, sin revocar y con `USER_LOGOUT_WITHOUT_SESSION` y su `reason`; token utilizable revoca con `now()` y registra `USER_LOGOUT` con el id del usuario, la IP y el user agent; un usuario `SUSPENDED` también puede cerrar sesión; `DatabaseUnavailable` se propaga; ningún log contiene el token ni su hash
- [x] 4.2 Implementar `LogOut` en `application/session/logOut.ts` con los puertos existentes

## 5. Backend: presentación y caché (TDD, D3, D5)

- [x] 5.1 Test que falla (`logoutRoute.test.ts`): `POST /api/auth/logout` con el `Origin` correcto responde `204` sin cuerpo y con la cookie borrada (`Max-Age=0`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`); sin `Origin` o con otro responde `403` sin `Set-Cookie`; con `DatabaseUnavailable` responde `503` sin `Set-Cookie`
- [x] 5.2 Añadir la ruta a `authRouter`, cablear `LogOut` en `composeApp`, `AppDependencies` y `defaultDependencies`
- [x] 5.3 Test que falla: `Cache-Control: no-store` en una respuesta de éxito (`/api/health`), en un `404` de `/api`, en un error del `errorHandler` y en el `403` de origen; `GET /api/municipalities` conserva `public, max-age=86400`
- [x] 5.4 Implementar el middleware de caché en el router `/api` de `createApp` y quitar los `setHeader('Cache-Control', 'no-store')` de `authRouter`, comprobando que sus tests siguen pasando
- [x] 5.5 Test de integración (`logout.int.test.ts`) con la app real: registro → logout → `refresh` con el token anterior responde `401`; con dos sesiones, cerrar una deja la otra renovando; segundo logout con el mismo token responde `204` sin cambiar `revokedAt`

## 6. Frontend: servicio y contexto de sesión (TDD, D6, D7)

- [x] 6.1 Tests que fallan: `sessionService.logout()` devuelve `loggedOut` con `204` y `unavailable` con `403`, `503`, otra respuesta o un error de red, sin lanzar nunca, y envía `POST /api/auth/logout` con las cookies del mismo origen
- [x] 6.2 Implementar `sessionService.logout()`
- [x] 6.3 Tests que fallan: `logout()` del `SessionProvider` pasa a `anonymous` con `loggedOut` y mantiene `authenticated` con `unavailable`; una renovación en curso que responde después del cierre no reabre la sesión; publica `{ type: 'logout' }` en `calendarschool:session`; un aviso recibido de otra pestaña pasa a `anonymous` sin llamar al backend; un mensaje con otra forma se ignora; sin `BroadcastChannel` funciona sin errores; el canal se cierra al desmontar
- [x] 6.4 Implementar `logout()` y el canal en `SessionProvider`

## 7. Frontend: cabecera (TDD, D6)

- [x] 7.1 Tests que fallan (`AppHeader.test.tsx`): sin sesión o cargando no se pinta; con sesión muestra el nombre de la aplicación, el usuario, el colegio y «Cerrar sesión»; al pulsar llama una sola vez a `logout()` aunque se pulse dos veces y deshabilita el botón; con `loggedOut` navega a `/login` reemplazando el historial; con `unavailable` muestra el aviso con `role="alert"`; sin violaciones de `axe`
- [x] 7.2 Implementar `components/AppHeader.tsx`, montarlo en `App.tsx` por encima de las rutas y añadir los textos a `es.json` y `en.json`
- [x] 7.3 Test de `App` que falla: tras cerrar sesión desde `/onboarding` se llega a `/login`, y volver atrás a `/onboarding` redirige de nuevo a `/login`; implementar lo que falte

## 8. Revisar y actualizar los tests unitarios (MANDATORY)

- [x] 8.1 Revisar los tests afectados por `sessionId` en los claims, por el `Cache-Control` común y por la cabecera en `App` (unitarios y E2E existentes que comprueben el contenido de las páginas), y actualizarlos
- [x] 8.2 Verificar que ningún test depende de que cada ruta de `authRouter` fije `Cache-Control` por su cuenta

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens` con y sin `revoked_at`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 9.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [x] 9.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 9.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 9.5 Crear el informe `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 En local, con el backend arrancado y el verificador falso: registrar un usuario; `logout` con su cookie → `204` con la cookie borrada y `revoked_at` informado; `refresh` con la cookie anterior → `401`; segundo `logout` → `204` sin cambios; sin cookie → `204`; sin `Origin` → `403` sin `Set-Cookie`; `Cache-Control: no-store` en `/api/health` y `public, max-age=86400` en `/api/municipalities`; el access token de un `refresh` lleva `sid` igual al id de la sesión
- [x] 10.2 Con la base de datos parada: `logout` → `503` sin `Set-Cookie`
- [x] 10.3 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.4 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Escribir `logout.cy.ts`: registro → cabecera visible → «Cerrar sesión» → `/login` sin cabecera y sin cookie `refresh_token`; recargar sigue sin sesión; volver atrás a `/onboarding` lleva a `/login`; el refresh token anterior (guardado antes del cierre) responde `401` con `cy.request`; un `503` simulado con `intercept` muestra el aviso y mantiene la sesión
- [x] 11.2 Ampliar `csp.cy.ts` para que la cabecera cargue sin violaciones de CSP
- [x] 11.3 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 11.4 Verificar y restaurar la base de datos de test
- [x] 11.5 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

## 12. Actualizar la documentación técnica (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (`no-store` por defecto en `/api`, `sid` y decisión B para el futuro middleware) y `docs/frontend-standards.md` (cabecera y cierre de sesión, `BroadcastChannel`), si añaden una regla nueva
- [x] 12.2 Actualizar `README.md`, `CLAUDE.md` (logout, `AppHeader`, `sid`, `no-store`) y `docs/arquitectura/ARQUITECTURA_COMPLETA.md` (cierre de sesión y decisión B)
- [x] 12.3 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md`: `refresh_tokens.revoked_at` lo informa el cierre de sesión
- [x] 12.4 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.5 Verificar con `openspec validate cierre-sesion --strict` que el cambio es válido

## 13. Despliegue

- [ ] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 13.2 Comprobar en producción, con un navegador real, login → «Cerrar sesión» → `/login` → recargar sin sesión, sin violaciones de CSP, y con `curl` que `/api/health` responde `Cache-Control: no-store`
- [ ] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
