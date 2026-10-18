## Why

Un colegio tiene ya un administrador que gestiona a sus usuarios (US02_b1 y US02_b2), pero no hay forma de que entre nadie más: el registro siempre crea un colegio nuevo. US02_b (invitar y gestionar usuarios, PRD §3.1, roles `ADMIN` y `MEMBER`) resuelve la incorporación con enlaces de invitación que el administrador genera y reparte por su cuenta, porque CalendarSchool no envía correos. Esta tercera porción, **US02_b3** (`docs/User_Stories_MVP.md`, enriquecida el 2026-10-17), cubre el lado del administrador: generar, listar y revocar invitaciones, y la tabla de enlaces de acceso que también usará el restablecimiento de contraseña (US02_c). La aceptación del enlace llega con US02_b4.

## What Changes

- **Tabla nueva `access_links`**, completa tal como está diseñada en `MODELO_DATOS.md`: propósito `INVITATION` o `PASSWORD_RESET`, hash SHA-256 del token, rol (invitaciones), usuario afectado (restablecimientos), quién lo generó, caducidad de 72 horas, uso y revocación, con un `CHECK` por propósito y el índice único parcial de un restablecimiento pendiente por usuario. Este cambio solo usa las invitaciones.
- **Tres endpoints nuevos, solo `ADMIN`**, definidos primero en `docs/api-spec.yml`:
  - `POST /api/invitations` con `{ role }`: genera un token de 256 bits, guarda solo su hash y responde `201` con la invitación y el enlace completo (`<APP_ORIGIN>/invitacion#<token>`). Es la única respuesta que lo contiene.
  - `GET /api/invitations`: las invitaciones pendientes del colegio (no usadas, no revocadas, no caducadas), con rol, quién la generó y fechas, sin el enlace.
  - `POST /api/invitations/{id}/revoke`: revoca una pendiente (`204`). Es idempotente; otro colegio, inexistente o un id que no es un UUID responde `404 NOT_FOUND`.
- **Las invitaciones de un administrador dado de baja siguen valiendo** y se ven con su nombre; cualquier otro administrador puede revocarlas.
- **Sección «Invitaciones pendientes» en `/usuarios`**: generar eligiendo el rol, un panel con el enlace, «Copiar» (con la selección del texto como alternativa) y el aviso de que no se volverá a mostrar, y la lista con «Revocar».
- **Eventos de log** `INVITATION_CREATED` e `INVITATION_REVOKED`, con el colegio, quien actúa y la invitación; nunca el token ni el enlace.
- **Refactor menor:** el generador de tokens de 256 bits de los refresh tokens pasa a un puerto genérico que comparten las sesiones y los enlaces de acceso.

### Fuera de alcance

- La página pública `/invitacion`, consultar el colegio y el rol desde el enlace, aceptar la invitación, el límite de intentos y el código `ACCESS_LINK_INVALID` (US02_b4). Hasta entonces, un enlace generado lleva a la página de inicio: se acepta porque en producción no hay usuarios reales.
- Los restablecimientos de contraseña (US02_c), aunque la tabla ya los admite.
- El envío de correos, un tope de invitaciones pendientes, la purga de enlaces viejos y revocar las invitaciones al dar de baja a quien las generó.

## Capabilities

### New Capabilities

- `school-invitations`: invitaciones al colegio desde el lado del administrador: la tabla de enlaces de acceso y sus restricciones, generar (token, hash, caducidad y enlace mostrado una sola vez), listar las pendientes, revocar, el aislamiento por colegio, los eventos de log y la sección de la página `/usuarios`.

### Modified Capabilities

Ninguna. La sección nueva de `/usuarios` y sus endpoints se especifican en la capacidad nueva; los requisitos de `school-users`, `request-authentication` y `api-error-handling` no cambian (no hay códigos de error nuevos).

## Impact

- **Contrato:** `docs/api-spec.yml` añade las tres rutas, `CreateInvitationRequest`, `Invitation`, `InvitationCreatedResponse`, `InvitationListResponse` y la respuesta `InvitationNotFound`. Tipos regenerados en `frontend/src/api/generated/schema.ts`.
- **Modelo de datos:** migración nueva con el enum `AccessLinkPurpose`, la tabla `access_links`, sus claves foráneas, índices, el `CHECK` y el índice único parcial (estos dos en SQL, porque Prisma no los expresa). `MODELO_DATOS.md` pasa `access_links` a implementada, con los nombres reales en `snake_case`.
- **Backend:** `domain/accessLink/` (tipo, estado, caducidad, error y puerto), `application/invitations/` (`CreateInvitation`, `ListPendingInvitations`, `RevokeInvitation`), el puerto genérico del generador de tokens, `PrismaAccessLinkRepository`, `presentation/invitations/invitationsRouter.ts`, `errorHandler.ts`, `composeApp`, `AppDependencies` y los dobles de test.
- **Frontend:** `services/invitationsService.ts`, `components/InvitationsSection.tsx` (con el panel del enlace generado), `pages/UsersPage.tsx` y textos en `es.json` y `en.json`.
- **E2E:** spec nueva de invitaciones con el portapapeles simulado; `csp.cy.ts` con la sección abierta. No hacen falta tareas de datos nuevas.
- **Infraestructura:** ninguna; las rutas cuelgan de `/api`, que CloudFront ya reenvía. El despliegue aplica la migración con el paso que ya existe.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md`, `README.md` y, si añaden una regla nueva, `docs/backend-standards.md` y `docs/frontend-standards.md`.
