## ADDED Requirements

### Requirement: Verificación de reCAPTCHA en el registro
`POST /api/auth/register` MUST verificar el `captcha` con la capacidad `captcha-verification` como paso 2 del orden de procesamiento: después del límite de intentos y antes de validar el payload o consultar usuarios o colegios. Si la verificación no se supera, MUST NOT validar el payload, consultar la base de datos de usuarios y colegios ni fijar ninguna cookie. MUST registrar `USER_REGISTER_CAPTCHA_CHALLENGE` (nivel `info`, con el score) cuando pide el reto y `USER_REGISTER_CAPTCHA_FAILED` (nivel `warn`, con el motivo y la versión), los dos con `ip` y `user_agent`, sin el token ni el email. El contrato MUST documentar `503 CAPTCHA_UNAVAILABLE` en el registro y las comprobaciones del `422`.

#### Scenario: Verificación superada
- **WHEN** se envía un registro válido con un captcha que se acepta
- **THEN** el registro continúa y responde `201`

#### Scenario: Reto pedido sin procesar el registro
- **WHEN** el captcha pide el reto v2
- **THEN** responde `422 CAPTCHA_CHALLENGE_REQUIRED` sin validar el payload ni consultar si el email existe
- **AND** se registra `USER_REGISTER_CAPTCHA_CHALLENGE` con el score

#### Scenario: Verificación fallida
- **WHEN** el captcha falla
- **THEN** responde `422 CAPTCHA_FAILED` sin crear nada ni fijar cookie
- **AND** se registra `USER_REGISTER_CAPTCHA_FAILED` con el motivo, sin el token

#### Scenario: Captcha antes que la validación
- **WHEN** se envía un registro con datos inválidos y un captcha que falla
- **THEN** responde `422 CAPTCHA_FAILED`, no `400`

#### Scenario: El límite sigue primero
- **GIVEN** una IP que ha agotado sus intentos
- **WHEN** envía un registro con un captcha que fallaría
- **THEN** responde `429` y el captcha no se verifica

#### Scenario: Contrato documentado
- **WHEN** se consulta `POST /api/auth/register` en `docs/api-spec.yml`
- **THEN** el `503` incluye `CAPTCHA_UNAVAILABLE` y el `422` describe las comprobaciones de score, acción y dominio
- **AND** `frontend/src/api/generated/schema.ts` está al día (`api:types:check` pasa)

### Requirement: Reto v2 en el formulario
Ante `422 CAPTCHA_CHALLENGE_REQUIRED`, el formulario MUST mostrar el reto v2 con un texto que pida confirmar que no se es un robot, MUST conservar todos los datos (contraseña incluida) y MUST mantener deshabilitado el envío hasta resolver el reto. El siguiente envío MUST llevar `{ version: 'v2', token }` con el token del reto. Ante `422 CAPTCHA_FAILED` MUST mostrar «No hemos podido verificar que no eres un robot. Inténtalo de nuevo.» y reiniciar el reto si estaba visible; ante `503 CAPTCHA_UNAVAILABLE`, «La verificación de seguridad no está disponible en este momento. Inténtalo de nuevo en unos minutos.». En los dos casos MUST conservar los datos salvo la contraseña. Los mensajes MUST ser accesibles (`role="alert"`) y venir de i18n.

#### Scenario: Reto y alta
- **GIVEN** un primer envío que recibe `422 CAPTCHA_CHALLENGE_REQUIRED`
- **WHEN** el usuario resuelve el reto y vuelve a enviar
- **THEN** el segundo envío lleva `version` `v2` y el token del reto
- **AND** si el servidor responde `201`, la aplicación navega a `/onboarding`

#### Scenario: Envío bloqueado hasta resolver el reto
- **WHEN** el reto está visible y sin resolver
- **THEN** el botón de envío está deshabilitado y los datos, contraseña incluida, se conservan

