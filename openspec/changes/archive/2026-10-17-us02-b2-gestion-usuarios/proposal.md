## Why

Un administrador ya ve los usuarios de su colegio (US02_b1), pero no puede hacer nada con ellos: no puede dar permisos de administrador a otra persona, retirar el acceso a quien deja el colegio ni devolvérselo a quien vuelve. US02_b (invitar y gestionar usuarios, PRD §3.1, roles `ADMIN` y `MEMBER`) se dividió en cuatro porciones; esta segunda, **US02_b2** (`docs/User_Stories_MVP.md`, enriquecida el 2026-10-16), añade el cambio de rol, la baja y la reactivación con la regla de que el colegio siempre conserve al menos un administrador activo. Es independiente de las invitaciones (US02_b3), y US02_c la necesita para restablecer la contraseña de un usuario reactivado.

## What Changes

- **Tres endpoints nuevos, solo `ADMIN`**, definidos primero en `docs/api-spec.yml`, que responden `200` con el usuario actualizado (los mismos campos que `GET /api/users`):
  - `PUT /api/users/{id}/role` con `{ role }`: cambia entre `ADMIN` y `MEMBER`; el usuario conserva sus sesiones y tiene los permisos nuevos desde su siguiente petición.
  - `POST /api/users/{id}/suspend`: pasa a `SUSPENDED` y revoca todas sus sesiones en la misma transacción.
  - `POST /api/users/{id}/reactivate`: vuelve a `ACTIVE` con el mismo rol y la misma contraseña; las sesiones revocadas no reviven.
- **Reglas, en este orden:** `404 NOT_FOUND` para un id de otro colegio, inexistente, `DELETED` o que no es un UUID; `409 CANNOT_SUSPEND_SELF` al darse de baja a uno mismo; `409 USER_NOT_ACTIVE` al cambiar el rol de un `SUSPENDED`; idempotencia (`200` sin cambios ni evento) si el estado o el rol ya es el pedido; `409 LAST_ADMIN_REQUIRED` si la operación deja el colegio sin `ADMIN` activos.
- **Regla del último administrador segura ante peticiones simultáneas:** cada operación se hace en una transacción que bloquea la fila del colegio (`SELECT … FOR UPDATE`) antes de contar los administradores y escribir. La regla en sí es una función pura de dominio.
- **Tres códigos de error nuevos:** `LAST_ADMIN_REQUIRED`, `CANNOT_SUSPEND_SELF` y `USER_NOT_ACTIVE` (este último lo reutilizará US02_c).
- **Página `/usuarios`:** columna de acciones por fila («Hacer administrador» o «Hacer miembro», «Dar de baja» y «Reactivar» según el estado), la fila propia marcada con «(tú)» y sin «Dar de baja», un modal de confirmación solo para la baja, una guarda por fila contra los envíos repetidos y un aviso `role="alert"` por cada error. Quien se pasa a sí mismo a `MEMBER` renueva la sesión y llega a `/onboarding`.
- **Eventos de log** `USER_ROLE_CHANGED`, `USER_SUSPENDED` y `USER_REACTIVATED` (solo cuando hay cambio) y `USER_MANAGEMENT_REJECTED` para los rechazos `409`, con el colegio, el usuario que actúa y el afectado, sin datos personales.

### Fuera de alcance

- Invitaciones: generar, listar, revocar y aceptar (US02_b3 y US02_b4).
- Restablecer la contraseña de un usuario reactivado (US02_c).
- Eliminar usuarios (estado `DELETED`) y la conservación de datos de los dados de baja (decisión general pendiente, RGPD).
- Acciones masivas, historial de cambios visible en la interfaz y avisos al usuario afectado.
- Bloqueo optimista de la lista: con dos administradores en la página gana la última escritura.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-users`: el administrador cambia el rol, da de baja y reactiva a los usuarios de su colegio, con la regla del último administrador, la prohibición de darse de baja a uno mismo, la idempotencia, el aislamiento por colegio en las escrituras y las acciones de la página `/usuarios`.
- `api-error-handling`: códigos nuevos `LAST_ADMIN_REQUIRED`, `CANNOT_SUSPEND_SELF` y `USER_NOT_ACTIVE` (`409`) en el formato común de error.

## Impact

- **Contrato:** `docs/api-spec.yml` añade las tres rutas, `ChangeUserRoleRequest`, `SchoolUserResponse`, la respuesta `NotFound` reutilizable si no existe y los tres códigos. Tipos regenerados en `frontend/src/api/generated/schema.ts`.
- **Backend:** `domain/user/` (regla del último administrador y errores de dominio), `application/users/` (`ChangeUserRole`, `SuspendUser`, `ReactivateUser`), el puerto `SchoolUserRepository` y `PrismaSchoolUserRepository` (transacción con el colegio bloqueado y revocación de sesiones), `presentation/users/usersRouter.ts`, `errorHandler.ts`, `appError.ts`, `composeApp`, `AppDependencies` y los dobles de test.
- **Frontend:** `services/usersService.ts`, `pages/UsersPage.tsx`, un modal de confirmación nuevo en `components/` y textos en `es.json` y `en.json`.
- **E2E:** reutiliza `createUser` y `setUserStatus` de `scripts/e2eData.mjs`; no hacen falta tareas nuevas.
- **Modelo de datos:** sin migración; se usan la clave primaria de `schools`, el índice `users.school_id` y `refresh_tokens.user_id`. `MODELO_DATOS.md` no cambia.
- **Infraestructura:** ninguna; las rutas cuelgan de `/api`, que CloudFront ya reenvía.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md` y, si cambian sus patrones, `docs/backend-standards.md` y `docs/frontend-standards.md`.
