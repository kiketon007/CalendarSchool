## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us02-b4-aceptar-invitacion` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US02_b4 en `docs/User_Stories_MVP.md` y `.claude/settings.json` (que vuelve a Sonnet con esfuerzo medio para implementar)

## 1. Contrato de la API

- [x] 1.1 Añadir a `docs/api-spec.yml` el código `ACCESS_LINK_INVALID` en el enum `ErrorCode`, la respuesta reutilizable `AccessLinkInvalid` (`410`), los esquemas `InvitationLookupRequest` (`token`), `InvitationLookupResponse` (`school.name` y `role`), `AcceptInvitationRequest` (`token`, `firstName`, `lastName`, `email`, `password`, `privacyPolicyAccepted`) e `InvitationAcceptedResponse` (`user` con `id`, `firstName`, `lastName`, `email` y `role`, y `school` con `id` y `name`), y las rutas públicas sin `security` `POST /api/invitations/lookup` (`lookupInvitation`: `200`, `410`, `429`, `500`, `503`) y `POST /api/invitations/accept` (`acceptInvitation`: `201`, `400`, `409`, `410`, `429`, `500`, `503`), con la nota de que la aceptación no crea sesión
- [x] 1.2 Test que falla (`appError.test.ts`): `ERROR_CODES` contiene `ACCESS_LINK_INVALID`, alineado con el contrato; añadirlo a `ERROR_CODES`
- [x] 1.3 Regenerar los tipos con `npm run api:types -w frontend`, fijar las dos operaciones y los esquemas en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: reglas de campo compartidas (refactor)

- [x] 2.1 Extraer de `registerSchoolRequest.ts` los esquemas de `firstName`, `lastName`, `email`, `password` y `privacyPolicyAccepted` y el recorrido de campos a `application/registration/userFields.ts` (`USER_FIELD_SCHEMAS` y `parseFields`), sin cambiar el comportamiento de `parseRegisterSchoolRequest`
- [x] 2.2 Ejecutar la suite del backend (unitarios e integración, incluida la tabla `registration-fields.json`) y comprobar que el refactor no cambia nada antes de seguir

## 3. Backend: dominio

- [x] 3.1 Añadir el error `AccessLinkInvalid` (con `reason` solo para el log) a `domain/accessLink/accessLinkErrors.ts` y al puerto `AccessLinkRepository` los métodos `findPendingInvitation(tokenHash, now)` (`{ schoolName, role }` o `null`) y `acceptInvitation({ tokenHash, now, newUser })` (el usuario y el colegio creados, o `null` si el enlace ya no está pendiente; lanza `EmailAlreadyRegistered`), con el tipo `NewInvitedUser`

## 4. Backend: repositorio

- [x] 4.1 Tests de integración que fallan (`prismaAccessLinkRepository.int.test.ts`): `findPendingInvitation` devuelve el nombre del colegio y el rol de una invitación pendiente y `null` para una caducada en el instante exacto, usada, revocada, inexistente o un restablecimiento, sin escribir nada; `acceptInvitation` marca `used_at` y crea el usuario `ACTIVE` con el colegio y el rol de la invitación y el consentimiento; devuelve `null` con un enlace que ya no está pendiente sin crear nada; con un email ya registrado lanza `EmailAlreadyRegistered` y deja la invitación pendiente (rollback); dos `acceptInvitation` simultáneos con `Promise.allSettled` crean un único usuario y el otro devuelve `null`; cada método traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 4.2 Implementar los dos métodos en `PrismaAccessLinkRepository`: `findFirst` con la regla de pendiente y `select` explícito; `$transaction` con `updateMany` condicionado, la lectura del colegio y el rol, y `user.create`, distinguiendo `users_email_key` por el nombre del índice como en el registro

## 5. Backend: aplicación

- [x] 5.1 Tests que fallan (`acceptInvitationRequest.test.ts`): el parser recorre las filas de los campos de usuario de `registration-fields.json` con los mismos códigos que el registro, exige `privacyPolicyAccepted: true` e ignora `role`, `schoolId` y cualquier otra propiedad
- [x] 5.2 Tests que fallan (`lookupInvitation.test.ts`, con dobles): consume un intento con la clave `invitation:<ip>`, hashea el token con el generador y pasa `now`; con una invitación devuelve el colegio y el rol y libera el intento; con `null`, un token ausente o que no es una cadena no vacía lanza `AccessLinkInvalid` sin liberar; `TooManyAttempts` se propaga sin buscar el enlace
- [x] 5.3 Tests que fallan (`acceptInvitation.test.ts`, con dobles): el orden límite → enlace → campos → hash → alta; con un enlace no válido lanza `AccessLinkInvalid` sin validar ni calcular el hash; con campos no válidos lanza `ValidationError` y libera el intento; con `EmailAlreadyRegistered` libera el intento y lo propaga; con `null` del alta lanza `AccessLinkInvalid`; con éxito pasa al repositorio la contraseña hasheada, los campos normalizados, `privacyPolicyAcceptedAt = now` y `PRIVACY_POLICY_VERSION`, libera el intento y registra `INVITATION_ACCEPTED`; registra `INVITATION_ACCEPT_REJECTED` con `reason`; ningún log contiene el token, su hash ni la contraseña
- [x] 5.4 Implementar `application/invitations/acceptInvitationRequest.ts`, `lookupInvitation.ts` y `acceptInvitation.ts`, y el límite de intentos de las invitaciones sobre `AttemptLimiter`, con el reloj inyectado