#### Scenario: Verificación fallida
- **WHEN** el servidor responde `422 CAPTCHA_FAILED`
- **THEN** se muestra el mensaje de verificación fallida, se reinicia el reto si estaba visible y se borra solo la contraseña

#### Scenario: Verificación no disponible
- **WHEN** el servidor responde `503 CAPTCHA_UNAVAILABLE`, o el script de Google no carga
- **THEN** se muestra el mensaje de indisponibilidad, sin detalles técnicos

### Requirement: Aviso de privacidad de reCAPTCHA
El formulario de registro MUST mostrar, junto al botón de envío, el aviso de que el sitio está protegido por reCAPTCHA y de que se aplican la Política de privacidad y las Condiciones del servicio de Google, con enlaces a ambas que se abren en otra pestaña. El texto MUST venir de i18n.

#### Scenario: Aviso visible
- **WHEN** se abre la página de registro
- **THEN** se muestra el aviso con los enlaces `https://policies.google.com/privacy` y `https://policies.google.com/terms`, con `target="_blank"` y `rel="noopener noreferrer"`

## MODIFIED Requirements

### Requirement: Respuestas del servidor en el formulario
Tras enviar el formulario, el frontend MUST mostrar, según la respuesta: `201`, la obtención de la sesión con `refresh` y la redirección a `/onboarding` (sustituye al mensaje de confirmación de US01_b), con el aviso de cookies deshabilitadas cuando proceda; `409 EMAIL_ALREADY_REGISTERED`, «Este email ya está registrado» con un enlace a la pantalla de login; `409 SCHOOL_ALREADY_REGISTERED`, «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»; `400`, los errores bajo cada campo; `429 TOO_MANY_REQUESTS`, el aviso de demasiados intentos con el tiempo de espera; `422 CAPTCHA_CHALLENGE_REQUIRED`, el reto v2; `422 CAPTCHA_FAILED` y `503 CAPTCHA_UNAVAILABLE`, sus mensajes propios; y cualquier otro error, un mensaje genérico en lenguaje claro sin detalles técnicos.

#### Scenario: Registro correcto
- **WHEN** el servidor responde `201`
- **THEN** la aplicación navega a `/onboarding` con la sesión iniciada y no se muestra la contraseña ni el formulario

#### Scenario: Email ya registrado
- **WHEN** el servidor responde `409` con `EMAIL_ALREADY_REGISTERED`
- **THEN** se muestra «Este email ya está registrado» con un enlace al login

#### Scenario: Colegio ya registrado
- **WHEN** el servidor responde `409` con `SCHOOL_ALREADY_REGISTERED`
- **THEN** se muestra «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»

#### Scenario: Demasiados intentos
- **WHEN** el servidor responde `429` con `TOO_MANY_REQUESTS`
- **THEN** se muestra el aviso de demasiados intentos, no el mensaje genérico

#### Scenario: Respuestas del captcha
- **WHEN** el servidor responde `422 CAPTCHA_CHALLENGE_REQUIRED`, `422 CAPTCHA_FAILED` o `503 CAPTCHA_UNAVAILABLE`
- **THEN** se muestra el reto v2, el mensaje de verificación fallida o el de indisponibilidad, no el mensaje genérico

#### Scenario: Error inesperado
- **WHEN** el servidor responde `500` o no hay conexión
- **THEN** se muestra un mensaje genérico sin códigos ni trazas y el formulario conserva los datos introducidos salvo la contraseña

## REMOVED Requirements

### Requirement: Verificación de captcha provisional
**Reason**: US01_e sustituye el adaptador provisional que aceptaba cualquier token por la verificación real de reCAPTCHA, y el token fijo del formulario por el cliente de captcha.
**Migration**: La verificación pasa a la capacidad `captcha-verification` y al requisito «Verificación de reCAPTCHA en el registro». En desarrollo, tests y E2E, el verificador falso (sin secretos) acepta cualquier token salvo los reservados, así que los registros con un token cualquiera siguen funcionando; los que no envían `captcha` reciben ahora `422 CAPTCHA_FAILED`.
