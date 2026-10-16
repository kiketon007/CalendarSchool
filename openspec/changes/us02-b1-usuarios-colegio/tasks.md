## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us02-b1-usuarios-colegio` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la historia US02_b1 enriquecida en `docs/User_Stories_MVP.md`, los `CLAUDE.md` y `.claude/settings.json`

## 1. Contrato de la API (D9)

- [x] 1.1 Añadir a `docs/api-spec.yml` el esquema de seguridad `bearerAuth`, las respuestas reutilizables `Unauthorized` (con `WWW-Authenticate`) y `Forbidden`, el código `FORBIDDEN` en `ErrorCode`, los esquemas `SchoolUser`, `SchoolUserListResponse`, `UserRole` y `UserStatus`, y `GET /api/users` (`listSchoolUsers`) con `200`, `401`, `403`, `500` y `503`
- [x] 1.2 Test que falla (`appError.test.ts`): `ERROR_CODES` contiene `FORBIDDEN`; añadirlo a `appError.ts`
- [x] 1.3 Regenerar los tipos con `npm run api:types -w frontend`, fijar `SchoolUser` y la operación en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: lectura de la sesión por id (TDD, D1)

- [x] 2.1 Test de integración que falla: `PrismaRefreshTokenRepository.findById(id)` devuelve el token con su usuario y su colegio (la misma forma que `findByHash`), `null` si no existe, sin filtrar por vigencia, y traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 2.2 Añadir `findById` al puerto `RefreshTokenRepository` e implementarlo con un `findUnique` por clave primaria y `include` del usuario y su colegio, reutilizando el mapeo de `findByHash`

## 3. Backend: caso de uso `AuthenticateRequest` (TDD, D1)

- [x] 3.1 Tests que fallan: con un token válido y una sesión utilizable devuelve `userId`, `schoolId`, `role` y `sessionId` de la base de datos aunque los claims digan otro rol u otro colegio; lanza `InvalidSession` con `TOKEN_INVALID` si `verifyAccessToken` falla (sin consultar el repositorio), `SESSION_NOT_FOUND`, `SESSION_USER_MISMATCH`, `SESSION_REVOKED`, `SESSION_EXPIRED` (con `now()` inyectado) y `USER_INACTIVE` (`SUSPENDED` y `DELETED`); `DatabaseUnavailable` se propaga
- [x] 3.2 Añadir las causas nuevas a `InvalidSession` e implementar `AuthenticateRequest` y el tipo `AuthenticatedUser` en `application/authentication/`, reutilizando `refreshTokenStatus`
- [x] 3.3 Crear el error de dominio `Forbidden` en `application/authentication/forbidden.ts`

## 4. Backend: middlewares de autenticación y rol (TDD, D2, D3)

- [x] 4.1 Tests que fallan (`requireAuthentication.test.ts`, con un doble del caso de uso): sin cabecera, con `Basic …`, con `Bearer` vacío o con dos tokens responde `401 INVALID_SESSION` con `WWW-Authenticate: Bearer` sin llamar al caso de uso; con `InvalidSession` del caso de uso responde lo mismo; con éxito el handler obtiene la identidad con `getAuthenticatedUser(res)`; con `DatabaseUnavailable` responde `503`; registra `AUTHENTICATION_REJECTED` con su `reason` y el log no contiene el token ni la cabecera
- [x] 4.2 Implementar `presentation/http/requireAuthentication.ts` y `getAuthenticatedUser` (el middleware fija `WWW-Authenticate: Bearer` antes de pasar el `InvalidSession` a `errorHandler`), comprobando que `/api/auth/refresh` sigue respondiendo como antes
- [x] 4.3 Tests que fallan (`requireRole.test.ts`): con el rol exigido continúa; con otro rol responde `403 FORBIDDEN` y registra `AUTHORIZATION_DENIED` con `userId`, `schoolId`, rol actual y exigido; `getAuthenticatedUser` sin el middleware de autenticación lanza un error de programación (`500`)
- [x] 4.4 Implementar `presentation/http/requireRole.ts` y la traducción de `Forbidden` a `403 FORBIDDEN` en `errorHandler.ts`

## 5. Backend: listado de usuarios (TDD, D4, D5)