## 6. Backend: configuración

- [x] 6.1 Tests que fallan (`config.test.ts`): `INVITATION_ATTEMPTS_MAX` opcional, por defecto 10, que rechaza `0` y `2.5` nombrando la variable; y `backend/.env.example` la documenta comentada y sigue siendo aceptada
- [x] 6.2 Implementar `invitationAttemptsMax` en `loadConfig` y documentarlo en `backend/.env.example`

## 7. Backend: presentación

- [x] 7.1 Test que falla (`errorHandler.test.ts`): `AccessLinkInvalid` → `410 ACCESS_LINK_INVALID` sin registrarlo como error del servidor; implementarlo en `domainError`
- [x] 7.2 Tests que fallan (`publicInvitationsRoute.test.ts`, con dobles): `POST /api/invitations/lookup` responde `200` con el colegio y el rol sin `Authorization` y `410` con `AccessLinkInvalid`; `POST /api/invitations/accept` responde `201` con el usuario y el colegio, con `Cache-Control: no-store` y sin `Set-Cookie`, `400`, `409`, `410` y `429` con `Retry-After`; los dos pasan el contexto de la petición (IP); `503` con `DatabaseUnavailable`; `GET /api/invitations` sigue respondiendo `401` sin token
- [x] 7.3 Implementar `presentation/invitations/publicInvitationsRouter.ts`, montarlo en `app.ts` en `/api/invitations` antes del router protegido, y cablear los casos de uso, el limitador y `invitationAttemptsMax` en `composeApp`, `AppDependencies`, `defaultDependencies`, `test/support/appDoubles.ts` y `test/support/realApp.ts` (máximo 1000 por defecto)
- [x] 7.4 Test de integración (`invitationAcceptance.int.test.ts`) con la app real: un administrador genera una invitación por la API y se consulta (tres veces, sin consumirla) y se acepta con su token; el usuario inicia sesión con su contraseña; el rol y el colegio salen de la invitación aunque el cuerpo traiga otros; email ya registrado `409` con la invitación pendiente; enlace caducado, usado, revocado, inexistente y un restablecimiento `410`; el enlace va antes que los campos (`410` con campos no válidos); dos aceptaciones simultáneas crean un solo usuario; el límite con un máximo de 3 se agota con enlaces no válidos y no con `400`; la invitación de un administrador dado de baja se acepta; ningún log contiene el token; `503` con la base de datos caída

## 8. Frontend: servicio

- [x] 8.1 Tests que fallan (`invitationAcceptanceService.test.ts`): `lookup` y `accept` envían `POST` a su ruta con el cuerpo JSON y sin `Authorization`; devuelven `found` (colegio y rol), `accepted`, `invalid` con `410 ACCESS_LINK_INVALID`, `emailAlreadyRegistered` con `409`, `validationError` con los `details` del `400`, `tooManyAttempts` con los minutos de `Retry-After` redondeados hacia arriba, y `unavailable` con `503`, otro código, un cuerpo inesperado o un error de red, sin lanzar nunca
- [x] 8.2 Implementar `services/invitationAcceptanceService.ts`

## 9. Frontend: página de aceptación y aviso en el login

- [x] 9.1 Tests que fallan (`AcceptInvitationPage.test.tsx`): lee el token del fragmento, lo quita de la URL con `history.replaceState` y no lo guarda en `localStorage` ni `sessionStorage`; sin fragmento muestra la vista de enlace no válido sin llamar al servicio; consulta una vez aunque `StrictMode` ejecute el efecto dos veces, con un indicador mientras carga; muestra «Te han invitado a {colegio} como {rol}» y el formulario; `invalid`, `tooManyAttempts` y `unavailable` (con «Reintentar») de la consulta; la validación en línea del registro y la casilla de privacidad con enlace a `/privacidad`; el doble envío manda una sola petición; `409` en el campo email conservando el resto; `400` en sus campos; `410` al enviar muestra la vista no válida; `201` navega a `/login` con `replace` y el email; sin violaciones de `axe`
- [x] 9.2 Implementar `pages/AcceptInvitationPage.tsx`, la ruta pública `/invitacion` en `App.tsx`, la validación por campo reutilizada de `validation/registrationValidation.ts` y las claves `acceptInvitation.*` en `es.json` y `en.json`
- [x] 9.3 Tests que fallan (`LoginPage.test.tsx` o un fichero propio): con el estado de navegación de cuenta creada muestra «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y el email escrito; sin ese estado no muestra el aviso y el email está vacío
- [x] 9.4 Implementar la lectura de `location.state` en `pages/LoginPage.tsx` y la clave `login.accountCreated` en `es.json` y `en.json`

