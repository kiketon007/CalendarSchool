## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us02-b3-invitaciones` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la historia US02_b3 y sus decisiones en `docs/User_Stories_MVP.md` y `.claude/settings.json` (que vuelve a Sonnet con esfuerzo medio)

## 1. Contrato de la API (D4, D6)

- [x] 1.1 Añadir a `docs/api-spec.yml` los esquemas `CreateInvitationRequest`, `Invitation` (`id`, `role`, `createdBy` con `id`, `firstName` y `lastName`, `createdAt`, `expiresAt`), `InvitationCreatedResponse` (`invitation` y `url`) e `InvitationListResponse`, la respuesta reutilizable `InvitationNotFound`, el parámetro de ruta del id, y las rutas `POST /api/invitations` (`createInvitation`: `201`, `400`, `401`, `403`, `500`, `503`), `GET /api/invitations` (`listPendingInvitations`: `200`, `401`, `403`, `500`, `503`) y `POST /api/invitations/{id}/revoke` (`revokeInvitation`: `204`, `401`, `403`, `404`, `500`, `503`), con `security: [bearerAuth]` y la nota de que el `201` es la única respuesta con el enlace
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar las tres operaciones y los esquemas en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend` y `npm run typecheck -w frontend`

## 2. Base de datos: tabla `access_links` (TDD, D1)

- [x] 2.1 Tests de integración que fallan (`accessLinksSchema.int.test.ts`): se inserta una invitación válida y un restablecimiento válido; el `CHECK` rechaza una invitación sin `role`, una invitación con `user_id`, un restablecimiento sin `user_id` y un restablecimiento con `role`; el índice único parcial rechaza un segundo restablecimiento pendiente del mismo usuario y lo admite si el primero está usado o revocado; `token_hash` es único; las claves foráneas rechazan un colegio o un usuario inexistentes
- [x] 2.2 Añadir a `backend/prisma/schema.prisma` el enum `AccessLinkPurpose` y el modelo `AccessLink` (columnas en `snake_case` con `@map`, relaciones con nombre a `User` para `user` y `createdBy`, sin `onDelete: Cascade`, `@@index([schoolId, purpose])`), generar la migración con `prisma migrate dev --create-only`, completarla a mano con el `CHECK` y el índice único parcial, aplicarla a la base de desarrollo y regenerar el cliente
- [x] 2.3 Comprobar que `resetDatabase()` y la limpieza del E2E vacían `access_links` sin cambios (recorren todas las tablas salvo las conservadas) y que `schema.int.test.ts` sigue pasando

## 3. Backend: dominio de los enlaces de acceso (TDD, D2)

- [x] 3.1 Tests que fallan (`accessLink.test.ts`): `accessLinkStatus` devuelve `PENDING` antes de `expires_at`, `EXPIRED` en el instante exacto y después, `REVOKED` y `USED`, con la prioridad usado → revocado → caducado; `ACCESS_LINK_TTL_HOURS` es 72
- [x] 3.2 Implementar `domain/accessLink/accessLink.ts` (tipo `AccessLink`, constante y `accessLinkStatus`), el error `InvitationNotFound` y el puerto `AccessLinkRepository` (`createInvitation`, `listPendingInvitations(schoolId, now)` y `revokeInvitation(schoolId, id, now)` → `revoked` | `notPending` | `null`) con el tipo `PendingInvitation`

## 4. Backend: puerto genérico del generador de tokens (D3)

- [x] 4.1 Mover el puerto a `application/tokens/secretTokenGenerator.ts` (`SecretTokenGenerator` y `GeneratedSecretToken`), dejar `RefreshTokenGenerator` y `GeneratedRefreshToken` como alias de tipo, renombrar el adaptador a `CryptoSecretTokenGenerator` (`infrastructure/cryptoSecretTokenGenerator.ts` y su test) y actualizar `composeApp`
- [x] 4.2 Ejecutar la suite del backend (unitarios e integración) y comprobar que el refactor no cambia nada antes de seguir

## 5. Backend: repositorio de enlaces de acceso (TDD, D5)

- [x] 5.1 Tests de integración que fallan (`prismaAccessLinkRepository.int.test.ts`): `createInvitation` guarda la fila tal cual; `listPendingInvitations` devuelve solo las invitaciones pendientes del colegio indicado (no las revocadas, usadas, caducadas en el instante exacto ni de otro colegio, y no los restablecimientos), de la más reciente a la más antigua, con el nombre de quien la creó aunque esté `SUSPENDED` y sin `token_hash`; `revokeInvitation` revoca una pendiente, devuelve `notPending` para una revocada (sin cambiar su primer `revoked_at`), usada o caducada, y `null` para otro colegio, un id inexistente o un restablecimiento; dos revocaciones simultáneas dejan un único `revoked_at`; cada método traduce un fallo de conexión a `DatabaseUnavailable`
- [x] 5.2 Implementar `infrastructure/prisma/prismaAccessLinkRepository.ts` con `select` explícito, la regla de pendiente en el `where` y el `updateMany` condicionado

## 6. Backend: casos de uso de las invitaciones (TDD, D4)

- [x] 6.1 Tests que fallan (`parseCreateInvitationRequest`): `ADMIN` y `MEMBER` válidos; `role` ausente, nulo o vacío es `REQUIRED`; otro valor, otro tipo o en minúsculas es `INVALID_FORMAT`; ignora las propiedades desconocidas. Reutilizar `parseChangeRoleRequest` si encaja sin forzarlo
- [x] 6.2 Tests que fallan (`createInvitation.test.ts`, con dobles): guarda el hash del generador y nunca el token; `expires_at` es `now` + 72 h; `created_by_id` es quien actúa y el colegio es el de la identidad; el `url` es `appOrigin` + `/invitacion#` + token; registra `INVITATION_CREATED` con `school_id`, `actor_id`, `invitation_id` y `role`; ningún log contiene el token, el hash ni el `url`; `DatabaseUnavailable` se propaga
- [x] 6.3 Tests que fallan (`listPendingInvitations.test.ts` y `revokeInvitation.test.ts`): el listado pasa el colegio y `now`; la revocación lanza `InvitationNotFound` con `null`, registra `INVITATION_REVOKED` solo con `revoked` y termina sin evento con `notPending`
- [x] 6.4 Implementar `application/invitations/` (`createInvitationRequest.ts`, `createInvitation.ts`, `listPendingInvitations.ts`, `revokeInvitation.ts`) con el reloj y `appOrigin` inyectados