- [x] 5.1 Tests que fallan: `ListSchoolUsers.execute({ schoolId })` devuelve lo que da `SchoolUserRepository.listBySchool(schoolId)` y propaga `DatabaseUnavailable`
- [x] 5.2 Definir el puerto `SchoolUserRepository` y el tipo `SchoolUser` en `domain/user/` e implementar `ListSchoolUsers` en `application/users/`
- [x] 5.3 Tests de integración que fallan: `PrismaSchoolUserRepository.listBySchool` devuelve solo los usuarios `ACTIVE` y `SUSPENDED` del colegio indicado (con dos colegios), excluye `DELETED`, ordena por apellidos, nombre y email con la intercalación del castellano (incluidos los apellidos que empiezan por vocal con tilde), devuelve exactamente los siete campos y traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 5.4 Implementar `PrismaSchoolUserRepository` con `findMany`, `select` explícito y orden en la aplicación con `localeCompare(…, 'es')`
- [x] 5.5 Tests que fallan (`usersRoute.test.ts`, con dobles): `GET /api/users` con un `ADMIN` responde `200` con `createdAt` en ISO 8601 y `Cache-Control: no-store`; con un `MEMBER`, `403`; sin token, `401` y no `403`; sin `Origin`, `200`; `?schoolId=` se ignora; el caso de uso recibe el `schoolId` de la identidad
- [x] 5.6 Implementar `presentation/users/usersRouter.ts`, montarlo en `app.ts` antes de `notFoundHandler` y cablear `AuthenticateRequest` y `ListSchoolUsers` en `composeApp`, `AppDependencies` y `defaultDependencies`
- [x] 5.7 Test de integración (`users.int.test.ts`) con la app real: registro y refresh → `GET /api/users` con el token → `200` con el administrador; tras `logout`, el mismo token → `401`; con el usuario pasado a `SUSPENDED`, `401`; con el rol cambiado a `MEMBER` en la base de datos y el token antiguo, `403`, y al revés, `200`; dos colegios aislados; con la base de datos caída (servidor TCP que cierra la conexión), `503`

## 6. Frontend: cliente autenticado (TDD, D6)

- [x] 6.1 Tests que fallan (`authorizedFetch.test.ts`): añade `Authorization: Bearer <token>`; ante `401 INVALID_SESSION` renueva una vez y repite con el token nuevo; si la renovación no da sesión, no repite y devuelve la respuesta `401`; un segundo `401` tras repetir no vuelve a renovar; dos `401` simultáneos comparten una única renovación; `403` y `503` se devuelven sin renovar; un `401` con otro código no renueva
- [x] 6.2 Implementar `session/authorizedFetch.ts` (`createAuthorizedFetch`)
- [x] 6.3 Tests que fallan (`SessionProvider.test.tsx`): el contexto expone `authorizedFetch`, que usa el token de la sesión en memoria y renueva a través del mismo `refresh()` (una renovación en curso se comparte y un `logout()` posterior la sigue invalidando)
- [x] 6.4 Exponer `authorizedFetch` en `SessionProvider` con la renovación compartida

## 7. Frontend: layout y guarda de rol (TDD, D7)

- [x] 7.1 Tests que fallan (`AuthenticatedLayout.test.tsx`): cargando muestra `role="status"` y no el contenido; sin sesión navega a `/login` reemplazando el historial; con sesión muestra la cabecera, la navegación y el contenido hijo; al pasar la sesión a `anonymous` navega a `/login`; sin violaciones de `axe`
- [x] 7.2 Implementar `routes/AuthenticatedLayout.tsx` y montar en él `AppHeader` (que conserva su estrechamiento de tipos sin sesión, pero deja de ser quien decide si se pinta: ya no se monta en `App.tsx`)
- [x] 7.3 Tests que fallan (`RequireRole.test.tsx`): con el rol exigido muestra el contenido hijo; con otro rol navega a `/onboarding` reemplazando el historial, sin mensaje
- [x] 7.4 Implementar `routes/RequireRole.tsx`
- [x] 7.5 Tests que fallan (`AppHeader.test.tsx`): el enlace «Usuarios» a `/usuarios` aparece solo con rol `ADMIN`; añadir la navegación a `AppHeader` y sus textos a `es.json` y `en.json`
- [x] 7.6 Tests que fallan (`App.test.tsx` y `OnboardingPage.test.tsx`): las rutas públicas no muestran la cabecera aunque haya sesión; `/onboarding` sigue mostrando la bienvenida con sesión y llevando a `/login` sin ella; `/usuarios` con un `MEMBER` lleva a `/onboarding`
- [x] 7.7 Reorganizar `App.tsx` con las rutas anidadas y quitar la guarda propia de `OnboardingPage`

## 8. Frontend: página de usuarios (TDD, D8)

