## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us02-c-restablecer-contrasena` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US02_c en `docs/User_Stories_MVP.md` y `.claude/settings.json` (que vuelve a Sonnet con esfuerzo medio para implementar)

## 1. Contrato de la API

- [x] 1.1 Añadir a `docs/api-spec.yml` los esquemas `PasswordReset` (`userId`, `createdAt`, `expiresAt`), `PasswordResetCreatedResponse` (`passwordReset` y `url`), `PasswordResetLookupRequest` (`token`), `PasswordResetLookupResponse` (`school.name` y `email` enmascarado) y `ConfirmPasswordResetRequest` (`token` y `password`); `passwordResetPending` obligatorio en `SchoolUser`; las rutas protegidas `POST /api/users/{id}/password-reset` (`createPasswordReset`: `201`, `401`, `403`, `404`, `409`, `500`, `503`) y `POST /api/users/{id}/password-reset/revoke` (`revokePasswordReset`: `204`, `401`, `403`, `404`, `500`, `503`), y las públicas sin `security` `POST /api/password-resets/lookup` (`lookupPasswordReset`: `200`, `410`, `429`, `500`, `503`) y `POST /api/password-resets/confirm` (`confirmPasswordReset`: `204`, `400`, `410`, `429`, `500`, `503`), con la nota de que el `201` es la única respuesta con el enlace y de que confirmar no crea sesión
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las cuatro operaciones, los esquemas y el campo nuevo de `SchoolUser` en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: dominio

- [x] 2.1 Añadir al puerto `AccessLinkRepository` (`domain/accessLink/`) `createPasswordReset`, `revokePasswordReset`, `findPendingPasswordReset` y `resetPassword` con sus tipos de entrada y de resultado (`created` con los anteriores revocados, `notFound`, `notActive`; `revoked`, `none`, `notFound`; `{ schoolName, email }` o `null`; `{ userId, schoolId, revokedSessions }` o `null`), y `passwordResetPending` al tipo `SchoolUser`

## 3. Backend: repositorios

- [x] 3.1 Tests de integración que fallan (`prismaAccessLinkRepository.int.test.ts`): `createPasswordReset` crea el enlace con `user_id` y `created_by_id`; devuelve `notFound` para otro colegio, inexistente o `DELETED` y `notActive` para un `SUSPENDED`, sin crear nada; revoca el pendiente anterior **y también uno caducado sin revocar** antes de insertar (sin violar el índice); dos llamadas simultáneas chocan con `access_links_pending_reset_user_key` en una de ellas. `revokePasswordReset` revoca el pendiente, devuelve `none` sin pendiente y `notFound` fuera del colegio. `findPendingPasswordReset` devuelve el colegio y el email solo de un `PASSWORD_RESET` pendiente de un usuario `ACTIVE` (no de una invitación, caducado en el instante exacto, usado, revocado ni de un `SUSPENDED`). `resetPassword` marca `used_at`, cambia `password_hash` y revoca todas las sesiones abiertas del usuario en una transacción; devuelve `null` sin cambiar nada con un enlace que ya no está pendiente o un usuario que ya no está `ACTIVE`; dos llamadas simultáneas: una gana. Cada método traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 3.2 Implementar los cuatro métodos en `PrismaAccessLinkRepository` (`$transaction`, `updateMany` condicionados, `select` explícito, nunca el hash)
- [x] 3.3 Tests de integración que fallan (`prismaSchoolUserRepository.int.test.ts`): `listBySchool(schoolId, now)` y la respuesta de `applyChange` incluyen `passwordResetPending`, `true` solo con un restablecimiento pendiente en `now` (no caducado, usado, revocado ni una invitación)
- [x] 3.4 Implementar `passwordResetPending` en `PrismaSchoolUserRepository` (lista y `applyChange`) y pasar el reloj a `ListSchoolUsers` y a `ManageSchoolUser`

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan (`createPasswordReset.test.ts` y `revokePasswordReset.test.ts`, con dobles): guarda el hash y no el token; `expires_at` = `now` + 72 h; `url` = `appOrigin` + `/restablecer#` + token; reintenta una vez ante la violación del índice y propaga un segundo fallo; traduce `notFound` a `UserNotFound` y `notActive` a `UserNotActive`; eventos `PASSWORD_RESET_LINK_CREATED` (con `replaced`) y `PASSWORD_RESET_LINK_REVOKED` solo si revoca; ningún log contiene el token, el hash ni el `url`
- [x] 4.2 Tests que fallan (`lookupPasswordReset.test.ts` y `confirmPasswordReset.test.ts`, con dobles): la clave `password-reset:<ip>`; el orden límite → enlace → contraseña → hash → cambio; el hash no se calcula con un enlace no válido; la contraseña se valida con las reglas del registro (`ValidationError` con el campo `password`) y se libera el intento; el email se enmascara; `null` del cambio lanza `AccessLinkInvalid`; eventos `PASSWORD_RESET_COMPLETED` (con las sesiones revocadas) y `PASSWORD_RESET_REJECTED`; ningún log contiene el token, el hash ni la contraseña
- [x] 4.3 Implementar `application/passwordResets/` (los cuatro casos de uso) y el límite de intentos, generalizando `invitationAttempts.ts` si encaja sin forzarlo, con el reloj y `appOrigin` inyectados

