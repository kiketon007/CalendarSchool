## ADDED Requirements

### Requirement: Sesión iniciada al registrar
`POST /api/auth/register` MUST iniciar la sesión del usuario recién creado en la misma operación fijando, en la respuesta `201`, la cookie `refresh_token` con las propiedades de la capacidad `session-management`. El cuerpo del `201` MUST NOT cambiar respecto a US01_b ni incluir un access token: el cliente lo obtiene con `POST /api/auth/refresh`. El refresh token MUST crearse en la misma transacción que el colegio y el usuario: si falla cualquier inserción, no existe ninguno de los tres. Las respuestas de error del registro MUST NOT fijar ninguna cookie. `docs/api-spec.yml` MUST documentar las cabeceras `Set-Cookie` y `Cache-Control` de la respuesta `201`.

#### Scenario: Registro con sesión
- **WHEN** se envía un registro válido
- **THEN** responde `201` con el usuario y el colegio, sin access token en el cuerpo
- **AND** la respuesta incluye `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=86400`
- **AND** existe una fila en `refresh_tokens` para el usuario creado

#### Scenario: Sesión utilizable
- **GIVEN** la cookie recibida en un registro correcto
- **WHEN** se envía `POST /api/auth/refresh` con esa cookie y el origen permitido
- **THEN** responde `200` con el mismo usuario y su colegio
- **AND** el access token verifica y su `sub` es el id del usuario creado y su `schoolId` el del colegio creado

#### Scenario: Sin credenciales en la respuesta
- **WHEN** se envía un registro válido
- **THEN** el cuerpo no contiene la contraseña, su hash, el refresh token ni su hash

#### Scenario: Fallo al guardar la sesión
- **WHEN** falla la inserción del refresh token después de insertar el colegio y el usuario
- **THEN** la transacción se revierte y no existe ni el colegio, ni el usuario, ni el refresh token
- **AND** responde con el error común correspondiente, sin detalles técnicos y sin cookie

#### Scenario: Errores sin cookie
- **WHEN** el registro responde `400`, `409`, `422` o `503`
- **THEN** la respuesta no incluye `Set-Cookie`
- **AND** no se crea ninguna fila en `refresh_tokens`

#### Scenario: Contrato documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se valida como OpenAPI 3.1
- **THEN** la respuesta `201` de `POST /api/auth/register` describe las cabeceras `Set-Cookie` y `Cache-Control` y su cuerpo no cambia
- **AND** `frontend/src/api/generated/schema.ts` está al día (`api:types:check` pasa)

### Requirement: Redirección a Onboarding tras el registro
Tras un `201`, el frontend MUST obtener la sesión con `POST /api/auth/refresh`, guardarla en memoria y navegar a `/onboarding`, sin pedir al usuario que inicie sesión. Hasta que exista US04, `/onboarding` MUST ser una página provisional que da la bienvenida con el nombre del usuario y del colegio, con un `data-testid` estable. Si no hay sesión autenticada, `/onboarding` MUST redirigir a `/registro`. Mientras se resuelve la sesión MUST mostrar un indicador de carga accesible.

#### Scenario: Registro y redirección
- **WHEN** el usuario completa un registro válido y el servidor responde `201`
- **THEN** la aplicación navega a `/onboarding` y muestra la bienvenida con el nombre del usuario y del colegio
- **AND** no se muestra el formulario ni ningún mensaje de confirmación intermedio

#### Scenario: Recarga en Onboarding
- **GIVEN** un usuario en `/onboarding` con la cookie vigente
- **WHEN** recarga la página
- **THEN** sigue en `/onboarding` con la sesión recuperada por `refresh`

#### Scenario: Acceso sin sesión
- **WHEN** un visitante sin sesión abre `/onboarding`
- **THEN** es redirigido a `/registro`

#### Scenario: Indicador de carga
- **WHEN** la sesión aún se está resolviendo al abrir `/onboarding`
- **THEN** se muestra un indicador con `role="status"` y no se redirige hasta tener la respuesta

