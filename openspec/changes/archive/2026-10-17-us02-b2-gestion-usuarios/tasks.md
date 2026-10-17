## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us02-b2-gestion-usuarios` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la historia US02_b2 y las decisiones en `docs/User_Stories_MVP.md` y `.claude/settings.json`

## 1. Contrato de la API (D4, D5)

- [x] 1.1 Añadir a `docs/api-spec.yml` los códigos `LAST_ADMIN_REQUIRED`, `CANNOT_SUSPEND_SELF` y `USER_NOT_ACTIVE` en `ErrorCode`, la respuesta reutilizable `NotFound` si no existe, los esquemas `ChangeUserRoleRequest` y `SchoolUserResponse`, y las rutas `PUT /api/users/{id}/role` (`changeUserRole`), `POST /api/users/{id}/suspend` (`suspendUser`) y `POST /api/users/{id}/reactivate` (`reactivateUser`) con `security: [bearerAuth]`, el parámetro `id` (`format: uuid`, el `404` cubre también un id mal formado) y sus respuestas (`200`, `400` solo en `role`, `401`, `403`, `404`, `409` con los códigos de cada operación, `500` y `503`)
- [x] 1.2 Test que falla (`appError.test.ts`): `ERROR_CODES` contiene los tres códigos nuevos; añadirlos a `appError.ts`
- [x] 1.3 Regenerar los tipos con `npm run api:types -w frontend`, fijar las tres operaciones y `ChangeUserRoleRequest` en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Backend: regla de dominio `planUserChange` (TDD, D1)

- [x] 2.1 Tests que fallan (`userManagement.test.ts`): `suspend` sobre uno mismo lanza `CannotSuspendSelf` aunque haya varios administradores; `changeRole` sobre un `SUSPENDED` lanza `UserNotActive` también con el mismo rol; el rol ya pedido, `suspend` de un `SUSPENDED` y `reactivate` de un `ACTIVE` devuelven `null`; quitar el rol o dar de baja al último `ADMIN` activo lanza `LastAdminRequired` y con dos no; reactivar nunca lanza `LastAdminRequired`; `suspend` devuelve `revokeSessions: true`; el orden de las comprobaciones es el del diseño
- [x] 2.2 Crear los errores `UserNotFound`, `LastAdminRequired`, `CannotSuspendSelf` y `UserNotActive` en `domain/user/userManagementErrors.ts` e implementar `planUserChange` y sus tipos en `domain/user/userManagement.ts`

## 3. Backend: repositorio `applyChange` (TDD, D3)

- [x] 3.1 Tests de integración que fallan (`prismaSchoolUserRepository.int.test.ts`): devuelve `null` con un usuario de otro colegio, inexistente o `DELETED`; pasa al `plan` el objetivo y el recuento de `ADMIN` activos del colegio (sin contar los `SUSPENDED` ni los de otro colegio); con `null` del `plan` no escribe; si el `plan` lanza, no escribe y propaga el error; aplica el cambio de rol y de estado y devuelve `previous`, `user` (siete campos) y `change`; con `revokeSessions` revoca solo las sesiones sin revocar del usuario (no las de otros) con `now` y devuelve cuántas; traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 3.2 Test de integración que falla: dos `applyChange` simultáneos que quitan el rol a cada uno de los dos únicos `ADMIN` activos terminan con uno aplicado, otro con `LastAdminRequired` y exactamente un `ADMIN` activo
- [x] 3.3 Añadir `applyChange` y `AppliedUserChange` al puerto `SchoolUserRepository` e implementarlo en `PrismaSchoolUserRepository` con un `$transaction` interactivo: `$executeRaw` del `SELECT … FOR UPDATE` sobre `schools`, `findFirst` con el `select` de la lista, `count`, `plan`, `update` y `updateMany` de `refreshToken`, reutilizando el mapeo de `listBySchool`

## 4. Backend: caso de uso `ManageSchoolUser` (TDD, D2)

- [x] 4.1 Tests que fallan (`manageSchoolUser.test.ts`, con un doble del repositorio y del logger): pasa `schoolId`, `userId` y `now` al repositorio y añade `actorId` a la instantánea del `plan`; `null` del repositorio lanza `UserNotFound`; con cambio registra `USER_ROLE_CHANGED` (`previousRole`, `newRole`), `USER_SUSPENDED` (`revokedSessions`) o `USER_REACTIVATED` con `schoolId`, `actorId` y `userId` y devuelve el usuario; sin cambio no registra nada; un error `409` registra `USER_MANAGEMENT_REJECTED` con su `reason` y se relanza; `DatabaseUnavailable` se propaga sin registrar el rechazo; ningún log contiene emails ni nombres
- [x] 4.2 Implementar `application/users/manageSchoolUser.ts` con el reloj inyectado