## 5. Backend: configuración

- [x] 5.1 Tests que fallan (`config.test.ts`): `PASSWORD_RESET_ATTEMPTS_MAX` opcional, por defecto 10, que rechaza `0` y `2.5` nombrando la variable; `backend/.env.example` la documenta comentada y sigue siendo aceptada
- [x] 5.2 Implementar `passwordResetAttemptsMax` en `loadConfig`, documentarlo en `backend/.env.example` y añadirlo a `test/support/realApp.ts` (1000 por defecto)

## 6. Backend: presentación

- [x] 6.1 Tests que fallan (`passwordResetRoute.test.ts` y `publicPasswordResetsRoute.test.ts`, con dobles): las rutas de administrador responden `201` con `no-store` y el `url`, `204`, `404` con un id que no es un UUID sin llamar al caso de uso, `409 USER_NOT_ACTIVE`, `401` antes de `403` y `503`; las públicas responden sin sesión `200` con el colegio y el email enmascarado, `204` sin `Set-Cookie`, `400`, `410`, `429` con `Retry-After` y `503`, y pasan el cuerpo y el contexto de la petición; `GET /api/users` lleva `passwordResetPending`
- [x] 6.2 Implementar las dos rutas en `usersRouter`, `presentation/passwordResets/publicPasswordResetsRouter.ts` montado en `/api/password-resets`, y el cableado en `composeApp` (con su propio `AttemptLimiter`), `AppDependencies`, `defaultDependencies` y `test/support/appDoubles.ts`
- [x] 6.3 Test de integración (`passwordReset.int.test.ts`) con la app real: generar, consultar sin consumir, confirmar, entrar con la nueva y no con la anterior; las sesiones anteriores reciben `401`; generar otra vez (también tras una caducidad forzada con SQL) invalida el anterior; dos generaciones simultáneas dejan un solo pendiente; revocar; `409` con un `SUSPENDED`; un usuario dado de baja tras generar da `410`; dos confirmaciones simultáneas: una gana; aislamiento entre colegios; `403` para un `MEMBER` y `401` sin token; el límite con un máximo bajo e independiente del de las invitaciones; ningún log contiene secretos; `503` con la base de datos caída

## 7. Frontend: servicios

- [x] 7.1 Tests que fallan (`usersService.passwordReset.test.ts` y `passwordResetService.test.ts`): `generatePasswordReset` y `revokePasswordReset` envían la ruta correcta con `authorizedFetch` y devuelven `created` (con el `url`), `revoked`, `notFound`, `userNotActive`, `forbidden`, `unauthenticated` y `unavailable`; `lookup` y `confirm` envían el token en el cuerpo sin `Authorization` y devuelven `found` (colegio y email), `confirmed`, `invalid`, `validationError`, `tooManyAttempts` con minutos y `unavailable`, sin lanzar nunca; `usersService.list` acepta `passwordResetPending`
- [x] 7.2 Implementar las dos acciones y el campo nuevo en `services/usersService.ts`, y `services/passwordResetService.ts`

