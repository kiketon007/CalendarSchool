## Context

US02_b3 creó `access_links` completa: `purpose` con `PASSWORD_RESET`, la columna `user_id`, el `CHECK` que exige `user_id` (y no `role`) en los restablecimientos y el índice único parcial `access_links_pending_reset_user_key` sobre `user_id` con `purpose = PASSWORD_RESET AND used_at IS NULL AND revoked_at IS NULL`. Ese índice **no mira `expires_at`**: un restablecimiento caducado sin usar ni revocar sigue ocupándolo. US02_b4 dejó el patrón público (router propio montado antes del protegido, token en el cuerpo, enlace antes que los campos, `UPDATE` condicionado en una transacción, límite de intentos que solo cuenta enlaces no válidos, `replaceState` del fragmento y aviso en `/login` por el estado de la navegación), `userFields.ts`, `uniqueViolation.ts`, `requestContext.ts` e `invitationAttempts.ts`. US02_b2 dejó las acciones por fila de `/usuarios`, `USER_NOT_ACTIVE`, el `404` uniforme y la baja, que revoca todas las sesiones del usuario con `refreshToken.updateMany({ where: { userId, revokedAt: null } })` dentro de su transacción.

Hoy no existe ningún método para cambiar la contraseña de un usuario ni para revocar sus sesiones fuera de la baja, y `SchoolUser` no dice si un usuario tiene un restablecimiento pendiente. Las decisiones de producto están en la ficha US02_c de `docs/User_Stories_MVP.md`.

## Goals / Non-Goals

**Goals:**

- Que un administrador recupere el acceso de un usuario sin correo, con un enlace de un solo uso y como mucho un pendiente por usuario.
- Que cambiar la contraseña, usar el enlace y cerrar todas las sesiones sea atómico.
- Que el índice parcial no rompa la regeneración tras una caducidad ni ante dos administradores a la vez.
- Reutilizar el patrón de US02_b3 y US02_b4 sin duplicarlo (panel, límite, lectura del fragmento, aviso en `/login`).

**Non-Goals:**

- Correo, cambio de contraseña desde el perfil e historial de restablecimientos.
- Revocar los restablecimientos al dar de baja (se exige `ACTIVE` al usar el enlace).
- Cambiar la `Referrer-Policy` global.

## Decisions

### D1. Rutas: dos de administrador bajo el usuario y dos públicas con router propio

- `POST /api/users/{id}/password-reset` y `POST /api/users/{id}/password-reset/revoke` van en `usersRouter`, que ya aplica `requireAuthentication` y `requireRole('ADMIN')` con `router.use` y valida el `{id}` con `z.uuid()` (un id mal formado lanza el error de no encontrado antes de llegar a la base de datos). Siguen el estilo de US02_b2: una acción, un endpoint, verbo `POST`.
- `POST /api/password-resets/lookup` y `POST /api/password-resets/confirm` van en `presentation/passwordResets/publicPasswordResetsRouter.ts`, montado en `/api/password-resets`. Ninguna ruta protegida cuelga de ese prefijo, así que no hay que ordenarlo frente a otro router; sin `requireAllowedOrigin`, porque no hay cookies.

*Alternativa descartada:* reutilizar `/api/invitations/*` o una raíz genérica `/api/access-links/*`: los cuerpos y los efectos son distintos (cambiar una contraseña, no crear un usuario) y el contrato queda más claro con una operación por propósito.

### D2. Generar: revocar lo abierto, crear y reintentar una vez ante el índice

`PrismaAccessLinkRepository.createPasswordReset({ schoolId, userId, actorId, tokenHash, expiresAt, now, id })` ejecuta un `$transaction` interactivo:

1. Lee al usuario por `id` y `schoolId` con `status` distinto de `DELETED`; si no existe, devuelve `notFound`; si es `SUSPENDED`, `notActive`.
2. `accessLink.updateMany({ where: { userId, purpose: 'PASSWORD_RESET', usedAt: null, revokedAt: null }, data: { revokedAt: now } })`: revoca cualquier restablecimiento **abierto**, caducado o no, porque el índice parcial los cuenta a todos. Su `count` dice si se sustituyó uno.
3. `accessLink.create` con `purpose: 'PASSWORD_RESET'`, `userId`, `createdById` = quien actúa y el hash.