## 5. Backend: rutas y errores (TDD, D4, D5)

- [x] 5.1 Tests que fallan (`errorHandler.test.ts`): `UserNotFound` → `404 NOT_FOUND`; `LastAdminRequired`, `CannotSuspendSelf` y `UserNotActive` → `409` con su código; implementarlo en `domainError`
- [x] 5.2 Tests que fallan (`usersRoute.test.ts`, con dobles): las tres rutas con un `ADMIN` responden `200` con el usuario (`createdAt` en ISO 8601) y `Cache-Control: no-store` y pasan al caso de uso el `schoolId` y el `actorId` de la identidad y la acción correcta; sin token, `401` antes que `403`; con un `MEMBER`, `403` sin llamar al caso de uso; un id que no es un UUID responde `404` sin llamar al caso de uso; `role` ausente o con un valor desconocido responde `400 VALIDATION_ERROR`; `schoolId` en el cuerpo o en la consulta se ignora
- [x] 5.3 Añadir las tres rutas a `presentation/users/usersRouter.ts` con el mapeo de respuesta compartido con `GET /` y cablear `ManageSchoolUser` en `composeApp`, `AppDependencies`, `defaultDependencies` y `test/support/appDoubles.ts`
- [x] 5.4 Test de integración (`users.int.test.ts`) con la app real: ascender a un `MEMBER` y su token antiguo pasa a obtener `200` en `GET /api/users`; pasar a `MEMBER` a otro `ADMIN` y su token obtiene `403`; dar de baja a un usuario con dos sesiones revoca ambas, su access token recibe `401`, su `refresh` falla y su login responde `403 ACCOUNT_SUSPENDED`; reactivarlo conserva el rol, el login vuelve a funcionar y las sesiones antiguas siguen revocadas; `CANNOT_SUSPEND_SELF`, `USER_NOT_ACTIVE` y `LAST_ADMIN_REQUIRED` sin cambios en la base de datos; idempotencia; aislamiento con dos colegios en las tres rutas; CA5 con dos peticiones HTTP simultáneas; `503` con la base de datos caída

## 6. Frontend: servicio de acciones (TDD, D6)

- [x] 6.1 Tests que fallan (`usersService.test.ts`): `changeRole`, `suspend` y `reactivate` envían el método, la ruta y el cuerpo correctos con `authorizedFetch`; devuelven `updated` con el usuario con `200`, `lastAdminRequired`, `cannotSuspendSelf` y `userNotActive` con su `409`, `notFound` con `404`, `forbidden` con `403`, `unauthenticated` con `401` y `unavailable` con `503`, otro código, un cuerpo inesperado o un error de red, sin lanzar nunca
- [x] 6.2 Implementar las tres funciones y el intérprete común en `services/usersService.ts`

## 7. Frontend: modal de confirmación (TDD, D6)

- [x] 7.1 Tests que fallan (`ConfirmSuspendModal.test.tsx`): muestra el nombre del usuario y el aviso de cierre de sesiones; el foco empieza en «Cancelar»; «Cancelar» y Escape llaman a `onCancel` sin `onConfirm`; «Dar de baja» llama a `onConfirm`; sin violaciones de `axe`
- [x] 7.2 Implementar `components/ConfirmSuspendModal.tsx` con el `Modal` de react-bootstrap y sus textos en `es.json` y `en.json`

## 8. Frontend: acciones en la página de usuarios (TDD, D6)

- [x] 8.1 Tests que fallan (`UsersPage.test.tsx`): acciones según el rol y el estado; la fila propia lleva «(tú)» y no ofrece «Dar de baja»; un `updated` sustituye la fila sin volver a pedir la lista; un doble clic envía una sola petición y los botones de la fila se deshabilitan mientras tanto; la baja abre el modal, cancelar no envía nada y confirmar envía `suspend`; cada rechazo muestra su aviso `role="alert"` y deja la fila como estaba; `notFound` muestra su aviso y recarga la lista; `forbidden` llama a `refresh()` y navega a `/onboarding`; pasarse a uno mismo a `MEMBER` llama a `refresh()`; sin violaciones de `axe`
- [x] 8.2 Implementar las acciones en `pages/UsersPage.tsx` y sus textos en `es.json` y `en.json`