## 8. Frontend: panel, página de usuarios, página pública y aviso en el login

- [x] 8.1 Generalizar `GeneratedInvitationPanel` en `components/GeneratedLinkPanel.tsx` (título, etiqueta y aviso por parámetro) y comprobar que los tests de `InvitationsSection` siguen pasando sin cambiar su comportamiento
- [x] 8.2 Tests que fallan (`UsersPage.passwordReset.test.tsx`): «Restablecer contraseña» solo en las filas `ACTIVE`, también la propia; tras `created`, el panel con el aviso y la fila marcada «Restablecimiento pendiente» sin volver a pedir la lista; «Revocar restablecimiento» desmarca la fila; los avisos de `409`, `404` (con recarga), `403` (salida a `/onboarding`) y fallos; guarda por fila; sin violaciones de `axe`
- [x] 8.3 Implementar las acciones y la marca en `pages/UsersPage.tsx` y las claves `users.passwordReset.*` en `es.json` y `en.json`
- [x] 8.4 Tests que fallan (`PasswordResetPage.test.tsx`): lee el token del fragmento, lo quita de la URL y no lo guarda en almacenamiento; sin fragmento, la vista no válida sin llamar al servicio; consulta una vez aunque `StrictMode` ejecute el efecto dos veces; el email enmascarado y el colegio; las vistas `invalid`, `tooManyAttempts` y `unavailable` con «Reintentar»; la validación de la contraseña y «Las contraseñas no coinciden» sin enviar; el doble envío manda una sola petición; `confirmed` navega a `/login` con `replace` y el estado de contraseña cambiada; `400` y `410` al enviar; sin violaciones de `axe`
- [x] 8.5 Implementar `pages/PasswordResetPage.tsx`, la ruta pública `/restablecer` en `App.tsx` y las claves `passwordReset.*` en `es.json` y `en.json`
- [x] 8.6 Tests que fallan (`LoginPage.passwordChanged.test.tsx`): con el estado de contraseña cambiada muestra «Tu contraseña se ha cambiado. Inicia sesión con la nueva.» en un `role="status"`; sin él, o con otra forma, no; el aviso de cuenta creada sigue igual
- [x] 8.7 Generalizar la lectura de `location.state` en `pages/LoginPage.tsx` a los dos avisos y añadir la clave `login.passwordChanged` en `es.json` y `en.json`