## 10. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 10.1 Revisar los tests afectados por el refactor de las reglas de campo, por las dependencias nuevas de `createApp`, `composeApp` y `loadConfig`, por la ruta nueva de `App.tsx` y por el estado de navegación de `LoginPage`, y actualizarlos
- [x] 10.2 Revisar los E2E existentes de `login.cy.ts`, `registration.cy.ts` y `csp.cy.ts` que puedan verse afectados por los cambios de `LoginPage` y de las rutas

## 11. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 11.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users` por estado y rol, `schools`, `refresh_tokens` con y sin `revoked_at`, `rate_limit_attempts`, `access_links` con y sin `used_at` y `municipalities` por esquema)
- [x] 11.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [x] 11.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 11.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 11.5 Crear el informe `reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 12. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 En local, con el backend arrancado y el verificador falso: registrar un administrador, obtener su access token, generar una invitación de miembro y otra de administrador y guardar sus tokens sin mostrarlos
- [x] 12.2 `POST /api/invitations/lookup` sin `Authorization` → `200` con el colegio y el rol, tres veces, y en la base de datos la invitación sigue sin `used_at`; sin `token`, con un token inexistente y con el de una invitación revocada → `410 ACCESS_LINK_INVALID`
- [x] 12.3 `POST /api/invitations/accept` con campos no válidos y sin consentimiento → `400`; con el email del administrador → `409` y la invitación sigue pendiente; con datos válidos y `role: "ADMIN"` en el cuerpo → `201` sin `Set-Cookie`, con rol `MEMBER`, y en la base de datos el usuario `ACTIVE` con el consentimiento y la invitación con `used_at`; aceptarla otra vez → `410`; iniciar sesión con la cuenta nueva → `204`
- [x] 12.4 Dos aceptaciones simultáneas de la invitación de administrador (dos `curl` en paralelo) → un `201` y un `410`, y un solo usuario creado; con `INVITATION_ATTEMPTS_MAX` bajo, el `429` con `Retry-After` tras agotarlo con tokens inexistentes; el log no contiene ningún token, hash, enlace ni contraseña; con la base de datos parada → `503`, y recuperación al volver
- [x] 12.5 Borrar los datos creados (enlaces de acceso antes que usuarios y colegios, por las claves foráneas), comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 12.6 Documentar los comandos y respuestas (sin contraseñas, tokens ni enlaces) en `reports/YYYY-MM-DD-step-12-curl-manual-testing.md`

## 13. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Añadir `INVITATION_ATTEMPTS_MAX=1000` al backend de E2E en `scripts/e2e.mjs`
- [x] 13.2 Escribir `invitation-acceptance.cy.ts`: un administrador registrado genera una invitación de miembro por la API; se abre su enlace, la URL pierde el fragmento, se ven el colegio y el rol, se crea la cuenta, se llega a `/login` con el aviso de cuenta creada y el email escrito, y se inicia sesión como `MEMBER` (en `/onboarding`, sin el enlace «Usuarios»); un enlace revocado muestra la vista no válida; un email ya registrado muestra su error en el campo
- [x] 13.3 Ampliar `csp.cy.ts` para que `/invitacion` (con el formulario y con la vista no válida) no viole la CSP ni cargue recursos de terceros
- [x] 13.4 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 13.5 Verificar y restaurar la base de datos de test
- [x] 13.6 Documentar el resultado en `reports/YYYY-MM-DD-step-13-e2e-cypress.md`

## 14. Documentación (MANDATORY)

- [x] 14.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (alta atómica con un `UPDATE` condicionado y el `INSERT` en la misma transacción; comprobar el enlace antes que los campos en los endpoints públicos con secretos) y `docs/frontend-standards.md` (leer un secreto del fragmento y quitarlo de la URL; pasar un aviso a otra página por el estado de la navegación), si añaden una regla nueva
- [x] 14.2 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (`used_at` en uso y consentimiento de los invitados), `backend/CLAUDE.md` (router público, aceptación y límite de intentos), `frontend/CLAUDE.md` (`AcceptInvitationPage` y el aviso de `LoginPage`), `CLAUDE.md` (estado del repositorio y endpoints) y `README.md`
- [x] 14.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 14.4 Verificar con `openspec validate us02-b4-aceptar-invitacion --strict` que el cambio es válido

## 15. Despliegue y comprobación en producción

- [ ] 15.1 Abrir la PR con los grupos 0–14 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 15.2 Comprobar en producción con `curl` que `POST /api/invitations/lookup` y `POST /api/invitations/accept` con un token inexistente responden `410 ACCESS_LINK_INVALID` sin crear datos, y que la persona usuaria, con un navegador real y una cuenta de prueba, genera una invitación, la abre en otra ventana privada, crea la cuenta e inicia sesión con ella sin violaciones de CSP
- [ ] 15.3 Documentar el resultado en `reports/YYYY-MM-DD-step-15-production.md`, con el orden de borrado de los datos de prueba
