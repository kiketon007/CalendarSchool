## ADDED Requirements

### Requirement: Límite de intentos de registro
`POST /api/auth/register` MUST aplicar, como paso 1 del orden de procesamiento, un límite de `REGISTRATION_ATTEMPTS_MAX` intentos (5 por defecto) por IP en cualquier ventana de 15 minutos, con la capacidad `attempt-limiting` y la clave `register:<ip>`. Cuentan todos los intentos que llegan al endpoint sin que el cuerpo sea un JSON mal formado, también los que llegan sin cuerpo, se acepten o no después (captcha, validación, duplicado o alta). El intento que supera el límite MUST responder `429 TOO_MANY_REQUESTS` con `Retry-After`, sin verificar el captcha, validar el payload ni consultar usuarios o colegios, y sin fijar ninguna cookie. MUST registrarse el evento `USER_REGISTER_RATE_LIMITED` con nivel `warn`, `ip`, `user_agent` y `retry_after`, sin el email. `docs/api-spec.yml` MUST indicar el límite en la descripción del `429`.

#### Scenario: Sexto intento en 15 minutos
- **GIVEN** 5 intentos de registro desde la misma IP en los últimos 15 minutos
- **WHEN** se hace un sexto intento
- **THEN** responde `429` con `TOO_MANY_REQUESTS` y `Retry-After`
- **AND** no se verifica el captcha, no se valida el payload ni se consulta si el email o el colegio existen
- **AND** no se crea ningún colegio, usuario ni refresh token, y la respuesta no incluye `Set-Cookie`

#### Scenario: Cuentan los intentos con email ya registrado
- **GIVEN** 5 intentos desde la misma IP que han respondido `409 EMAIL_ALREADY_REGISTERED`
- **WHEN** se hace un sexto intento con datos válidos y nuevos
- **THEN** responde `429`

#### Scenario: Cuentan los intentos rechazados por validación o captcha
- **GIVEN** 5 intentos desde la misma IP que han respondido `400` o `422`
- **WHEN** se hace un sexto intento
- **THEN** responde `429`

#### Scenario: Otra IP no está limitada
- **GIVEN** una IP que ha agotado sus 5 intentos
- **WHEN** se registra desde otra IP
- **THEN** el registro se procesa con normalidad

#### Scenario: Se puede reintentar al vencer la ventana
- **GIVEN** una IP bloqueada
- **WHEN** pasan los segundos indicados en `Retry-After`
- **THEN** el siguiente intento se procesa con normalidad

#### Scenario: Cuerpo que no es JSON
- **WHEN** se envía un cuerpo que no es JSON válido
- **THEN** responde `400 INVALID_JSON` como hasta ahora, sin contar como intento

#### Scenario: Petición sin cuerpo
- **WHEN** se envía una petición sin cuerpo
- **THEN** cuenta como intento y responde `400 VALIDATION_ERROR` con los campos obligatorios ausentes

#### Scenario: Evento de log
- **WHEN** se rechaza un intento por el límite
- **THEN** se registra `USER_REGISTER_RATE_LIMITED` con la IP, el user agent y los segundos de espera
- **AND** el log no contiene el email ni la contraseña

#### Scenario: Máximo configurable
- **GIVEN** `REGISTRATION_ATTEMPTS_MAX` igual a `2`
- **WHEN** se hacen 3 intentos desde la misma IP
- **THEN** el tercero responde `429`

#### Scenario: Contrato documentado
- **WHEN** se consulta la respuesta `429` de `POST /api/auth/register` en `docs/api-spec.yml`
- **THEN** su descripción indica el límite de 5 intentos por IP cada 15 minutos
- **AND** `frontend/src/api/generated/schema.ts` está al día (`api:types:check` pasa)

### Requirement: Aviso de demasiados intentos en el formulario
Ante un `429 TOO_MANY_REQUESTS`, el formulario MUST mostrar con `role="alert"` un mensaje en lenguaje claro que indique que se ha superado el número de intentos y cuántos minutos esperar, calculados con `Retry-After` redondeado hacia arriba a minutos. Si la cabecera falta o no es un entero válido, MUST mostrar el mismo aviso sin el número. MUST conservar los datos introducidos salvo la contraseña. Los textos MUST venir de i18n.

#### Scenario: Aviso con tiempo de espera
- **WHEN** el servidor responde `429` con `Retry-After: 840`
- **THEN** se muestra «Has superado el número de intentos de registro. Vuelve a intentarlo dentro de 14 minutos.»
- **AND** el formulario conserva los datos salvo la contraseña

#### Scenario: Espera de menos de un minuto
- **WHEN** el servidor responde `429` con `Retry-After: 20`
- **THEN** el aviso indica 1 minuto

#### Scenario: Sin cabecera de espera
- **WHEN** el servidor responde `429` sin `Retry-After` o con un valor no numérico
- **THEN** se muestra «Has superado el número de intentos de registro. Vuelve a intentarlo más tarde.»

#### Scenario: Textos traducidos
- **WHEN** se ejecutan los tests del frontend
- **THEN** los avisos existen en `es.json` y en `en.json` con las mismas claves

## MODIFIED Requirements

### Requirement: Respuestas del servidor en el formulario
Tras enviar el formulario, el frontend MUST mostrar, según la respuesta: `201`, la obtención de la sesión con `refresh` y la redirección a `/onboarding` (sustituye al mensaje de confirmación de US01_b), con el aviso de cookies deshabilitadas cuando proceda; `409 EMAIL_ALREADY_REGISTERED`, «Este email ya está registrado» con un enlace a la pantalla de login; `409 SCHOOL_ALREADY_REGISTERED`, «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»; `400`, los errores bajo cada campo; `429 TOO_MANY_REQUESTS`, el aviso de demasiados intentos con el tiempo de espera; y cualquier otro error, un mensaje genérico en lenguaje claro sin detalles técnicos.

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

#### Scenario: Error inesperado
- **WHEN** el servidor responde `500` o no hay conexión
- **THEN** se muestra un mensaje genérico sin códigos ni trazas y el formulario conserva los datos introducidos salvo la contraseña