Si dos administradores generan a la vez, el segundo `create` viola `access_links_pending_reset_user_key` (P2002, detectado con `violatedUniqueIndex`): el caso de uso reintenta la transacción **una vez**, que entonces revoca el del primero y crea el suyo. Las dos peticiones responden `201` y solo vale el último enlace. Un segundo choque (prácticamente imposible) se deja como `500`.

*Alternativas descartadas:* `SELECT … FOR UPDATE` sobre la fila del usuario (más código para una carrera rara) y revocar solo los pendientes no caducados (el `INSERT` fallaría tras una caducidad).

### D3. Confirmar: enlace, contraseña y sesiones en una transacción

`resetPassword({ tokenHash, now, passwordHash })`:

1. `accessLink.updateMany({ where: { tokenHash, purpose: 'PASSWORD_RESET', usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })`; con `count` 0 devuelve `null`.
2. Lee el `userId` y el `schoolId` del enlace.
3. `user.updateMany({ where: { id: userId, status: 'ACTIVE' }, data: { passwordHash } })`; con `count` 0 lanza un error interno que deshace la transacción y el repositorio devuelve `null` (el usuario se dio de baja entre medias).
4. `refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })`, el mismo de la baja; su `count` va al evento.

Con `READ COMMITTED`, dos confirmaciones simultáneas del mismo enlace: la segunda espera el bloqueo de la fila del paso 1 y, al reevaluar el `where`, no actualiza nada (`410`). Los access tokens de las sesiones revocadas dejan de valer en la petición siguiente porque `AuthenticateRequest` lee la sesión `sid` en cada petición (decisión B de US03).

`findPendingPasswordReset(tokenHash, now)` es un `findFirst` con la regla de pendiente y `user: { status: 'ACTIVE' }`, con `select` de `user.email` y `school.name`; el caso de uso enmascara el email con `maskEmail` antes de devolverlo.

*Alternativa descartada:* revocar las sesiones en otra operación después: un fallo entre medias dejaría sesiones vivas con la contraseña ya cambiada.

### D4. Casos de uso en `application/passwordResets/`

- `CreatePasswordReset({ schoolId, actorId, userId })`: genera el token con `SecretTokenGenerator`, calcula `expiresAt` con `accessLinkExpiresAt`, llama al repositorio (con el reintento de D2), traduce `notFound` a `UserNotFound` y `notActive` a `UserNotActive` (los errores de US02_b2, que `errorHandler` ya traduce a `404` y `409`) y devuelve `{ passwordReset: { userId, createdAt, expiresAt }, url }` con `url = appOrigin + '/restablecer#' + token`. Registra `PASSWORD_RESET_LINK_CREATED` con `replaced`.
- `RevokePasswordReset({ schoolId, actorId, userId })`: `revoked` registra `PASSWORD_RESET_LINK_REVOKED`; `none` termina sin evento; `notFound` lanza `UserNotFound`.
- `LookupPasswordReset({ body, context })` y `ConfirmPasswordReset({ body, context })`: el mismo esquema que US02_b4 (reservar intento → token → enlace → liberar intento). La contraseña se valida con `USER_FIELD_SCHEMAS.password` (`400` con el campo `password`) y solo se hashea con un enlace válido. `ConfirmPasswordReset` registra `PASSWORD_RESET_COMPLETED` (`school_id`, `user_id`, `revoked_sessions`) y `PASSWORD_RESET_REJECTED` (`reason`, IP).
- El límite usa la clave `password-reset:<ip>` y su propio `AttemptLimiter` en `composeApp` con `config.passwordResetAttemptsMax`. `invitationAttempts.ts` se generaliza en `accessLinkAttempts.ts` (reserva y liberación con la clave y los nombres de evento por parámetro) si encaja sin forzarlo; si no, un módulo hermano.

### D5. `passwordResetPending` en la lista y en las acciones de usuario

