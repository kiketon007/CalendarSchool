# user-login Specification

## Purpose
Define el inicio de sesión (`POST /api/auth/login`, US02): su contrato en `docs/api-spec.yml`, el orden de procesamiento (origen, validación, límite de intentos, captcha, credenciales, estado de la cuenta, sesión), la respuesta uniforme y de coste constante ante credenciales inválidas, la cuenta suspendida, el límite de 10 intentos fallidos por IP cada 15 minutos (reserva y liberación del intento), reCAPTCHA v3 con reto v2 (acción `login`), la sesión por cookie sin guardar IP ni user agent, los eventos de log sin datos sensibles, la página `/login` con sus redirecciones desde y hacia `/onboarding` y las pruebas E2E. Origen: cambio `inicio-sesion` (US02).
## Requirements
### Requirement: Contrato del login documentado en OpenAPI
`docs/api-spec.yml` MUST describir `POST /api/auth/login` antes de implementarlo: cuerpo `{ email, password, captcha }` (`captcha` con la forma `{ version: 'v3' | 'v2', token }` del registro), respuesta `204` sin cuerpo con la cabecera `Set-Cookie` de `refresh_token`, y las respuestas de error `400`, `401`, `403`, `422`, `429` y `503` en el formato común, reutilizando `components.responses` donde existan. `INVALID_CREDENTIALS` y `ACCOUNT_SUSPENDED` MUST añadirse a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES`, y los tipos del frontend MUST regenerarse.

#### Scenario: Operación documentada
- **WHEN** se lee `docs/api-spec.yml`
- **THEN** `POST /api/auth/login` documenta el cuerpo, el `204` con `Set-Cookie` y las respuestas `400`, `401 INVALID_CREDENTIALS`, `403` (`ORIGIN_NOT_ALLOWED` y `ACCOUNT_SUSPENDED`), `422` (`CAPTCHA_CHALLENGE_REQUIRED` y `CAPTCHA_FAILED`), `429` con `Retry-After` y `503` (`DATABASE_UNAVAILABLE` y `CAPTCHA_UNAVAILABLE`)

#### Scenario: Códigos sincronizados
- **WHEN** se ejecutan los tests del backend y `npm run api:types:check -w frontend`
- **THEN** `INVALID_CREDENTIALS` y `ACCOUNT_SUSPENDED` figuran en el contrato y en `ERROR_CODES`, `appError.test.ts` pasa y los tipos generados están al día

### Requirement: Orden de procesamiento del login
`POST /api/auth/login` MUST procesar cada petición en este orden y detenerse en el primer paso que falle: (1) `Origin` igual al de `APP_ORIGIN`; (2) validación del cuerpo; (3) límite de intentos por IP; (4) verificación de reCAPTCHA; (5) búsqueda del usuario y comparación de la contraseña; (6) estado de la cuenta; (7) creación de la sesión. Ningún paso MUST consultar la tabla de usuarios antes del paso 5.

#### Scenario: Origen no permitido
- **GIVEN** una petición de login con un `Origin` distinto del de `APP_ORIGIN`, o sin `Origin`
- **WHEN** llega al backend
- **THEN** responde `403 ORIGIN_NOT_ALLOWED` sin validar el cuerpo, contar un intento, verificar el captcha ni consultar la base de datos

#### Scenario: Límite antes que captcha y credenciales
- **GIVEN** una IP que ha agotado sus intentos de login
- **WHEN** envía un login con un captcha válido y la contraseña correcta
- **THEN** responde `429` sin llamar a Google ni consultar la tabla de usuarios

#### Scenario: Captcha antes que credenciales
- **GIVEN** un login con un captcha que el verificador rechaza
- **WHEN** llega al backend
- **THEN** responde `422 CAPTCHA_FAILED` sin consultar la tabla de usuarios ni comparar la contraseña

### Requirement: Validación de la petición de login
El backend MUST recortar el email y pasarlo a minúsculas, y validarlo con el mismo formato y la misma longitud máxima que el registro (la regla de `test-fixtures/registration-fields.json`). La contraseña MUST ser una cadena no vacía de 72 bytes como máximo en UTF-8, sin las reglas de variedad del registro. Una petición inválida MUST responder `400 VALIDATION_ERROR` con el código de cada campo (`REQUIRED`, `INVALID_FORMAT` o `INVALID_LENGTH`) y MUST NOT contar como intento ni llegar al captcha.

#### Scenario: Email normalizado
- **GIVEN** un usuario `ACTIVE` con el email `juan@colegio.es`
- **WHEN** inicia sesión con `  JUAN@COLEGIO.ES  ` y su contraseña
- **THEN** el login es correcto

#### Scenario: Campos vacíos o con formato inválido
- **WHEN** se envía un login sin email, con un email sin `@` o con la contraseña vacía
- **THEN** responde `400 VALIDATION_ERROR` con el código del campo
- **AND** no se guarda ningún intento en `rate_limit_attempts`

#### Scenario: Contraseña de más de 72 bytes
- **WHEN** se envía una contraseña de 73 bytes
- **THEN** responde `400 VALIDATION_ERROR` con `INVALID_LENGTH` para `password`

#### Scenario: Contraseña antigua sin la variedad actual
- **GIVEN** un usuario cuya contraseña correcta no tiene símbolos
- **WHEN** inicia sesión con ella
- **THEN** la validación no la rechaza y el login es correcto

### Requirement: Credenciales incorrectas con respuesta y coste uniformes
Si el email no corresponde a ningún usuario, si la contraseña no coincide o si el usuario está `DELETED`, el backend MUST responder `401 INVALID_CREDENTIALS`, idéntico en código, cuerpo y cabeceras en los tres casos. Si el email no existe, MUST comparar la contraseña recibida con un hash Bcrypt ficticio generado con el mismo coste que los reales, para que el trabajo de la respuesta no dependa de que el email exista. MUST NOT añadirse esperas artificiales.

#### Scenario: Contraseña incorrecta
- **GIVEN** un usuario `ACTIVE`
- **WHEN** inicia sesión con una contraseña incorrecta
- **THEN** responde `401 INVALID_CREDENTIALS` y no se crea ninguna sesión

#### Scenario: Email no registrado
- **WHEN** se inicia sesión con un email que no está registrado
- **THEN** responde exactamente lo mismo que con una contraseña incorrecta
- **AND** se ha hecho una comparación de Bcrypt contra el hash ficticio

#### Scenario: Usuario eliminado
- **GIVEN** un usuario `DELETED`
- **WHEN** inicia sesión con su contraseña correcta
- **THEN** responde `401 INVALID_CREDENTIALS`

### Requirement: Estado de la cuenta
Solo un usuario `ACTIVE` MUST poder iniciar sesión. El estado MUST comprobarse después de la contraseña: un usuario `SUSPENDED` con la contraseña correcta MUST recibir `403 ACCOUNT_SUSPENDED` sin que se cree ninguna sesión, y con una contraseña incorrecta MUST recibir el `401 INVALID_CREDENTIALS` genérico.

#### Scenario: Cuenta suspendida con la contraseña correcta
- **GIVEN** un usuario `SUSPENDED`
- **WHEN** inicia sesión con su contraseña correcta
- **THEN** responde `403 ACCOUNT_SUSPENDED` y no se crea ninguna fila en `refresh_tokens`

#### Scenario: Cuenta suspendida con la contraseña incorrecta
- **GIVEN** un usuario `SUSPENDED`
- **WHEN** inicia sesión con una contraseña incorrecta
- **THEN** responde `401 INVALID_CREDENTIALS`

### Requirement: Sesión creada al iniciar sesión
Un login correcto MUST crear un refresh token nuevo (capacidad `session-management`), sin guardar la IP ni el user agent de la petición, y MUST responder `204` sin cuerpo con la cookie `refresh_token` con las mismas propiedades que tras el registro. MUST NOT devolver un access token: el frontend lo obtiene con `POST /api/auth/refresh`. Una cookie `refresh_token` recibida con el login MUST ignorarse y sustituirse, sin revocarla. Las sesiones existentes del usuario MUST seguir siendo válidas.

#### Scenario: Login correcto
- **GIVEN** un usuario `ACTIVE`
- **WHEN** inicia sesión con su email y su contraseña
- **THEN** responde `204` con `Set-Cookie` de `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`, 24 horas)
- **AND** `POST /api/auth/refresh` con esa cookie devuelve el access token y el usuario

#### Scenario: Fijación de sesión
- **GIVEN** una petición de login que lleva una cookie `refresh_token` existente
- **WHEN** el login es correcto
- **THEN** la cookie de la respuesta contiene un token distinto, creado por el servidor

#### Scenario: Varias sesiones
- **GIVEN** un usuario con una sesión abierta
- **WHEN** inicia sesión desde otro navegador
- **THEN** las dos sesiones renuevan su access token con `refresh`

### Requirement: Límite de intentos fallidos de login
El login MUST usar el limitador de intentos con la clave `login:<ip>` y la política de `LOGIN_ATTEMPTS_MAX` intentos (10 por defecto) cada 15 minutos. El intento MUST reservarse en el paso 3 y MUST liberarse solo cuando la contraseña es correcta (cuenta `ACTIVE` o `SUSPENDED`); cualquier otro final (captcha rechazado o con reto, credenciales incorrectas) lo deja contado. Si la liberación falla, el login MUST continuar y el fallo MUST registrarse en el log. Al superarse el máximo, MUST responder `429 TOO_MANY_REQUESTS` con `Retry-After`.

#### Scenario: Solo cuentan los fallidos
- **GIVEN** `LOGIN_ATTEMPTS_MAX` igual a 10
- **WHEN** se hacen 12 logins correctos seguidos desde la misma IP
- **THEN** todos responden `204` y no queda ningún intento de esa IP en `rate_limit_attempts`

#### Scenario: Máximo de fallidos
- **GIVEN** 10 logins fallidos desde una IP en los últimos 15 minutos
- **WHEN** esa IP envía otro login, aunque sea correcto
- **THEN** responde `429 TOO_MANY_REQUESTS` con `Retry-After`

#### Scenario: Fallos simultáneos
- **GIVEN** `LOGIN_ATTEMPTS_MAX` igual a 10
- **WHEN** llegan 20 logins simultáneos con contraseña incorrecta desde la misma IP
- **THEN** como mucho 10 llegan a comparar la contraseña y el resto recibe `429`

#### Scenario: Cuenta suspendida no cuenta
- **WHEN** un usuario `SUSPENDED` inicia sesión con su contraseña correcta
- **THEN** su intento no queda en `rate_limit_attempts`

#### Scenario: Fallo al liberar
- **GIVEN** la base de datos falla al borrar el intento reservado
- **WHEN** el login es correcto
- **THEN** responde `204`, se registra el fallo y el intento queda contado

### Requirement: reCAPTCHA en el login
El login MUST verificar `captcha` con el mismo verificador que el registro y con la acción `login` (capacidad `captcha-verification`): score bajo → `422 CAPTCHA_CHALLENGE_REQUIRED`; token ausente, inválido o con otra acción → `422 CAPTCHA_FAILED`; Google no disponible → `503 CAPTCHA_UNAVAILABLE` (falla cerrado). En ningún caso MUST compararse la contraseña.

#### Scenario: Reto pedido
- **GIVEN** el verificador falso
- **WHEN** se envía un login con `captcha: { version: 'v3', token: 'fake-low-score' }`
- **THEN** responde `422 CAPTCHA_CHALLENGE_REQUIRED` y el intento queda contado

#### Scenario: Reto superado
- **GIVEN** un login que recibió `422 CAPTCHA_CHALLENGE_REQUIRED`
- **WHEN** se reenvía con un token `v2` válido y la contraseña correcta
- **THEN** responde `204`

#### Scenario: Token de registro en el login
- **GIVEN** Google responde éxito con la acción `register`
- **WHEN** se verifica el captcha de un login
- **THEN** responde `422 CAPTCHA_FAILED`

#### Scenario: Google no disponible
- **WHEN** el verificador lanza `CaptchaUnavailable` durante un login
- **THEN** responde `503 CAPTCHA_UNAVAILABLE` y no se crea ninguna sesión

### Requirement: Registro de eventos del login sin datos sensibles
El login MUST registrar `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED` (con `reason` `PASSWORD`, `NOT_FOUND` o `SUSPENDED`; `DELETED` se registra como `NOT_FOUND`) y `USER_LOGIN_RATE_LIMITED`, y del captcha `USER_LOGIN_CAPTCHA_CHALLENGE` (`info`, con el score) cuando se pide el reto v2 y `USER_LOGIN_CAPTCHA_FAILED` (`warn`, con el motivo y la versión) cuando la verificación falla. Si no se puede liberar un intento tras una contraseña correcta, MUST registrar `LOGIN_ATTEMPT_RELEASE_FAILED` (`warn`). Todos llevan el email enmascarado (regla común de US01_b), la IP y el user agent. La indisponibilidad de Google no se registra aquí: la registra el manejador central de errores con su causa. Los logs MUST NOT contener la contraseña, el token de captcha, el refresh token ni la cookie.

#### Scenario: Login fallido registrado
- **WHEN** un login falla por contraseña incorrecta
- **THEN** se registra `USER_LOGIN_FAILED` con `reason` `PASSWORD`, el email enmascarado, la IP y el user agent

#### Scenario: Reto del captcha registrado
- **WHEN** el verificador pide el reto v2 en un login
- **THEN** se registra `USER_LOGIN_CAPTCHA_CHALLENGE` con el score y el email enmascarado, pero no el token

#### Scenario: Captcha fallido registrado
- **WHEN** el verificador rechaza el token de un login
- **THEN** se registra `USER_LOGIN_CAPTCHA_FAILED` con el motivo y la versión (`v3` o `v2`), pero no el token

#### Scenario: Fallo al liberar el intento registrado
- **WHEN** la liberación del intento falla tras una contraseña correcta
- **THEN** se registra `LOGIN_ATTEMPT_RELEASE_FAILED` y el login continúa

#### Scenario: Sin datos sensibles
- **WHEN** se procesa cualquier login
- **THEN** ninguna línea del log contiene la contraseña, el token de captcha ni el refresh token

### Requirement: Página de inicio de sesión
El frontend MUST ofrecer `/login` (`LoginPage`) con los campos email y contraseña, un botón de envío y un enlace a `/registro`. MUST validar antes de enviar que los dos campos tienen valor y que el email tiene un formato válido (la misma regla que el registro), mostrando los errores inline con `aria-describedby` y `role="alert"`, y MUST NOT pedir un token de reCAPTCHA ni llamar al servidor si la validación falla. Con la validación correcta MUST pedir un token v3 nuevo con la acción `login` en cada envío. Una guarda síncrona MUST impedir envíos repetidos, con el botón deshabilitado durante el envío. MUST mostrar el aviso de privacidad y condiciones de Google junto al botón. La página MUST cumplir WCAG 2.1 AA y sus textos MUST venir de i18n.

#### Scenario: Campos vacíos
- **WHEN** el usuario envía el formulario vacío
- **THEN** ve «El email es obligatorio» y «La contraseña es obligatoria» con `role="alert"` y no se realiza ninguna petición

#### Scenario: Email con formato inválido
- **WHEN** el usuario envía `juan@` como email
- **THEN** ve «Formato de email inválido» y no se realiza ninguna petición

#### Scenario: Doble envío
- **WHEN** el usuario pulsa dos veces seguidas el botón con el formulario válido
- **THEN** se envía una sola petición de login

#### Scenario: Enlace al registro
- **WHEN** se abre `/login`
- **THEN** hay un enlace a `/registro`

### Requirement: Respuestas del servidor en la página de inicio de sesión
Tras enviar el login, el frontend MUST actuar según la respuesta, interpretada por `error.code`:
- `204` → llamar a `refresh()` del contexto de sesión: con sesión, navegar a `/onboarding`; si la cookie no se ha aceptado, mostrar el aviso de cookies necesarias; si la sesión no se puede comprobar por otra causa, un aviso de error temporal.
- `401` → «Email o contraseña incorrectos», conservando el email y vaciando la contraseña.
- `403 ACCOUNT_SUSPENDED` → «Tu cuenta está desactivada. Contacta con el administrador de tu colegio».
- `422 CAPTCHA_CHALLENGE_REQUIRED` → el reto v2, conservando email y contraseña y con el envío bloqueado hasta resolverlo.
- `422 CAPTCHA_FAILED` → el mensaje de verificación fallida.
- `429` → los minutos de espera (`Retry-After` redondeado hacia arriba, mínimo 1).
- `503`, error de red u otro → un mensaje de error temporal.

Un script de Google que no carga MUST tratarse como indisponibilidad sin llamar al backend. Ningún mensaje MUST mostrar detalles técnicos.

#### Scenario: Login correcto
- **WHEN** el servidor responde `204` y `refresh` devuelve una sesión
- **THEN** la aplicación navega a `/onboarding` con la bienvenida del usuario

#### Scenario: Credenciales incorrectas
- **WHEN** el servidor responde `401 INVALID_CREDENTIALS`
- **THEN** se muestra «Email o contraseña incorrectos», el email se conserva y la contraseña queda vacía

#### Scenario: Cuenta suspendida
- **WHEN** el servidor responde `403 ACCOUNT_SUSPENDED`
- **THEN** se muestra «Tu cuenta está desactivada. Contacta con el administrador de tu colegio»

#### Scenario: Reto v2
- **WHEN** el servidor responde `422 CAPTCHA_CHALLENGE_REQUIRED`
- **THEN** se muestra el reto v2, la contraseña se conserva y el botón está deshabilitado hasta resolverlo

#### Scenario: Demasiados intentos
- **WHEN** el servidor responde `429` con `Retry-After: 61`
- **THEN** se indica que se espere 2 minutos

#### Scenario: Cookies deshabilitadas
- **WHEN** el servidor responde `204` pero `refresh` indica que no hay cookie
- **THEN** se muestra que se necesitan cookies para mantener la sesión y no se navega a `/onboarding`

#### Scenario: Google no disponible
- **WHEN** el servidor responde `503 CAPTCHA_UNAVAILABLE`, o el script de reCAPTCHA no carga
- **THEN** se muestra un mensaje de error temporal; si el script no cargó, no se envía la petición de login

### Requirement: Redirecciones entre login y Onboarding
Con una sesión autenticada, `/login` MUST redirigir a `/onboarding`. Mientras la sesión se resuelve, `/login` MUST mostrar un indicador de carga accesible (`role="status"`) y no redirigir. Sin sesión, `/login` MUST mostrar el formulario.

#### Scenario: Usuario con sesión abre /login
- **GIVEN** una sesión autenticada
- **WHEN** se abre `/login`
- **THEN** la aplicación navega a `/onboarding`

#### Scenario: Sesión resolviéndose
- **WHEN** se abre `/login` y la renovación inicial aún no ha respondido
- **THEN** se muestra un indicador con `role="status"` y no se muestra el formulario

### Requirement: Vuelta a la sesión de extremo a extremo
El E2E MUST cubrir el flujo de un usuario que se registra, pierde la sesión e inicia sesión de nuevo, contra el build servido con `vite preview` y la misma CSP que producción, y MUST usar el verificador de captcha falso.

#### Scenario: Registro, pérdida de la sesión y login
- **GIVEN** un usuario registrado con datos únicos en el E2E
- **WHEN** se borran sus cookies, se abre `/onboarding`, se le redirige a `/login` e introduce su email y su contraseña
- **THEN** llega a `/onboarding` con la bienvenida y la cookie `refresh_token` es `httpOnly`, `secure` y `sameSite=lax`

#### Scenario: Errores en el E2E
- **WHEN** se envía el login con una contraseña incorrecta, o con el token `fake-low-score`
- **THEN** se ve «Email o contraseña incorrectos», o el reto v2 simulado que, resuelto, completa el login

### Requirement: Aviso de cuenta creada al llegar desde una invitación
Cuando `/login` se abre tras aceptar una invitación (la navegación indica que la cuenta se ha creado y su email), `LoginPage` MUST mostrar «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y el campo email MUST aparecer con ese email. Sin esa indicación, la página MUST comportarse como siempre. La indicación MUST viajar solo en el estado de la navegación, sin guardarse en ningún almacenamiento, de modo que al recargar `/login` el aviso no se repite.

#### Scenario: Llegada desde la aceptación
- **GIVEN** que una invitación se acaba de aceptar con el email `ana@example.com`
- **WHEN** la página de aceptación navega a `/login`
- **THEN** se ve «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y el campo email contiene `ana@example.com`

#### Scenario: Acceso directo
- **WHEN** se abre `/login` escribiendo la dirección o se recarga la página
- **THEN** no se ve el aviso y el campo email está vacío