## 7. Backend: rutas, errores y cableado (TDD, D6)

- [x] 7.1 Test que falla (`errorHandler.test.ts`): `InvitationNotFound` → `404 NOT_FOUND`; implementarlo en `domainError`
- [x] 7.2 Tests que fallan (`invitationsRoute.test.ts`, con dobles): `POST /api/invitations` responde `201` con la invitación (fechas ISO 8601) y el `url`, con `Cache-Control: no-store`, y pasa el colegio, quien actúa y el rol; `400 VALIDATION_ERROR` del rol; `GET /api/invitations` responde `200` con la lista; `POST /api/invitations/{id}/revoke` responde `204` y `404` con un id que no es un UUID sin llamar al caso de uso; sin token, `401` antes que `403` en las tres; con un `MEMBER`, `403` sin llamar a nada; `schoolId` en la petición se ignora; `503` con `DatabaseUnavailable`
- [x] 7.3 Implementar `presentation/invitations/invitationsRouter.ts`, montarlo en `app.ts` en `/api/invitations` antes de `notFoundHandler` y cablear los casos de uso, el repositorio y `appOrigin` en `composeApp`, `AppDependencies`, `defaultDependencies` y `test/support/appDoubles.ts`
- [x] 7.4 Test de integración (`invitations.int.test.ts`) con la app real: generar y comprobar que el SHA-256 del fragmento del `url` es el `token_hash` guardado; la lista sin el enlace; revocar y desaparecer; revocar otra vez `204`; aislamiento con dos colegios (lista y revocación); un restablecimiento insertado con SQL no se puede revocar por esta ruta; la invitación de un administrador dado de baja sigue en la lista; un `MEMBER` recibe `403` y sin token `401`; ningún log contiene el token; `503` con la base de datos caída

## 8. Frontend: servicio de invitaciones (TDD, D7)

- [x] 8.1 Tests que fallan (`invitationsService.test.ts`): `create`, `list` y `revoke` envían el método, la ruta y el cuerpo correctos con `authorizedFetch`; devuelven `created` (invitación y `url`), `loaded` y `revoked` con su respuesta correcta, `notFound` con `404 NOT_FOUND`, `forbidden` con `403 FORBIDDEN`, `unauthenticated` con `401`, y `unavailable` con `503`, otro código, un cuerpo inesperado o un error de red, sin lanzar nunca
- [x] 8.2 Implementar `services/invitationsService.ts`

## 9. Frontend: sección de invitaciones (TDD, D7)

- [x] 9.1 Tests que fallan (`InvitationsSection.test.tsx`): pide la lista una vez aunque `StrictMode` ejecute el efecto dos veces y muestra un indicador mientras carga; muestra rol, quién la generó y las fechas con el idioma activo; un fallo de la lista muestra el aviso con «Reintentar»; generar con el rol elegido («Miembro» por defecto) muestra el panel y añade la invitación a la lista sin volver a pedirla; el doble clic envía una sola petición; «Copiar» escribe en el portapapeles y muestra «Enlace copiado» con `role="status"`; sin portapapeles, o si falla, selecciona el texto y muestra cómo copiarlo a mano; «Hecho» cierra el panel; revocar quita la fila con una guarda por fila; cada fallo muestra su aviso; un `404` al revocar avisa y vuelve a pedir la lista; un `403` llama a la función de salida recibida; sin violaciones de `axe`
- [x] 9.2 Implementar `components/InvitationsSection.tsx` y `GeneratedInvitationPanel`, y las claves `invitations.*` en `es.json` y `en.json`
- [x] 9.3 Tests que fallan (`UsersPage.test.tsx`): la página muestra la sección de invitaciones debajo de la tabla; un fallo de la lista de invitaciones no afecta a la de usuarios; un `403` de las invitaciones lleva a `/onboarding` tras renovar la sesión
- [x] 9.4 Montar `InvitationsSection` en `pages/UsersPage.tsx`, con la salida a `/onboarding` compartida

