## Context

US02_b3 dejó la tabla `access_links` completa (con `used_at` aún sin escribir), las invitaciones del lado del administrador, el puerto `AccessLinkRepository`, la regla `accessLinkStatus` y el generador de tokens genérico `SecretTokenGenerator` (SHA-256 del token). Su router `presentation/invitations/invitationsRouter.ts` aplica `requireAuthentication` y `requireRole('ADMIN')` con `router.use`, a todas sus rutas. El enlace que genera, `<APP_ORIGIN>/invitacion#<token>`, abre hoy una página en blanco: CloudFront devuelve el `index.html` de la SPA, pero `App.tsx` no tiene la ruta.

El registro (US01_b) ya resuelve casi todo lo que necesita un alta: las reglas de campo en `registerSchoolRequest.ts` (backend) y `registrationValidation.ts` (frontend), probadas con la tabla `test-fixtures/registration-fields.json`; la unicidad del email por el índice `users_email_key`; el consentimiento (`privacyPolicyAcceptedAt` y `privacyPolicyVersion`); y el `AttemptLimiter` con reserva y liberación (US01_d y el login). Las decisiones de producto de esta porción están en la ficha US02_b4 de `docs/User_Stories_MVP.md` (enriquecida el 2026-10-18).

## Goals / Non-Goals

**Goals:**

- Que un invitado cree su cuenta desde el enlace, con el colegio y el rol de la invitación y sin que el cliente pueda elegirlos.
- Un solo uso garantizado por la base de datos, también con dos envíos simultáneos, y un email duplicado que no consume la invitación.
- Que el token no deje rastro: ni en la URL tras cargar la página, ni en almacenamiento, ni en logs, ni en rutas de peticiones.
- Reutilizar las reglas de campo, el consentimiento y el limitador del registro y el login, sin duplicarlos.

**Non-Goals:**

- Los restablecimientos de contraseña (US02_c) y su página.
- Iniciar sesión al aceptar, avisar al administrador o detectar una sesión abierta en el navegador.
- Cambiar la `Referrer-Policy` global de CloudFront.

## Decisions

### D1. Un router público propio, montado antes del protegido

`presentation/invitations/publicInvitationsRouter.ts` define `POST /lookup` y `POST /accept` y se monta en `app.ts` con `api.use('/invitations', publicInvitationsRouter(...))` **antes** de `api.use('/invitations', invitationsRouter(...))`. Express recorre los dos routers en orden: una petición a `/lookup` o `/accept` la responde el público y nunca llega al `router.use` de las guardas; las demás rutas siguen al protegido como hasta ahora. Un test de router comprueba que `/lookup` responde sin `Authorization` y que `GET /api/invitations` sigue exigiéndolo.

No usa `requireAllowedOrigin`: no hay cookies ni sesión, así que no hay CSRF que proteger, como en el registro.

*Alternativas descartadas:* meter las rutas en el router protegido y aplicar las guardas ruta a ruta (cambia b3 y es fácil olvidar una guarda en una ruta futura); una raíz genérica `/api/access-links/...` (US02_c tendrá cuerpos distintos y el contrato queda más claro con una operación por propósito).

### D2. Orden de las comprobaciones y comprobación previa del enlace fuera de la transacción

`AcceptInvitation.execute({ body, requestContext })` sigue este orden, que fijan los tests:

1. **Límite de intentos:** `consume` de la clave `invitation:<ip>` (`429` si está agotada).
2. **Enlace:** el token se lee del cuerpo (una cadena no vacía; si falta o no lo es, `410`), se calcula su hash con `SecretTokenGenerator.hash` y `findPendingInvitation(hash, now)` devuelve `null` (`410`) o la invitación.
3. **Campos:** `parseAcceptInvitationRequest(body)` (`400`).
4. **Hash de la contraseña** con `PasswordHasher`, fuera de cualquier transacción.
5. **Alta atómica** (D3).
6. **Liberación del intento:** con éxito, con `400` y con `409` se llama a `release`, de modo que solo cuentan los `410`; con un `410` no se libera.

La comprobación previa (paso 2) evita el coste de Bcrypt (coste 12) para un token falso y que alguien sin enlace válido reciba `400` o `409`. La comprobación definitiva va dentro de la transacción del paso 5: entre los dos pasos la invitación puede caducar, revocarse o usarse.

`LookupInvitation` aplica los pasos 1 y 2 con la misma política: libera el intento si encuentra la invitación.

