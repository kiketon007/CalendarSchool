## Why

Desde US02_b3 un administrador genera enlaces de invitación, pero nadie puede usarlos: `/invitacion` no existe y el enlace abre una página en blanco. US02_b (invitar y gestionar usuarios, PRD §3.1, roles `ADMIN` y `MEMBER`) resuelve la incorporación de otras personas al colegio con esos enlaces, y esta cuarta y última porción, **US02_b4** (`docs/User_Stories_MVP.md`, enriquecida el 2026-10-18), cubre el lado del invitado: abrir el enlace, ver a qué colegio y con qué rol le invitan y crear su cuenta. Cierra el hueco aceptado en US02_b3.

## What Changes

- **Dos endpoints públicos nuevos** (sin `Authorization` ni cookies), definidos primero en `docs/api-spec.yml`:
  - `POST /api/invitations/lookup` con `{ token }`: devuelve el nombre del colegio y el rol de una invitación pendiente, sin escribir nada (abrir el enlace no lo consume).
  - `POST /api/invitations/accept` con `{ token, firstName, lastName, email, password, privacyPolicyAccepted }`: crea el usuario `ACTIVE` en el colegio y con el rol de la invitación y marca la invitación como usada, en una única transacción. Responde `201` con el usuario y el colegio, sin crear sesión.
- **Código de error nuevo `ACCESS_LINK_INVALID` (`410`)**: un enlace caducado, usado, revocado, inexistente o que no es una invitación, sin distinguir el caso. Un email ya registrado responde `409 EMAIL_ALREADY_REGISTERED` y no consume la invitación.
- **Orden fijo de las comprobaciones:** límite de intentos → enlace → campos → hash de la contraseña → alta. Así un email solo se puede sondear con un enlace válido.
- **Las reglas de campo y el consentimiento de privacidad del registro** se reutilizan: el invitado acepta la política al crear su cuenta y se guardan la fecha y la versión.
- **Límite de intentos nuevo** (`invitation:<ip>`, por defecto 10 enlaces no válidos cada 15 minutos, `INVITATION_ATTEMPTS_MAX`), compartido por la consulta y la aceptación. Sin captcha: la página no carga recursos de terceros.
- **Página pública `/invitacion`**: lee el token del fragmento y lo borra de la URL, muestra el colegio y el rol, el formulario con las reglas del registro y la vista de enlace no válido; tras crear la cuenta lleva a `/login`, que muestra «Tu cuenta se ha creado» con el email ya escrito.
- **Eventos de log** `INVITATION_ACCEPTED` e `INVITATION_ACCEPT_REJECTED`; nunca el token, su hash ni la contraseña.
- **Cambio sobre la historia madre:** se mantiene la `Referrer-Policy` global de CloudFront en lugar de una `no-referrer` propia para `/invitacion`; el borrado del token de la URL cubre el riesgo real (decisión de US02_b4).

### Fuera de alcance

- Restablecer la contraseña (US02_c, que reutilizará el patrón con `/restablecer`) y la `Referrer-Policy` de su página.
- Iniciar sesión automáticamente tras aceptar, avisar al administrador de que alguien aceptó, reenviar o recuperar enlaces y el envío de correos.
- Detectar una sesión abierta en el navegador al aceptar: la página la ignora y se acepta que no se vea el mensaje de «cuenta creada».

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-invitations`: añade la consulta y la aceptación públicas de una invitación (alta atómica, aceptaciones simultáneas, email ya registrado, orden de las comprobaciones, límite de intentos y eventos) y la página `/invitacion`, y el E2E del recorrido completo.
- `api-error-handling`: código nuevo `ACCESS_LINK_INVALID` (`410`), alineado entre el contrato y `ERROR_CODES`.
- `app-configuration`: variable opcional nueva `INVITATION_ATTEMPTS_MAX`.
- `test-infrastructure`: el backend de E2E arranca también con `INVITATION_ATTEMPTS_MAX` alto.
- `user-login`: la página de inicio de sesión muestra el aviso de cuenta creada y rellena el email cuando llega desde la aceptación de una invitación.

## Impact

- **Contrato:** `docs/api-spec.yml` añade las dos rutas públicas, `InvitationLookupRequest`, `InvitationLookupResponse`, `AcceptInvitationRequest`, `InvitationAcceptedResponse`, la respuesta `AccessLinkInvalid` y el código `ACCESS_LINK_INVALID`. Tipos regenerados en `frontend/src/api/generated/schema.ts`.
- **Modelo de datos:** sin migración. `access_links.used_at` se escribe por primera vez y los invitados rellenan las columnas de consentimiento de `users`. `MODELO_DATOS.md` lo refleja.
- **Backend:** `domain/accessLink/` (error `AccessLinkInvalid` y dos métodos del puerto), `application/invitations/` (`LookupInvitation`, `AcceptInvitation`, validación y límite de intentos), las reglas de usuario del registro extraídas para reutilizarlas, `PrismaAccessLinkRepository`, `config.ts`, un router público en `presentation/invitations/` montado antes del protegido, `errorHandler.ts`, `appError.ts`, `composeApp`, `AppDependencies` y los dobles de test.
- **Frontend:** `services/invitationAcceptanceService.ts`, `pages/AcceptInvitationPage.tsx`, la ruta pública en `App.tsx`, `pages/LoginPage.tsx`, la validación del registro reutilizada y textos en `es.json` y `en.json`.
- **E2E:** spec nueva del recorrido completo, `csp.cy.ts` con `/invitacion` y `scripts/e2e.mjs` con `INVITATION_ATTEMPTS_MAX=1000`.
- **Infraestructura:** ninguna; `/invitacion` ya se sirve con el `index.html` de la SPA y `/api/*` llega al backend.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md`, `README.md`, `MODELO_DATOS.md` y, si añaden una regla nueva, `docs/backend-standards.md` y `docs/frontend-standards.md`.