## 10. Revisar y actualizar los tests unitarios (MANDATORY)

- [x] 10.1 Revisar los tests afectados por el refactor del generador de tokens, por las dependencias nuevas de `createApp` y `composeApp`, por los mocks de `fetch` de los tests existentes de `UsersPage` (que ahora reciben también `GET /api/invitations`) y por `schema.int.test.ts`, y actualizarlos
- [x] 10.2 Revisar los E2E existentes de `users.cy.ts`, `users-management.cy.ts` y `csp.cy.ts` que comprueben el contenido de `/usuarios` o intercepten sus peticiones

## 11. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 11.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users` por estado y rol, `schools`, `refresh_tokens` con y sin `revoked_at`, `rate_limit_attempts`, `access_links` y `municipalities` por esquema)
- [x] 11.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [x] 11.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 11.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 11.5 Crear el informe `reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 12. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 En local, con el backend arrancado y el verificador falso: registrar un administrador, obtener su access token y crear con SQL un `MEMBER` en su colegio y un segundo colegio con su administrador
- [x] 12.2 `POST /api/invitations` con `MEMBER` y con `ADMIN` → `201` con el `url`, `Cache-Control: no-store`, y en la base de datos el `token_hash` es el SHA-256 del fragmento; cuerpo sin `role` y con `OWNER` → `400`; `GET /api/invitations` → las dos, sin enlace, de la más reciente a la más antigua
- [x] 12.3 `POST …/revoke` → `204` y desaparece de la lista; repetido → `204` sin cambiar `revoked_at`; id que no es un UUID, inexistente, de otro colegio y un restablecimiento insertado con SQL → `404`; una invitación caducada con SQL no aparece en la lista
- [x] 12.4 Sin `Authorization` → `401` con `WWW-Authenticate: Bearer` en las tres rutas; con un token de `MEMBER` → `403`; el log del backend no contiene ningún token ni enlace; con la base de datos parada → `503 DATABASE_UNAVAILABLE`, y recuperación al volver
- [x] 12.5 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 12.6 Documentar los comandos y respuestas (sin contraseñas, tokens ni enlaces) en `reports/YYYY-MM-DD-step-12-curl-manual-testing.md`

## 13. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Escribir `invitations.cy.ts`: un administrador registrado genera una invitación de miembro, ve el enlace con el aviso, lo copia con el portapapeles simulado y ve «Enlace copiado»; recarga y la invitación sigue en la lista sin el enlace; genera otra de administrador; revoca la primera y desaparece; un `503` simulado al generar muestra el aviso
- [x] 13.2 Ampliar `csp.cy.ts` para que la sección de invitaciones y el panel del enlace no violen la CSP
- [x] 13.3 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 13.4 Verificar y restaurar la base de datos de test
- [x] 13.5 Documentar el resultado en `reports/YYYY-MM-DD-step-13-e2e-cypress.md`

## 14. Actualizar la documentación técnica (MANDATORY)

- [x] 14.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (restricciones que Prisma no expresa: `CHECK` e índices parciales escritos a mano en la migración y probados con tests de integración; tokens opacos con el puerto genérico) y `docs/frontend-standards.md` (secretos mostrados una sola vez: solo en memoria, copiar con alternativa de selección), si añaden una regla nueva
- [x] 14.2 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (`access_links` implementada, nombres reales en `snake_case`, migración y la advertencia del SQL a mano), `backend/CLAUDE.md` (enlaces de acceso, invitaciones y el generador de tokens), `frontend/CLAUDE.md` (`InvitationsSection` y el panel), `CLAUDE.md` (estado del repositorio y endpoints) y `README.md`
- [x] 14.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 14.4 Verificar con `openspec validate us02-b3-invitaciones --strict` que el cambio es válido

## 15. Despliegue

- [x] 15.1 Abrir la PR con los grupos 0–14 y, tras integrarla la persona usuaria, verificar el despliegue automático (con la migración aplicada) y su smoke test
- [x] 15.2 Comprobar en producción con `curl` que las tres rutas sin token responden `401`, y que la persona usuaria, con un navegador real y una cuenta de prueba, genera, copia y revoca una invitación sin violaciones de CSP; anotar el hueco hasta US02_b4 (el enlace lleva a la página de inicio)
- [x] 15.3 Documentar el resultado en `reports/YYYY-MM-DD-step-15-production.md`
