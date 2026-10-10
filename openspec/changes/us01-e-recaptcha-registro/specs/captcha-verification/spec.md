## ADDED Requirements

### Requirement: Verificación de tokens de reCAPTCHA v3
El backend MUST verificar un token `v3` con Google usando el secreto de la clave v3 y MUST aceptarlo solo si Google confirma el éxito, la acción es `register`, el dominio coincide con el de `APP_ORIGIN` y el score es mayor o igual que 0,6. Con un score menor MUST pedir el reto v2 (`422 CAPTCHA_CHALLENGE_REQUIRED`) en lugar de rechazar. Si la acción o el dominio no coinciden, o Google rechaza el token, MUST responder `422 CAPTCHA_FAILED`. El secreto MUST NOT salir nunca del servidor.

#### Scenario: Score suficiente
- **GIVEN** Google responde éxito, acción `register`, el dominio de `APP_ORIGIN` y score `0.9`
- **WHEN** se verifica un token `v3`
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
- **GIVEN** Google responde éxito con la acción `login`, o con otro dominio
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

### Requirement: Verificación de tokens de reCAPTCHA v2
El backend MUST verificar un token `v2` con el secreto de la clave v2 y MUST aceptarlo solo si Google confirma el éxito y el dominio coincide con el de `APP_ORIGIN`; en otro caso MUST responder `422 CAPTCHA_FAILED`.

#### Scenario: Reto superado
- **GIVEN** Google responde éxito con el dominio de `APP_ORIGIN`
- **WHEN** se verifica un token `v2`
- **THEN** se acepta, usando el secreto de la clave v2

#### Scenario: Reto no superado
- **GIVEN** Google responde `success: false`
- **WHEN** se verifica un token `v2`
- **THEN** responde `422 CAPTCHA_FAILED`

### Requirement: Captcha ausente o mal formado
Si `captcha` falta o no tiene la forma `{ version: 'v3' | 'v2', token }` con un token no vacío, el backend MUST responder `422 CAPTCHA_FAILED` sin llamar a Google.

#### Scenario: Sin captcha
- **WHEN** se envía un registro sin `captcha`, con una versión desconocida o con un token vacío
- **THEN** responde `422 CAPTCHA_FAILED` y no se hace ninguna petición a Google

### Requirement: Indisponibilidad de Google
Si la verificación no se completa, el backend MUST fallar cerrado y responder `503 CAPTCHA_UNAVAILABLE`, sin procesar el registro, cuando: la llamada supera 3 segundos, hay un error de red, Google responde con un estado distinto de 2xx o un cuerpo inesperado, o Google indica que el secreto falta o no es válido. El fallo MUST registrarse como error con su causa, sin el token ni el secreto. `CAPTCHA_UNAVAILABLE` MUST añadirse a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES`.

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

### Requirement: Verificador falso fuera de producción
Sin secretos de reCAPTCHA, el backend MUST usar un verificador falso que aplica la misma comprobación de forma y acepta cualquier token salvo los reservados: `fake-low-score` con `version` `v3` pide el reto, `fake-fail` responde `CAPTCHA_FAILED` y `fake-unavailable` responde `CAPTCHA_UNAVAILABLE`. MUST registrarse un aviso al arrancar con el verificador falso. En producción MUST NOT poder usarse: la configuración exige los secretos.

#### Scenario: Token cualquiera aceptado
- **GIVEN** el backend sin secretos de reCAPTCHA
- **WHEN** se envía un registro con `captcha: { version: 'v3', token: 'e2e' }`
- **THEN** el captcha se acepta y el registro continúa

#### Scenario: Casos simulados
- **GIVEN** el backend sin secretos de reCAPTCHA
- **WHEN** el token es `fake-low-score` (v3), `fake-fail` o `fake-unavailable`
- **THEN** responde `422 CAPTCHA_CHALLENGE_REQUIRED`, `422 CAPTCHA_FAILED` o `503 CAPTCHA_UNAVAILABLE`, respectivamente

#### Scenario: Nunca en producción
- **GIVEN** `NODE_ENV=production` sin secretos de reCAPTCHA
- **WHEN** se arranca el backend
- **THEN** no arranca y el error nombra las variables que faltan

### Requirement: Cliente de captcha en el frontend
El frontend MUST obtener un token v3 nuevo, con la acción `register`, en cada envío del formulario de registro, y MUST pintar el reto v2 cuando se le pida. Con claves de sitio MUST usar reCAPTCHA de Google, cargando su script solo en la página de registro y la primera vez que se necesita; sin claves MUST usar un cliente falso que devuelve un token fijo y pinta un reto simulado («No soy un robot (simulado)»). Si el script de Google no carga o no responde en 10 segundos, MUST tratarse como indisponibilidad sin llamar al backend.

#### Scenario: Token nuevo en cada envío
- **WHEN** el usuario envía el formulario dos veces
- **THEN** se piden dos tokens v3 distintos con la acción `register`

#### Scenario: Script cargado solo en el registro
- **WHEN** se abre la página inicial o Onboarding
- **THEN** no se carga el script de reCAPTCHA

#### Scenario: Script que no carga
- **GIVEN** el script de Google no carga
- **WHEN** el usuario envía el formulario
- **THEN** se muestra el mensaje de indisponibilidad y no se envía la petición de registro

#### Scenario: Cliente falso
- **GIVEN** un build sin claves de sitio
- **WHEN** se envía el formulario
- **THEN** el token es el fijo del cliente falso y el reto, si se pide, es un botón simulado