*Alternativa descartada:* validar los campos primero. Es más cómodo para el formulario, pero deja preguntar por emails sin un enlace válido y obliga a calcular el hash de cualquier petición.

### D3. Alta atómica con un `UPDATE` condicionado y el `INSERT` en la misma transacción

`PrismaAccessLinkRepository.acceptInvitation({ tokenHash, now, newUser })` ejecuta un `$transaction` interactivo:

1. `accessLink.updateMany({ where: { tokenHash, purpose: 'INVITATION', usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })`. Si `count` es 0, devuelve `null` (el caso de uso lanza `AccessLinkInvalid`).
2. Lee de la fila actualizada `schoolId` y `role` (un `findUniqueOrThrow` por `tokenHash` con `select`).
3. `user.create` con el colegio y el rol de la invitación, `status: ACTIVE`, la contraseña hasheada, los campos normalizados y el consentimiento.
4. Si el `create` viola `users_email_key` (el nombre del índice, como en `PrismaRegistrationRepository`), lanza `EmailAlreadyRegistered`: la transacción se deshace y `used_at` vuelve a ser nulo.

Con `READ COMMITTED`, si dos aceptaciones llegan a la vez, la segunda espera el bloqueo de fila del `UPDATE` de la primera y, tras su commit, vuelve a evaluar el `WHERE` y actualiza 0 filas. Por eso no hace falta `FOR UPDATE` ni bloquear `schools` (un alta no puede dejar el colegio sin administradores, que es lo que protege el bloqueo de US02_b2). Es la misma técnica que la revocación de US02_b3, y es compatible con el pooler en modo transacción.

`findPendingInvitation(tokenHash, now)` es un `findFirst` con la misma regla de pendiente y un `select` de `school: { select: { name } }` y `role`. Nunca devuelve el hash ni el id.

*Alternativas descartadas:* crear primero el usuario y marcar después (un fallo entre medias dejaría una invitación reutilizable); `SELECT … FOR UPDATE` explícito (innecesario con el `UPDATE` condicionado); `SERIALIZABLE` (exige reintentos).

### D4. Reglas de campo compartidas con el registro

`registerSchoolRequest.ts` exporta sus esquemas de campo a un módulo común, `application/registration/userFields.ts` (`USER_FIELD_SCHEMAS` con `firstName`, `lastName`, `email`, `password` y `privacyPolicyAccepted`, y una función `parseFields(body, schemas)` que devuelve los datos o los `{ field, code }`). `parseRegisterSchoolRequest` y el nuevo `parseAcceptInvitationRequest` la usan; el primero suma `schoolName` y `municipalityCode`. Los tests de `registration-fields.json` siguen pasando sin cambios y un test nuevo recorre las filas de los campos de usuario con el parser de la aceptación.

En el frontend, `registrationValidation.ts` expone la validación por campo que ya tiene y la página de aceptación la llama con su lista de campos (`firstName`, `lastName`, `email`, `password`, `privacyPolicyAccepted`).

El consentimiento se guarda como en el registro: `privacyPolicyAcceptedAt = now` y `privacyPolicyVersion = PRIVACY_POLICY_VERSION`.

*Alternativa descartada:* copiar las reglas en el parser nuevo. Dos copias que divergen al cambiar una regla, justo lo que evita la tabla compartida.

### D5. Límite de intentos propio, que solo cuenta los enlaces no válidos

`LimitInvitationAttempts` (o un `AttemptLimiter` configurado en `composeApp`) usa la clave `invitation:<ip>`, la ventana de 15 minutos del login y el máximo `config.invitationAttemptsMax` (`INVITATION_ATTEMPTS_MAX`, por defecto 10). Reserva y libera como el login (D2). `realApp` y `scripts/e2e.mjs` lo fijan a 1000. El `429` y el `Retry-After` los da `errorHandler` con `TooManyAttempts`, como hasta ahora.

*Alternativa descartada:* limitar solo la aceptación. La consulta es el oráculo de la fuerza bruta («válido o no» sin consumir nada).

### D6. Errores: `AccessLinkInvalid` → `410 ACCESS_LINK_INVALID`

`domain/accessLink/accessLinkErrors.ts` suma `AccessLinkInvalid`; `errorHandler` lo traduce a `410` con `ACCESS_LINK_INVALID`, que se añade a la vez a `ERROR_CODES` y al enum `ErrorCode` del contrato. Lleva una causa (`reason`) solo para el log, nunca para la respuesta. `EmailAlreadyRegistered` se reutiliza del registro (`409`).

