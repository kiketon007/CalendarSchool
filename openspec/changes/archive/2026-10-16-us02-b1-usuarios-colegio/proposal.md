## Why

Todavía no existe ningún endpoint protegido: el backend sabe emitir access tokens, pero no comprobarlos, y el frontend no tiene forma de hacer peticiones autenticadas ni un sitio común donde colgar las pantallas con sesión. US02_b (invitar y gestionar usuarios, PRD §3.1, roles `ADMIN` y `MEMBER`) se ha dividido en cuatro porciones, y esta primera, **US02_b1** (`docs/User_Stories_MVP.md`, enriquecida el 2026-10-16), construye esos cimientos con la funcionalidad más sencilla: que un administrador vea los usuarios de su colegio. Todas las historias siguientes (US02_b2–b4, US02_c, US04 y los módulos funcionales) dependen de ellos.

## What Changes

- **Autenticación de los endpoints protegidos (decisión B de US03):** un middleware lee `Authorization: Bearer <access token>`, verifica el JWT y lee en una sola consulta por clave primaria la sesión `sid` con su usuario. Rechaza con `401 INVALID_SESSION` y `WWW-Authenticate: Bearer` un token ausente o inválido, una sesión inexistente, revocada, caducada o de otro usuario, y un usuario que no esté `ACTIVE`. La identidad de la petición (`userId`, `schoolId`, `role`, `sessionId`) sale de la base de datos, nunca de los claims `role` y `schoolId` del token, que se mantienen sin usarse para autorizar.
- **Autorización por rol:** guarda `requireRole('ADMIN')` con el código de error nuevo `FORBIDDEN` (`403`), siempre después de la autenticación.
- **Aislamiento por colegio:** los puertos de lectura reciben `schoolId` obligatorio, tomado de la identidad de la petición; ningún endpoint acepta el colegio en la ruta ni en el cuerpo.
- **Nuevo endpoint `GET /api/users`** (solo `ADMIN`), definido primero en `docs/api-spec.yml`: usuarios `ACTIVE` y `SUSPENDED` del colegio (sin `DELETED`), con `id`, nombre, apellidos, email, rol, estado y fecha de alta, ordenados por apellidos, nombre y email.
- **Cliente HTTP autenticado en el frontend:** añade el access token en memoria y, ante un `401 INVALID_SESSION`, renueva una sola vez (compartida entre peticiones simultáneas) y repite la petición; si la renovación falla, la sesión pasa a `anonymous`.
- **Estructura de las pantallas autenticadas:** ruta de layout `AuthenticatedLayout` con la única guarda de sesión, la cabecera y la navegación; guarda `RequireRole` que lleva a `/onboarding` sin mensaje. `/onboarding` pasa a colgar del layout y pierde su guarda propia. US04 decidirá después el contenido de la navegación.
- **Página `/usuarios`** con la tabla de usuarios, estados de carga y error con reintento, y paso a `/onboarding` ante un `403`. El enlace «Usuarios» de la navegación solo aparece para un `ADMIN`.
- **Eventos de log** `AUTHENTICATION_REJECTED` (con `reason`) y `AUTHORIZATION_DENIED`, sin tokens.

### Fuera de alcance

- Cambiar el rol, dar de baja y reactivar usuarios, y la regla del último administrador (US02_b2).
- Invitaciones: generar, listar, revocar y aceptar (US02_b3 y US02_b4).
- Paginación, búsqueda, filtros y ordenación por columnas de la lista.
- El contenido definitivo de la navegación y la pantalla de bienvenida (US04).
- Quitar `role` y `schoolId` de los claims del access token.
- Cachés de la sesión en el backend (retrasarían las revocaciones).

## Capabilities

### New Capabilities

- `request-authentication`: autenticación y autorización de los endpoints protegidos: lectura del bearer token, comprobación de la sesión y del usuario en la base de datos en cada petición, identidad de la petición, `401` frente a `403`, guarda de rol, aislamiento por colegio y eventos de log.
- `school-users`: listado de los usuarios del colegio: contrato de `GET /api/users`, campos, estados incluidos, orden y aislamiento, y la página `/usuarios` con su enlace en la navegación, solo para administradores.

### Modified Capabilities

- `session-management`: el frontend gana un cliente autenticado que renueva la sesión una sola vez ante un `401` y repite la petición; las peticiones simultáneas comparten la renovación.
- `frontend-shell`: las rutas protegidas cuelgan de un layout común con la guarda de sesión, la cabecera y la navegación, y `/onboarding` pasa a depender de él; se añade la guarda de rol.
- `api-error-handling`: nuevo código `FORBIDDEN` (`403`) en el formato común de error.
- `user-logout`: la cabecera con «Cerrar sesión» se muestra en las páginas protegidas (las que cuelgan del layout), no en las públicas aunque haya sesión.

## Impact

- **Contrato:** `docs/api-spec.yml` añade el esquema de seguridad `bearerAuth`, `GET /api/users`, las respuestas reutilizables `Unauthorized` y `Forbidden` y el código `FORBIDDEN`. Tipos regenerados en `frontend/src/api/generated/schema.ts`.
- **Backend:** `application/authentication/` (caso de uso `AuthenticateRequest`, puerto `SessionLookup`, error `Forbidden`), `application/users/` (`ListSchoolUsers`, puerto `SchoolUserRepository`), sus implementaciones Prisma, `presentation/http/requireAuthentication.ts` y `requireRole.ts`, `presentation/users/usersRouter.ts`, `errorHandler.ts`, `appError.ts`, `composeApp`, `AppDependencies` y los dobles de test.
- **Frontend:** cliente autenticado en `session/`, `routes/AuthenticatedLayout.tsx` y `routes/RequireRole.tsx`, `App.tsx` con rutas anidadas, navegación en `AppHeader`, `OnboardingPage` sin guarda propia, `services/usersService.ts`, `pages/UsersPage.tsx` y textos en `es.json` y `en.json`.
- **E2E:** tarea nueva de Cypress `createUser` en `scripts/e2eData.mjs` (solo sobre bases `*_test`) para crear un `MEMBER`, porque aún no hay invitaciones.
- **Modelo de datos:** sin migración; se usan `users.school_id` (con índice) y `refresh_tokens` por clave primaria. `MODELO_DATOS.md` no cambia.
- **Infraestructura:** ninguna.
- **Rendimiento:** una consulta por clave primaria más en cada petición protegida, a través del *pooler* de Supabase.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/arquitectura/ARQUITECTURA_COMPLETA.md` y, si cambian sus patrones, `docs/backend-standards.md` y `docs/frontend-standards.md`.