## 9. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 9.1 Revisar los tests afectados por el campo nuevo de `SchoolUser` (lista y acciones de US02_b1 y US02_b2, en backend y frontend), por las dependencias nuevas de `createApp`, `composeApp`, `loadConfig`, `ListSchoolUsers` y `ManageSchoolUser`, por el renombrado del panel y por la ruta nueva de `App.tsx`, y actualizarlos
- [x] 9.2 Revisar los E2E existentes de `users.cy.ts`, `users-management.cy.ts`, `invitations.cy.ts`, `login.cy.ts` y `csp.cy.ts` que puedan verse afectados por las filas nuevas de `/usuarios`, el panel y `LoginPage`

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users` por estado y rol, `schools`, `refresh_tokens` con y sin `revoked_at`, `rate_limit_attempts`, `access_links` por propósito y con y sin `used_at`, y `municipalities` por esquema)
- [x] 10.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [x] 10.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 10.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 10.5 Crear el informe `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 En local, con el backend arrancado y el verificador falso: registrar un administrador, obtener su access token, crear con SQL un `MEMBER` (con contraseña conocida) y un `SUSPENDED` en su colegio, y abrir dos sesiones del `MEMBER` con `POST /api/auth/login`
- [x] 11.2 `POST /api/users/{id del MEMBER}/password-reset` → `201` con el `url` y `no-store`, y en la base de datos el `token_hash` es el SHA-256 del fragmento; `GET /api/users` lo marca con `passwordResetPending`; para el `SUSPENDED` → `409`; con un id que no es un UUID → `404`; generar otra vez revoca el anterior (también tras forzar con SQL su caducidad) y revocar responde `204` dos veces
- [x] 11.3 `POST /api/password-resets/lookup` sin `Authorization` → `200` con el colegio y el email enmascarado, tres veces, sin `used_at`; sin token, inexistente y revocado → `410`; `POST /api/password-resets/confirm` con una contraseña no válida → `400` y el enlace sigue pendiente; con una válida → `204` sin `Set-Cookie`, en la base de datos el hash cambia, el enlace tiene `used_at` y las dos sesiones quedan revocadas (sus access tokens → `401`); login con la anterior → `401` y con la nueva → `204`; confirmar otra vez → `410`
- [x] 11.4 Dos confirmaciones simultáneas de otro enlace → un `204` y un `410`; un enlace de un usuario dado de baja después de generarlo → `410`; con `PASSWORD_RESET_ATTEMPTS_MAX` bajo, el `429` con `Retry-After` tras agotarlo con tokens inexistentes; el log no contiene ningún token, hash, enlace ni contraseña; con la base de datos parada → `503`, y recuperación al volver
- [x] 11.5 Borrar los datos creados (enlaces de acceso antes que usuarios y colegios), comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.6 Documentar los comandos y respuestas (sin contraseñas, tokens ni enlaces) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Añadir `PASSWORD_RESET_ATTEMPTS_MAX=1000` al backend de E2E en `scripts/e2e.mjs`
- [x] 12.2 Escribir `password-reset.cy.ts`: un administrador registrado (con un miembro creado con `createUser`) genera un restablecimiento para el miembro en `/usuarios` con el portapapeles simulado y ve la fila marcada; se abre el enlace sin sesión, la URL pierde el fragmento, se ve el email enmascarado y el colegio, se define la contraseña nueva, se llega a `/login` con el aviso y se entra con la nueva (y no con la anterior); un enlace sustituido por otro y uno revocado muestran la vista no válida
- [x] 12.3 Ampliar `csp.cy.ts` para que `/restablecer` (con el formulario y con la vista no válida) no viole la CSP ni cargue recursos de terceros
- [x] 12.4 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 12.5 Verificar y restaurar la base de datos de test
- [x] 12.6 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (un índice único parcial que no mira la caducidad obliga a revocar lo abierto antes de insertar; reintentar una vez ante la violación de unicidad en una carrera rara; cambiar un secreto y revocar las sesiones en la misma transacción) y `docs/frontend-standards.md` (un panel de secreto mostrado una vez, compartido por parámetros; la confirmación de la contraseña solo en el cliente), si añaden una regla nueva
- [x] 13.2 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (los restablecimientos en uso, la revocación de los abiertos y la transacción del cambio), `backend/CLAUDE.md` (generar, revocar, consultar y confirmar, y `passwordResetPending`), `frontend/CLAUDE.md` (`PasswordResetPage`, las acciones de `/usuarios`, `GeneratedLinkPanel` y el aviso de `LoginPage`), `CLAUDE.md` (estado del repositorio y endpoints) y `README.md`
- [x] 13.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 13.4 Verificar con `openspec validate us02-c-restablecer-contrasena --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [x] 14.1 Abrir la PR con los grupos 0–13 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [x] 14.2 Comprobar en producción con `curl` que `POST /api/password-resets/lookup` y `/confirm` con un token inexistente responden `410 ACCESS_LINK_INVALID` y que `POST /api/users/{id}/password-reset` sin token responde `401`, sin crear datos; y que la persona usuaria, con un navegador real y una cuenta de prueba, genera un restablecimiento para un usuario, lo abre en otra ventana privada, cambia la contraseña y entra con la nueva sin violaciones de CSP
- [x] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`, con el orden de borrado de los datos de prueba