`SchoolUser` suma `passwordResetPending: boolean`. `PrismaSchoolUserRepository.listBySchool(schoolId, now)` y la lectura final de `applyChange` añaden al `select` `accessLinks: { where: { purpose: 'PASSWORD_RESET', usedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { id: true }, take: 1 }` y lo convierten en booleano; nunca devuelven el id ni el hash. `ListSchoolUsers` y `ManageSchoolUser` reciben el reloj. Así las respuestas de `PUT …/role`, `…/suspend` y `…/reactivate` siguen teniendo «exactamente los mismos campos» que la lista (requisito de `school-users`).

*Alternativa descartada:* un endpoint aparte con los ids pendientes: dos peticiones y dos estados de error en la tabla.

### D6. Frontend

- **`usersService`:** `generatePasswordReset(fetch, userId)` → `created` (con `url` y `expiresAt`), `notFound`, `userNotActive`, `forbidden`, `unauthenticated` o `unavailable`; `revokePasswordReset(fetch, userId)` → `revoked`, `notFound`, `forbidden`, `unauthenticated` o `unavailable`. `SchoolUser` lleva `passwordResetPending`.
- **`GeneratedLinkPanel`:** `GeneratedInvitationPanel` se renombra y recibe por parámetro el título, la etiqueta y el aviso; `InvitationsSection` lo usa con sus textos actuales y `UsersPage` con los del restablecimiento. El enlace sigue viviendo solo en el estado del panel.
- **`UsersPage`:** las acciones nuevas usan la guarda por fila de US02_b2 (`pendingRef`). Con `created` marca la fila como pendiente y abre el panel sin volver a pedir la lista; con `revoked`, la desmarca; `notFound` avisa y recarga; `userNotActive` muestra su aviso; `forbidden` sale a `/onboarding`.
- **`PasswordResetPage` (`/restablecer`):** la estructura de `AcceptInvitationPage` (token del fragmento en una `ref`, `replaceState`, consulta única, vistas por resultado). Dos campos de contraseña; la confirmación solo se compara en el cliente. Con `204` navega a `/login` con `state: { passwordChanged: true }`.
- **`LoginPage`:** la guarda `accountCreatedFrom` se generaliza en una que reconoce los dos avisos (`accountCreated` con email y `passwordChanged`), con su texto cada uno en el mismo `role="status"`.

### D7. `Referrer-Policy`

Como en US02_b4 (D8): se mantiene la global de CloudFront y el token se quita de la URL al cargar `/restablecer`. La página no carga recursos de terceros.

## Risks / Trade-offs

- **[Riesgo] El índice parcial cuenta los caducados.** → Mitigación: generar revoca todos los abiertos antes de insertar (D2) y un test de integración genera tras una caducidad.
- **[Riesgo] Dos generaciones simultáneas.** → Mitigación: reintento único ante la violación del índice; test de integración con `Promise.allSettled`.
- **[Riesgo] Añadir un campo a `SchoolUser` toca US02_b1 y US02_b2.** → Mitigación: tarea propia de los tests existentes (lista, acciones y `schema.test.ts`), y el campo se calcula también en `applyChange`.
- **[Riesgo] Un administrador puede tomar el control de la cuenta de otro.** → Inherente a la recuperación sin correo; los eventos registran quién generó el enlace y el usuario lo nota.
- **[Contrapartida] El usuario que restablece su contraseña cierra también la sesión desde la que lo hace,** si la tenía en ese navegador: esperado; la página de destino es `/login`.

## Migration Plan

Sin migración de base de datos ni cambios de infraestructura. `PASSWORD_RESET_ATTEMPTS_MAX` es opcional (10 por defecto), así que no hace falta añadirla a SSM. El campo nuevo de `GET /api/users` es aditivo para el frontend desplegado a la vez. Para volver atrás basta con desplegar el SHA anterior; los restablecimientos pendientes quedan en la tabla y caducan solos.

## Open Questions

Ninguna. Las decisiones de producto se cerraron en la exploración y el enriquecimiento del 2026-10-18.