## 9. Revisar y actualizar los tests unitarios (MANDATORY)

- [x] 9.1 Revisar los tests afectados por `applyChange` en los dobles de `SchoolUserRepository`, por las dependencias nuevas de `usersRouter` y `composeApp`, y por la columna de acciones en los tests existentes de `UsersPage`, y actualizarlos
- [x] 9.2 Revisar los E2E existentes de `users.cy.ts` que comprueben el contenido exacto de las filas

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users` por estado y rol, `schools`, `refresh_tokens` con y sin `revoked_at`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 10.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [x] 10.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 10.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 10.5 Crear el informe `reports/2026-10-17-step-10-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 En local, con el backend arrancado y el verificador falso: registrar un administrador, crear con SQL un `MEMBER` y un segundo `ADMIN` en su colegio y obtener un access token con `refresh`
- [x] 11.2 `PUT …/role` al `MEMBER` → `200` con `role: ADMIN`; volver a `MEMBER`; el mismo rol → `200` sin cambios; cuerpo no válido → `400 VALIDATION_ERROR`; id que no es un UUID y id de otro colegio → `404 NOT_FOUND`
- [x] 11.3 `POST …/suspend` al `MEMBER` → `200` con `SUSPENDED` y sus sesiones revocadas en la base de datos; repetirlo → `200`; `PUT …/role` sobre él → `409 USER_NOT_ACTIVE`; `POST …/suspend` sobre uno mismo → `409 CANNOT_SUSPEND_SELF`; `POST …/reactivate` → `200` con `ACTIVE` y el mismo rol
- [x] 11.4 Con el segundo `ADMIN` pasado a `MEMBER`, intentar pasarse uno mismo a `MEMBER` → `409 LAST_ADMIN_REQUIRED`; sin `Authorization` → `401` con `WWW-Authenticate: Bearer`; con un token de `MEMBER` → `403 FORBIDDEN`; con la base de datos parada → `503 DATABASE_UNAVAILABLE`
- [x] 11.5 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.6 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/2026-10-17-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Escribir `users-management.cy.ts`: un administrador registrado asciende a un `MEMBER` creado con `createUser` y la fila muestra el rol nuevo; lo da de baja confirmando el modal y el login del `MEMBER` muestra el mensaje de cuenta suspendida; lo reactiva y el `MEMBER` inicia sesión; cancelar el modal no cambia nada; el único administrador que pulsa «Hacer miembro» ve «El colegio debe tener al menos un administrador»; con otro `ADMIN` creado con `createUser`, pasarse a `MEMBER` lleva a `/onboarding` sin el enlace «Usuarios»
- [x] 12.2 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo, incluida `csp.cy.ts` con el modal abierto si hace falta
- [x] 12.3 Verificar y restaurar la base de datos de test
- [x] 12.4 Documentar el resultado en `reports/2026-10-17-step-12-e2e-cypress.md`

## 13. Actualizar la documentación técnica (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (invariantes entre filas con bloqueo de la fila padre en el adaptador y la regla como función pura de dominio) y `docs/frontend-standards.md` (acciones por fila con guarda síncrona y confirmación modal), si añaden una regla nueva
- [x] 13.2 Actualizar `backend/CLAUDE.md` (gestión de usuarios: `planUserChange`, `applyChange` con el colegio bloqueado, orden de comprobaciones, revocación en la baja y eventos), `frontend/CLAUDE.md` (acciones de `UsersPage`, modal y `UserActionOutcome`) y `CLAUDE.md` (estado del repositorio y endpoints)
- [x] 13.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 13.4 Verificar con `openspec validate us02-b2-gestion-usuarios --strict` que el cambio es válido

## 14. Despliegue

- [x] 14.1 Abrir la PR con los grupos 0–13 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [x] 14.2 Comprobar en producción, con un navegador real y una cuenta de prueba, cambiar el rol, dar de baja y reactivar sin violaciones de CSP, y con `curl` que `POST /api/users/{id}/suspend` sin token responde `401`
- [x] 14.3 Documentar el resultado en `reports/2026-10-17-step-14-production.md`
