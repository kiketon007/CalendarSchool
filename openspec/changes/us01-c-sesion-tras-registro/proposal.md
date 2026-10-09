## Why

US01_b crea el colegio y su administrador, pero el usuario queda sin sesión: el formulario solo muestra un mensaje de confirmación y tendría que iniciar sesión (US02, que aún no existe) para seguir. US01_c cierra ese hueco: al terminar el registro se inicia la sesión y se redirige al usuario a Onboarding. Además crea la infraestructura de tokens que reutilizarán el inicio de sesión (US02) y el cierre de sesión (US03), por lo que conviene fijarla ahora con revocación incluida.

## What Changes

- **Modelo de datos (Prisma + migración):** tabla `refresh_tokens` con `userId` UUID, `tokenHash` único (nunca el token en claro), revocación (`revokedAt`), caducidad y datos de auditoría (user agent e IP). Sustituye el diseño de la v2.1 de `MODELO_DATOS.md`.
- **Sesión en el registro:** `POST /api/auth/register` fija, tras el alta, un refresh token opaco en una cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, 24 h); el cuerpo del `201` no cambia. El usuario y el refresh token se crean de forma atómica.
- **Endpoint `POST /api/auth/refresh`:** lee la cookie, valida el refresh token (existente, no revocado, no caducado, usuario `ACTIVE`) y devuelve un access token JWT de 15 minutos con el usuario y su colegio. Es la única operación que emite access tokens: el frontend la usa tras el registro y al recargar la página, porque el access token vive solo en memoria. Protegido contra CSRF comprobando el origen de la petición.
- **Configuración:** secreto de firma de los JWT (`JWT_SECRET`) validado en `loadConfig`, y nueva variable de entorno obligatoria en producción.
- **Contrato (`docs/api-spec.yml`):** cabeceras `Set-Cookie` y `Cache-Control` en la respuesta `201` del registro (sin cambiar su cuerpo), endpoint `POST /api/auth/refresh` con sus respuestas y el código de error `INVALID_SESSION`, añadido a la vez a `ErrorCode` y a `ERROR_CODES`. Se regeneran los tipos del frontend.
- **Frontend:** tras el registro, el formulario obtiene la sesión con `refresh`, guarda el access token en memoria, redirige a `/onboarding` y avisa inline si el navegador rechaza las cookies. Contexto de sesión que intenta `refresh` al cargar la aplicación. Página provisional `/onboarding` (mensaje de bienvenida) hasta que exista US04. Textos por i18n.
- **Documentación:** `MODELO_DATOS.md` pasa `refresh_tokens` a «implementado»; se actualizan `CLAUDE.md` y el README.

## Capabilities

### New Capabilities

- `session-management`: emisión, validación y renovación de tokens de sesión (refresh token opaco persistente y revocable en cookie, access JWT de corta vida), `POST /api/auth/refresh`, protección CSRF y sesión en el cliente. Es la base de US02 y US03.

### Modified Capabilities

- `user-registration`: el alta inicia la sesión (cookie en la respuesta `201`), el formulario redirige a Onboarding en lugar de mostrar la confirmación y avisa si las cookies están deshabilitadas.
- `app-configuration`: nueva variable obligatoria `JWT_SECRET` validada al arrancar.
- `frontend-shell`: nueva ruta provisional `/onboarding` y carga inicial de la sesión.

## Impact

- **Backend:** nueva feature `session` en las cuatro capas DDD (puertos `TokenIssuer` y `RefreshTokenRepository`); `RegisterSchool` emite la sesión; `authRouter` añade `/refresh` y la cookie; middleware de comprobación de origen. Nueva dependencia de firma de JWT compatible con AWS Lambda.
- **Base de datos:** una migración Prisma nueva (`refresh_tokens`).
- **API:** `docs/api-spec.yml` y `backend/src/presentation/http/appError.ts` (`appError.test.ts` exige que coincidan); `frontend/src/api/generated/schema.ts` regenerado. Cambio compatible: el `201` solo añade cabeceras.
- **Frontend:** `RegisterPage`, `registrationService`, contexto de sesión, página `/onboarding` y claves i18n.
- **Pruebas e infraestructura:** E2E de Cypress registro → Onboarding, tests de seguridad (CORS, fijación de sesión y CSRF) y variable `JWT_SECRET` en CI, `.env.example` y E2E. El secreto de producción lo gestionará `despliegue-aws`.
- **Referencias:** US01_c (CA1) de `docs/User_Stories_MVP.md`; PRD §3.1.

### Fuera de alcance

Inicio de sesión (US02) y cierre de sesión con revocación del token (US03; aquí solo se crea la columna de revocación y se respeta al validar), rotación de refresh tokens, límite de sesiones simultáneas, limpieza programada de tokens caducados, pantalla real de Onboarding (US04), límite de intentos (US01_d), reCAPTCHA real (US01_e) y resiliencia del formulario (US01_f).
