## MODIFIED Requirements

### Requirement: Verificación de tokens de reCAPTCHA v3
El backend MUST verificar un token `v3` con Google usando el secreto de la clave v3 y MUST aceptarlo solo si Google confirma el éxito, la acción es la esperada por la operación que lo pide (`register` en el registro, `login` en el inicio de sesión), el dominio coincide con el de `APP_ORIGIN` y el score es mayor o igual que 0,6. La acción esperada MUST indicarla quien llama al verificador, no ser una constante del verificador. Con un score menor MUST pedir el reto v2 (`422 CAPTCHA_CHALLENGE_REQUIRED`) en lugar de rechazar. Si la acción o el dominio no coinciden, o Google rechaza el token, MUST responder `422 CAPTCHA_FAILED`. El secreto MUST NOT salir nunca del servidor.

#### Scenario: Score suficiente
- **GIVEN** Google responde éxito, acción `register`, el dominio de `APP_ORIGIN` y score `0.9`
- **WHEN** se verifica un token `v3` esperando la acción `register`
- **THEN** se acepta

#### Scenario: Acción del login
- **GIVEN** Google responde éxito, acción `login`, el dominio de `APP_ORIGIN` y score `0.9`
- **WHEN** se verifica un token `v3` esperando la acción `login`
- **THEN** se acepta

#### Scenario: Score en el umbral
- **GIVEN** Google responde score `0.6` con el resto correcto
- **WHEN** se verifica un token `v3`
- **THEN** se acepta

#### Scenario: Score bajo
- **GIVEN** Google responde score `0.3` con el resto correcto
- **WHEN** se verifica un token `v3`
- **THEN** se pide el reto v2 con `422 CAPTCHA_CHALLENGE_REQUIRED`

#### Scenario: Acción o dominio incorrectos
- **GIVEN** Google responde éxito con una acción distinta de la esperada (`login` cuando se espera `register`, o al revés), o con otro dominio
- **WHEN** se verifica un token `v3`
- **THEN** responde `422 CAPTCHA_FAILED`

#### Scenario: Token caducado o reutilizado
- **GIVEN** Google responde `success: false` con `timeout-or-duplicate`
- **WHEN** se verifica un token
- **THEN** responde `422 CAPTCHA_FAILED`

#### Scenario: Petición a Google
- **WHEN** se verifica un token `v3`
- **THEN** se envía un `POST` a `https://www.google.com/recaptcha/api/siteverify` con el secreto de la clave v3 y el token, como formulario
- **AND** ni el secreto ni el token aparecen en la respuesta al cliente ni en los logs

### Requirement: Captcha ausente o mal formado
Si `captcha` falta o no tiene la forma `{ version: 'v3' | 'v2', token }` con un token no vacío, el backend MUST responder `422 CAPTCHA_FAILED` sin llamar a Google, tanto en el registro como en el inicio de sesión.

#### Scenario: Sin captcha
- **WHEN** se envía un registro o un login sin `captcha`, con una versión desconocida o con un token vacío
- **THEN** responde `422 CAPTCHA_FAILED` y no se hace ninguna petición a Google

### Requirement: Indisponibilidad de Google
Si la verificación no se completa, el backend MUST fallar cerrado y responder `503 CAPTCHA_UNAVAILABLE`, sin procesar el registro ni el inicio de sesión, cuando: la llamada supera 3 segundos, hay un error de red, Google responde con un estado distinto de 2xx o un cuerpo inesperado, o Google indica que el secreto falta o no es válido. El fallo MUST registrarse como error con su causa, sin el token ni el secreto. `CAPTCHA_UNAVAILABLE` MUST añadirse a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES`.

#### Scenario: Google tarda demasiado
- **GIVEN** Google no responde en 3 segundos
- **WHEN** se verifica un token
- **THEN** responde `503 CAPTCHA_UNAVAILABLE` y no se crea nada

#### Scenario: Error de Google o de red
- **GIVEN** la llamada falla por red, o Google responde `500` o un cuerpo que no es JSON
- **WHEN** se verifica un token
- **THEN** responde `503 CAPTCHA_UNAVAILABLE`

#### Scenario: Secreto mal configurado
- **GIVEN** Google responde `invalid-input-secret`
- **WHEN** se verifica un token
- **THEN** responde `503 CAPTCHA_UNAVAILABLE`, no `CAPTCHA_FAILED`
- **AND** se registra un error que permite detectar la configuración incorrecta

#### Scenario: Códigos de error sincronizados
- **WHEN** se ejecutan los tests del backend
- **THEN** `CAPTCHA_UNAVAILABLE` figura en el enum `ErrorCode` del contrato y en `ERROR_CODES`, y `appError.test.ts` pasa

### Requirement: Cliente de captcha en el frontend
El frontend MUST obtener un token v3 nuevo, con la acción de la página (`register` en el registro, `login` en el inicio de sesión), en cada envío de su formulario, y MUST pintar el reto v2 cuando se le pida. Con claves de sitio MUST usar reCAPTCHA de Google, cargando su script solo en las páginas de registro y de inicio de sesión y la primera vez que se necesita; sin claves MUST usar un cliente falso que devuelve un token fijo y pinta un reto simulado («No soy un robot (simulado)»). Si el script de Google no carga o no responde en 10 segundos, MUST tratarse como indisponibilidad sin llamar al backend.

#### Scenario: Token nuevo en cada envío
- **WHEN** el usuario envía el formulario de registro dos veces
- **THEN** se piden dos tokens v3 distintos con la acción `register`

#### Scenario: Acción del login
- **WHEN** el usuario envía el formulario de inicio de sesión
- **THEN** se pide un token v3 con la acción `login`

#### Scenario: Script cargado solo en registro e inicio de sesión
- **WHEN** se abre la página inicial, Onboarding o `/privacidad`
- **THEN** no se carga el script de reCAPTCHA

#### Scenario: Script que no carga
- **GIVEN** el script de Google no carga
- **WHEN** el usuario envía el formulario de registro o de inicio de sesión
- **THEN** se muestra el mensaje de indisponibilidad y no se envía la petición

#### Scenario: Cliente falso
- **GIVEN** un build sin claves de sitio
- **WHEN** se envía el formulario
- **THEN** el token es el fijo del cliente falso y el reto, si se pide, es un botón simulado