#### Scenario: E2E del flujo completo
- **WHEN** se ejecuta Cypress con un registro de datos únicos
- **THEN** el flujo Registro → `/onboarding` pasa, la cookie `refresh_token` existe como `httpOnly`, `secure` y `sameSite=lax`, y no es legible desde `document.cookie`

### Requirement: Aviso de cookies deshabilitadas
La llamada a `POST /api/auth/refresh` que sigue a un `201` MUST servir también para comprobar que el navegador aceptó la cookie. Si responde `401 INVALID_SESSION`, MUST mostrar en la propia página de registro, en lugar del formulario, un mensaje en lenguaje claro que indique que la cuenta se ha creado y que se necesitan cookies para mantener la sesión, y MUST NOT redirigir a Onboarding ni ofrecer de nuevo el formulario: reenviarlo daría un `409` porque la cuenta ya existe. Si la comprobación falla por otra causa (sin conexión o `5xx`), MUST mostrar un mensaje distinto que indique que la cuenta se ha creado pero no se ha podido iniciar la sesión, con las mismas garantías. Ambos mensajes MUST ser accesibles (`role="alert"`) y venir de i18n, y el botón de envío MUST permanecer deshabilitado hasta tener la sesión.

#### Scenario: Cookies bloqueadas
- **GIVEN** un navegador que rechaza la cookie
- **WHEN** el registro responde `201` y la sonda de `refresh` devuelve `401 INVALID_SESSION`
- **THEN** se muestra «Tu cuenta se ha creado, pero tu navegador no acepta cookies. Actívalas para mantener la sesión iniciada.» con `role="alert"`
- **AND** no se navega a `/onboarding`
- **AND** el formulario no vuelve a ofrecerse y la contraseña no queda en memoria

#### Scenario: Cookies aceptadas
- **WHEN** la sonda de `refresh` responde `200`
- **THEN** no se muestra ningún aviso y se navega a `/onboarding`
- **AND** hasta entonces el botón de envío sigue deshabilitado

#### Scenario: Fallo de red en la sonda
- **WHEN** la sonda falla por falta de conexión o por un `5xx`
- **THEN** se muestra «Tu cuenta se ha creado, pero no hemos podido iniciar la sesión. Inténtalo de nuevo más tarde.» con `role="alert"`, sin detalles técnicos y sin el aviso de cookies
- **AND** no se navega a `/onboarding` ni se vuelve a ofrecer el formulario

#### Scenario: Textos traducidos
- **WHEN** se ejecutan los tests del frontend
- **THEN** el aviso existe en `es.json` y en `en.json` con las mismas claves

## MODIFIED Requirements

### Requirement: Respuestas del servidor en el formulario
Tras enviar el formulario, el frontend MUST mostrar, según la respuesta: `201`, la obtención de la sesión con `refresh` y la redirección a `/onboarding` (sustituye al mensaje de confirmación de US01_b), con el aviso de cookies deshabilitadas cuando proceda; `409 EMAIL_ALREADY_REGISTERED`, «Este email ya está registrado» con un enlace a la pantalla de login; `409 SCHOOL_ALREADY_REGISTERED`, «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»; `400`, los errores bajo cada campo; y cualquier otro error, un mensaje genérico en lenguaje claro sin detalles técnicos.

#### Scenario: Registro correcto
- **WHEN** el servidor responde `201`
- **THEN** la aplicación navega a `/onboarding` con la sesión iniciada y no se muestra la contraseña ni el formulario

#### Scenario: Email ya registrado
- **WHEN** el servidor responde `409` con `EMAIL_ALREADY_REGISTERED`
- **THEN** se muestra «Este email ya está registrado» con un enlace al login

#### Scenario: Colegio ya registrado
- **WHEN** el servidor responde `409` con `SCHOOL_ALREADY_REGISTERED`
- **THEN** se muestra «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»

#### Scenario: Error inesperado
- **WHEN** el servidor responde `500` o no hay conexión
- **THEN** se muestra un mensaje genérico sin códigos ni trazas y el formulario conserva los datos introducidos salvo la contraseña