- [x] 8.1 Tests que fallan (`usersService.test.ts`): `list(authorizedFetch)` devuelve `loaded` con los usuarios con `200`, `forbidden` con `403 FORBIDDEN`, `unauthenticated` con `401` y `unavailable` con `503`, otra respuesta, un cuerpo inesperado o un error de red, sin lanzar nunca
- [x] 8.2 Implementar `services/usersService.ts`
- [x] 8.3 Tests que fallan (`UsersPage.test.tsx`): carga con `role="status"`; tabla con nombre, apellidos, email, rol y estado traducidos y fecha formateada con el idioma activo; `unavailable` muestra el aviso `role="alert"` y «Reintentar» repite la petición; `forbidden` llama a `refresh()` y navega a `/onboarding`; sin violaciones de `axe`
- [x] 8.4 Implementar `pages/UsersPage.tsx`, declararla en `/usuarios` bajo `RequireRole` y añadir sus textos a `es.json` y `en.json`

## 9. Revisar y actualizar los tests unitarios (MANDATORY)

- [x] 9.1 Revisar los tests afectados por el movimiento de la guarda de `OnboardingPage` al layout, por `AppHeader` sin guarda propia y con navegación, por `findById` en los dobles de `RefreshTokenRepository` y por las causas nuevas de `InvalidSession`, y actualizarlos
- [x] 9.2 Revisar los E2E existentes que comprueben la cabecera en páginas públicas o el contenido de `/onboarding`

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users` por estado y rol, `schools`, `refresh_tokens` con y sin `revoked_at`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 10.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [x] 10.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 10.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 10.5 Crear el informe `reports/2026-10-16-step-10-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 En local, con el backend arrancado y el verificador falso: registrar un administrador y obtener un access token con `refresh`; `GET /api/users` con el token → `200` con el administrador y `Cache-Control: no-store`; sin `Authorization`, con `Basic` y con un token alterado → `401 INVALID_SESSION` con `WWW-Authenticate: Bearer`; sin `Origin` → `200`
- [x] 11.2 Con SQL directo sobre la base de desarrollo: rol cambiado a `MEMBER` → `403 FORBIDDEN` con el mismo token; usuario `SUSPENDED` → `401`; tras `logout`, el token anterior → `401`; restaurar cada cambio después de comprobarlo
- [x] 11.3 Con la base de datos parada: `GET /api/users` con un token válido → `503 DATABASE_UNAVAILABLE`
- [x] 11.4 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.5 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/2026-10-16-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Añadir la tarea `createUser` a `scripts/e2eData.mjs` (solo sobre bases `*_test`, hash con el `BCRYPT_COST` de test) y su registro en `cypress.config.ts`
- [x] 12.2 Escribir `users.cy.ts`: un administrador registrado pulsa «Usuarios» y ve su fila con el rol de administrador; un `MEMBER` creado con `createUser` inicia sesión, no ve el enlace y `/usuarios` lo lleva a `/onboarding`; tras cerrar la sesión, `/usuarios` lleva a `/login`; un `503` simulado con `intercept` muestra el aviso y «Reintentar» carga la lista
- [x] 12.3 Ampliar `csp.cy.ts` para que `/usuarios` cargue sin violaciones de CSP
- [x] 12.4 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 12.5 Verificar y restaurar la base de datos de test
- [x] 12.6 Documentar el resultado en `reports/2026-10-16-step-12-e2e-cypress.md`

## 13. Actualizar la documentación técnica (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (endpoints protegidos con `requireAuthentication` y `requireRole`, `schoolId` obligatorio en los puertos de datos del colegio, identidad desde la base de datos) y `docs/frontend-standards.md` (rutas protegidas bajo `AuthenticatedLayout`, `RequireRole` y servicios con `authorizedFetch`), si añaden una regla nueva
- [x] 13.2 Actualizar `backend/CLAUDE.md` (la viñeta de cierre de sesión deja de decir que el middleware no existe; viñetas de autenticación y autorización), `frontend/CLAUDE.md` (layout, guardas, cliente autenticado y página de usuarios; `OnboardingPage` y `AppHeader` sin guarda propia), `CLAUDE.md` (estado del repositorio) y `docs/arquitectura/ARQUITECTURA_COMPLETA.md` (autenticación de las peticiones)
- [x] 13.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 13.4 Verificar con `openspec validate us02-b1-usuarios-colegio --strict` que el cambio es válido

## 14. Despliegue

- [ ] 14.1 Abrir la PR con los grupos 0–13 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 14.2 Comprobar en producción, con un navegador real, login → «Usuarios» → lista, sin violaciones de CSP, y con `curl` que `GET /api/users` sin token responde `401` con `WWW-Authenticate: Bearer`
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
