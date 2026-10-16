## Why

Un usuario con la sesión iniciada no tiene forma de cerrarla: la cookie `refresh_token` sigue siendo válida durante 24 horas aunque deje el ordenador, y en un ordenador compartido (sala de profesores) cualquiera puede volver a entrar con su cuenta. El PRD (§3.1, «Un usuario autenticado puede cerrar sesión») lo exige para el MVP. Este cambio implementa **US03** (`docs/User_Stories_MVP.md`, versión enriquecida el 2026-10-15). También fija ahora cómo se invalidarán los access tokens (decisión B), porque de ello dependen la baja de usuarios (US02_b) y el restablecimiento de contraseña (US02_c).

## What Changes

- **Nuevo endpoint `POST /api/auth/logout`**, definido primero en `docs/api-spec.yml`: comprueba el `Origin`, revoca solo la sesión de la cookie (`refresh_tokens.revoked_at`), borra la cookie y responde `204`. Es idempotente (sin sesión que revocar también responde `204`). Si la base de datos no responde, da `503` **sin** borrar la cookie.
- **El access token lleva el id de su sesión** (claim `sid`), que `POST /api/auth/refresh` añade al emitirlo. Es la base de la decisión B: el middleware de los endpoints protegidos comprobará en cada petición que esa sesión siga válida. El middleware no se construye en este cambio.
- **`Cache-Control: no-store` en todas las respuestas de `/api/*`**, con un middleware común que sustituye los `no-store` de cada ruta de `authRouter`. `GET /api/municipalities` mantiene su caché pública de un día.
- **Cabecera mínima (`AppHeader`)**, visible solo con sesión iniciada: nombre de la aplicación, usuario, colegio y botón «Cerrar sesión», sin diálogo de confirmación. Es provisional hasta el layout de US04.
- **`logout()` en el contexto de sesión del frontend:** con `204` descarta la sesión de la memoria y navega a `/login`. Si el cierre falla, mantiene la sesión y muestra un aviso.
- **Sincronización entre pestañas** con `BroadcastChannel`: al cerrar la sesión en una, las demás pestañas del mismo navegador pasan a `/login`.
- **Eventos de log** `USER_LOGOUT` y `USER_LOGOUT_WITHOUT_SESSION` (con `reason`), sin tokens ni cookies.

### Fuera de alcance

- El middleware de autenticación de endpoints protegidos (llega con US02_b o US04, el primero que los tenga) y la renovación transparente tras un `401`.
- Correos de aviso y cierre forzado por un administrador (lo cubre la baja de US02_b).
- Cierre de sesión sin conexión con sincronización posterior, aviso de cambios sin guardar y cancelación de peticiones en curso (aún no hay formularios ni peticiones autenticadas en sesión).
- «Cerrar todas mis sesiones», rotación de refresh tokens y purga de refresh tokens caducados o revocados.
- Retención de logs de 90 días (se mantienen los 30) y guardar la IP o el user agent en la sesión (solo están en los logs, decisión de US02).

## Capabilities

### New Capabilities

- `user-logout`: cierre de sesión: contrato de `POST /api/auth/logout`, orden de procesamiento, revocación idempotente de la sesión de la cookie, fallo sin borrar la cookie, eventos de log, cabecera con el botón «Cerrar sesión» y comportamiento del frontend tras cerrar sesión, incluida la sincronización entre pestañas.

### Modified Capabilities

- `session-management`: el access token lleva el claim `sid` con el id de su sesión; el contexto de sesión del frontend expone `logout()` y reacciona al cierre de sesión en otra pestaña; el refresh token revocado deja de renovar la sesión (escenario explícito tras el cierre).
- `api-error-handling`: todas las respuestas de `/api/*` llevan `Cache-Control: no-store` salvo las rutas que declaran su propia caché.

## Impact

- **Contrato:** `docs/api-spec.yml` añade `POST /api/auth/logout` (`204`, `403`, `503`) y la cabecera `Cache-Control` en las respuestas; no hay códigos de error nuevos. Tipos regenerados en `frontend/src/api/generated/schema.ts`.
- **Backend:** caso de uso `LogOut` (`application/session/`), revocación en `RefreshTokenRepository` y `PrismaRefreshTokenRepository`, ruta en `authRouter`, cableado en `composeApp`, `sessionId` en `AccessTokenClaims` y en `RefreshSession`, middleware de `Cache-Control` en `createApp`.
- **Frontend:** `components/AppHeader.tsx` (montado en `App.tsx`), `logout()` y `BroadcastChannel` en `SessionProvider`, `sessionService.logout()`, textos en `es.json` y `en.json`, E2E de cierre de sesión.
- **Modelo de datos:** sin migración; `refresh_tokens.revoked_at` existe desde US01_c. `MODELO_DATOS.md` documenta que pasa a usarse.
- **Infraestructura:** ninguna.
- **Documentación:** `README.md`, `CLAUDE.md`, `docs/arquitectura/ARQUITECTURA_COMPLETA.md`, `docs/Modelo_de_Datos/MODELO_DATOS.md` y, si cambian sus patrones, `docs/backend-standards.md` y `docs/frontend-standards.md`.