### D7. Frontend: `AcceptInvitationPage` pública y el aviso en `LoginPage`

- **Ruta:** `/invitacion` en `App.tsx`, entre las públicas, fuera de `AuthenticatedLayout`.
- **Token:** al montar, la página lee `window.location.hash`, lo quita con `history.replaceState(null, '', location.pathname)` y lo guarda en una `ref`. Nunca en estado persistente, almacenamiento ni la URL. Sin token, va directamente a la vista de enlace no válido sin llamar al servidor.
- **Consulta:** una vez, aunque `StrictMode` ejecute el efecto dos veces (el patrón de `UsersPage`: `ref` del intento pedido y `ref` de montado). Reintentable tras un `503`.
- **Servicio:** `services/invitationAcceptanceService.ts` usa `fetch` con `credentials: 'same-origin'` (no hay cookies que enviar, pero es el valor de los demás servicios públicos) e interpreta por `error.code`, como `registrationService`. Los resultados: `found`, `accepted`, `invalid`, `emailAlreadyRegistered`, `validationError` (con los `details`), `tooManyAttempts` (con los minutos de `retryAfterMinutes`) y `unavailable`. Nunca lanza.
- **Formulario:** controlado, con la validación por campo del registro y la casilla de privacidad (enlace a `/privacidad`). Guarda síncrona `isSubmittingRef`. Un `409` marca el campo email y conserva el resto.
- **Después del `201`:** `navigate('/login', { replace: true, state: { accountCreated: true, email } })`. `LoginPage` lee `location.state` al montar: si trae `accountCreated`, muestra el aviso en un `role="status"` y rellena el email (el valor inicial del estado del formulario). El `state` de la navegación no se guarda en ningún almacenamiento y se pierde al recargar, que es lo esperado.

*Alternativa descartada:* reutilizar `RegisterPage` con un modo «invitación». Tiene el captcha, el borrador en `sessionStorage` y los campos del colegio; separarlos es más complejo que una página propia que reutiliza las validaciones.

### D8. `Referrer-Policy`: se mantiene la global

La historia madre pedía `no-referrer` para la página del enlace. El fragmento no viaja nunca en `Referer` en ningún navegador, y con `strict-origin-when-cross-origin` una petición a otro origen solo envía el origen. El riesgo real, que el token quede en el historial o en una captura de la barra de direcciones, se cubre con `replaceState` (D7). Una política propia para `/invitacion` exigiría otro comportamiento de CloudFront con su propia `ResponseHeadersPolicy`, y la página no carga recursos de terceros. Queda como decisión de producto en la ficha de US02_b4.

## Risks / Trade-offs

- **[Riesgo] Una aceptación concurrente o una revocación entre la comprobación previa y la transacción.** → Mitigación: la transacción vuelve a comprobar la regla en el `UPDATE` (D3); el test de integración de dos `accept` simultáneos lo prueba.
- **[Riesgo] Extraer los esquemas del registro rompe el registro.** → Mitigación: tarea propia de refactor, con la suite del registro (y la tabla compartida) en verde antes de seguir.
- **[Riesgo] Un enlace reenviado a quien no debe crea una cuenta en el colegio.** → Mitigación: uso único, 72 h, revocación y la lista de usuarios, donde el administrador ve quién se unió y puede darlo de baja.
- **[Riesgo] Enumeración de emails con un enlace válido.** → Mitigación: el mismo riesgo aceptado del registro; el límite de intentos no la frena (el `409` no cuenta) para no bloquear a quien se equivoca de email.
- **[Contrapartida] Con una sesión abierta, el aviso de «cuenta creada» no se ve:** `/login` redirige a `/onboarding`. Aceptado; la cuenta se crea igualmente.
- **[Contrapartida] Sin captcha:** un bot con un enlace válido puede crear una sola cuenta (uso único); sin enlace, el límite de intentos lo frena.

## Migration Plan

Sin migración de base de datos ni cambios de infraestructura: `/invitacion` ya se sirve con el `index.html` y `/api/*` llega al backend. La variable `INVITATION_ATTEMPTS_MAX` es opcional (por defecto 10), así que no hace falta añadirla a SSM. Para volver atrás basta con desplegar el SHA anterior; las cuentas creadas con invitaciones son usuarios normales y siguen funcionando.

## Open Questions

Ninguna. Las decisiones de producto se cerraron en la exploración y el enriquecimiento del 2026-10-18.
