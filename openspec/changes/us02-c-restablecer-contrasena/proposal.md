## Why

Un usuario que olvida su contraseña no tiene forma de recuperar el acceso: CalendarSchool no envía correos y el administrador de su colegio solo puede darlo de baja o reactivarlo con la contraseña de antes. **US02_c** (`docs/User_Stories_MVP.md`, enriquecida el 2026-10-18; PRD §3.1, gestión de usuarios por el `ADMIN`) resuelve la recuperación con un enlace de un solo uso que genera el administrador y entrega por su cuenta, reutilizando la tabla `access_links` (que ya admite `PASSWORD_RESET` desde US02_b3) y el patrón público de US02_b4.

## What Changes

- **Dos endpoints de administrador** (solo `ADMIN`, con las guardas de US02_b1), definidos primero en `docs/api-spec.yml`:
  - `POST /api/users/{id}/password-reset`: para un usuario `ACTIVE` del colegio (incluido el propio administrador) revoca cualquier restablecimiento abierto (también los caducados, que el índice único parcial aún cuenta) y crea uno nuevo de 72 horas; `201` con el restablecimiento y el enlace `<APP_ORIGIN>/restablecer#<token>`, la única respuesta que lo contiene. `409 USER_NOT_ACTIVE` para un `SUSPENDED`; `404 NOT_FOUND` para otro colegio, inexistente, `DELETED` o un id que no es un UUID.
  - `POST /api/users/{id}/password-reset/revoke`: `204`, idempotente.
- **`GET /api/users` suma `passwordResetPending`** (de 7 a 8 campos), y con él las respuestas de cambio de rol, baja y reactivación, que devuelven los mismos campos.
- **Dos endpoints públicos** (sin sesión ni cookies):
  - `POST /api/password-resets/lookup` con `{ token }`: el colegio y el email **enmascarado** del usuario, sin consumir el enlace.
  - `POST /api/password-resets/confirm` con `{ token, password }`: en una transacción marca el enlace como usado, cambia la contraseña (Bcrypt) y **revoca todas las sesiones** del usuario; `204`, sin iniciar sesión. El usuario tiene que seguir `ACTIVE`.
- **Orden fijo** del confirmar: límite de intentos → enlace → contraseña (reglas del registro) → hash → cambio atómico. Un enlace no válido responde `410 ACCESS_LINK_INVALID`, sin distinguir el caso.
- **Límite de intentos propio** (`password-reset:<ip>`, `PASSWORD_RESET_ATTEMPTS_MAX`, 10 por defecto, 15 minutos), compartido por la consulta y la confirmación, que solo cuenta los enlaces no válidos.
- **Frontend:** en `/usuarios`, «Restablecer contraseña» por fila `ACTIVE`, la marca «Restablecimiento pendiente» con «Revocar restablecimiento» y el panel del enlace (el de US02_b3, generalizado); la página pública `/restablecer` (token leído del fragmento y quitado de la URL, contraseña nueva y su confirmación); y el aviso «Tu contraseña se ha cambiado» en `/login`.
- **Eventos de log** `PASSWORD_RESET_LINK_CREATED`, `PASSWORD_RESET_LINK_REVOKED`, `PASSWORD_RESET_COMPLETED` y `PASSWORD_RESET_REJECTED`; nunca el token, su hash, la contraseña ni el email en claro.
- **Cambio sobre la historia original:** se mantiene la `Referrer-Policy` global en lugar de `no-referrer` para `/restablecer`, como en US02_b4 (el token se quita de la URL al cargar la página).

### Fuera de alcance

- La recuperación por correo y el cambio de contraseña desde el perfil (sabiendo la actual).
- Revocar los restablecimientos pendientes al dar de baja a un usuario: se cubre exigiendo `ACTIVE` al usar el enlace.
- Un historial de restablecimientos en la interfaz y recuperar el acceso si todos los administradores están bloqueados (soporte manual).

## Capabilities

### New Capabilities

- `password-reset`: restablecimiento de contraseña con un enlace del administrador: generar y revocar (con la sustitución del enlace anterior y las generaciones simultáneas), consultar y confirmar en público (alta atómica del cambio de contraseña y la revocación de las sesiones), el límite de intentos, los eventos, las acciones de `/usuarios`, la página `/restablecer` y el E2E.

### Modified Capabilities

- `school-users`: `GET /api/users` (y por tanto las respuestas de cambio de rol, baja y reactivación) suma `passwordResetPending`.
- `app-configuration`: variable opcional nueva `PASSWORD_RESET_ATTEMPTS_MAX`.
- `test-infrastructure`: el backend de E2E arranca también con `PASSWORD_RESET_ATTEMPTS_MAX` alto.
- `user-login`: la página de inicio de sesión muestra el aviso de contraseña cambiada al llegar desde el restablecimiento.

## Impact

- **Contrato:** `docs/api-spec.yml` añade las cuatro rutas, `PasswordReset`, `PasswordResetCreatedResponse`, `PasswordResetLookupRequest`, `PasswordResetLookupResponse` y `ConfirmPasswordResetRequest`, y `passwordResetPending` en `SchoolUser`. Sin códigos de error nuevos. Tipos regenerados en `frontend/src/api/generated/schema.ts`.
- **Modelo de datos:** sin migración; la tabla, el `CHECK` y el índice único parcial existen desde US02_b3. `MODELO_DATOS.md` pasa los restablecimientos a «en uso».
- **Backend:** `domain/accessLink/` (cuatro métodos del puerto y sus tipos), `application/passwordResets/` (cuatro casos de uso y el límite de intentos), `PrismaAccessLinkRepository`, `ListSchoolUsers` y `PrismaSchoolUserRepository` (el campo nuevo, también en `applyChange`), `config.ts`, `usersRouter` (dos rutas), un router público en `presentation/passwordResets/`, `composeApp`, `AppDependencies` y los dobles de test.
- **Frontend:** `usersService` (dos acciones y el campo nuevo), `GeneratedLinkPanel` (generaliza el panel de las invitaciones), `UsersPage`, `services/passwordResetService.ts`, `pages/PasswordResetPage.tsx`, la ruta pública en `App.tsx`, `LoginPage` y textos en `es.json` y `en.json`.
- **E2E:** spec nueva del recorrido completo, `csp.cy.ts` con `/restablecer` y `scripts/e2e.mjs` con `PASSWORD_RESET_ATTEMPTS_MAX=1000`.
- **Infraestructura:** ninguna; `/restablecer` se sirve con el `index.html` de la SPA y `/api/*` llega al backend.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md`, `README.md`, `MODELO_DATOS.md` y, si añaden una regla nueva, `docs/backend-standards.md` y `docs/frontend-standards.md`.
