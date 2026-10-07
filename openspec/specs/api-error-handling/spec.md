# api-error-handling Specification

## Purpose
Define el formato de respuesta común de la API (`success`/`data`/`error`) y el comportamiento del manejo de errores transversal: rutas inexistentes, cuerpos rechazados por el parser, errores no controlados y timeout de petición, con códigos estables que el frontend traduce por i18n. Origen: cambio `bootstrap-proyecto` (US00).
## Requirements
### Requirement: Formato de respuesta común de la API
Todas las respuestas de la API bajo `/api` MUST usar el formato común: éxito `{ "success": true, "data": { ... } }` y error `{ "success": false, "error": { "code": "...", "message": "...", "details": [ ... ] } }`, con `details` opcional. El `code` MUST ser un identificador en inglés y mayúsculas (`UPPER_SNAKE_CASE`) estable para que el frontend lo traduzca por i18n; el `message` MUST estar en castellano, dirigido a desarrolladores, y el frontend MUST NOT mostrarlo al usuario.

#### Scenario: Error con formato común
- **GIVEN** cualquier petición bajo `/api` que termina en error
- **WHEN** el backend responde
- **THEN** el cuerpo es JSON con `success: false` y un objeto `error` con `code` y `message`
- **AND** la cabecera `Content-Type` es `application/json`

### Requirement: Ruta desconocida bajo /api
Una petición a una ruta inexistente bajo `/api` MUST responder `404` con el código `NOT_FOUND` en JSON, nunca con la página HTML por defecto de Express.

#### Scenario: Ruta inexistente
- **WHEN** un cliente hace `GET /api/does-not-exist`
- **THEN** recibe `404` con `{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }`

### Requirement: Cuerpo JSON mal formado
Una petición con un cuerpo JSON sintácticamente inválido MUST responder `400` con el código `INVALID_JSON`.

#### Scenario: JSON inválido
- **WHEN** un cliente envía una petición con `Content-Type: application/json` y el cuerpo `{"a":`
- **THEN** recibe `400` con el código `INVALID_JSON`

### Requirement: Cuerpo rechazado por su tamaño o su codificación
Una petición cuyo cuerpo supera el límite de tamaño del parser JSON (100 KB) MUST responder `413` con el código `PAYLOAD_TOO_LARGE`, y una cuyo `charset` o `Content-Encoding` no está soportado MUST responder `415` con el código `UNSUPPORTED_MEDIA_TYPE`. Son errores del cliente: MUST NOT tratarse como error no controlado (`500 INTERNAL_ERROR`) ni registrarse en el log con nivel `error`.

#### Scenario: Cuerpo demasiado grande
- **WHEN** un cliente envía una petición con `Content-Type: application/json` y un cuerpo de más de 100 KB
- **THEN** recibe `413` con `{ "success": false, "error": { "code": "PAYLOAD_TOO_LARGE", "message": "..." } }`
- **AND** el log no contiene ninguna entrada con nivel `error`

#### Scenario: Charset no soportado
- **WHEN** un cliente envía una petición con `Content-Type: application/json; charset=latin-9`
- **THEN** recibe `415` con el código `UNSUPPORTED_MEDIA_TYPE`
- **AND** el log no contiene ninguna entrada con nivel `error`

#### Scenario: Codificación de contenido no soportada
- **WHEN** un cliente envía una petición JSON con `Content-Encoding: compress-unknown`
- **THEN** recibe `415` con el código `UNSUPPORTED_MEDIA_TYPE`

### Requirement: Error no controlado
Un error no controlado durante el procesamiento de una petición MUST responder `500` con el código `INTERNAL_ERROR`, sin traza ni mensaje original en la respuesta; la traza MUST registrarse en el log.

#### Scenario: Excepción inesperada
- **GIVEN** un handler que lanza una excepción no controlada
- **WHEN** un cliente lo invoca
- **THEN** recibe `500` con el código `INTERNAL_ERROR`
- **AND** la respuesta no contiene la traza ni el mensaje de la excepción
- **AND** el log contiene la traza

### Requirement: Timeout de petición
Una petición que supere los 10 segundos MUST responder `503` con el código `REQUEST_TIMEOUT`. Si el handler original intenta responder después, el sistema MUST NOT enviar una segunda respuesta ni fallar por cabeceras ya enviadas.

#### Scenario: Petición lenta
- **GIVEN** un handler que tarda más de 10 segundos
- **WHEN** un cliente lo invoca
- **THEN** recibe `503` con el código `REQUEST_TIMEOUT` a los 10 segundos

#### Scenario: Respuesta tardía del handler
- **GIVEN** una petición que ya recibió `503` con `REQUEST_TIMEOUT`
- **WHEN** el handler original termina e intenta responder
- **THEN** no se envía una segunda respuesta y el proceso no registra un error de cabeceras ya enviadas

### Requirement: Contrato documentado en OpenAPI
`docs/api-spec.yml` MUST definir el formato de error como componente reutilizable `ErrorResponse` con los códigos `NOT_FOUND`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`, `REQUEST_TIMEOUT`, `DATABASE_UNAVAILABLE`, `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `CAPTCHA_CHALLENGE_REQUIRED`, `CAPTCHA_FAILED` y `TOO_MANY_REQUESTS`, y documentar `GET /api/health` con sus respuestas `200` y `503`. La lista de códigos del backend MUST coincidir con la del contrato.

#### Scenario: Especificación válida
- **WHEN** se valida `docs/api-spec.yml` como OpenAPI 3
- **THEN** es válida, incluye `/api/health` con respuestas `200` y `503`, y la respuesta `503` referencia `ErrorResponse`

#### Scenario: Códigos del backend alineados con el contrato
- **GIVEN** el enum `ErrorCode` de `docs/api-spec.yml`
- **WHEN** se compara con el tipo `ErrorCode` del backend
- **THEN** ambos contienen exactamente los mismos códigos

### Requirement: Errores de validación por campo
Los errores de validación de la entrada MUST responder `400` con el código `VALIDATION_ERROR` y un elemento en `details` por cada campo inválido, con la forma `{ "field": "<nombre del campo>", "code": "<código de campo>" }`. Los códigos de campo MUST ser genéricos y reutilizables entre historias: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`. El frontend MUST traducir la pareja campo-código mediante i18n y mostrar el mensaje bajo el campo correspondiente. El contrato MUST definirlo como respuesta reutilizable `ValidationError` en `components.responses`.

#### Scenario: Error de validación documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta reutilizable `ValidationError`
- **THEN** su cuerpo usa el formato de error común con el código `VALIDATION_ERROR` y `details` como lista de objetos `{ field, code }`
- **AND** `code` solo admite `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`

### Requirement: Demasiadas peticiones
Cuando un cliente supera un límite de peticiones, la API MUST responder `429` con el código `TOO_MANY_REQUESTS` y la cabecera `Retry-After` con los segundos que faltan para poder reintentar. El contrato MUST definirlo como respuesta reutilizable `TooManyRequests` en `components.responses`.

#### Scenario: Límite superado documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta reutilizable `TooManyRequests`
- **THEN** su cuerpo usa el formato de error común con el código `TOO_MANY_REQUESTS`
- **AND** declara la cabecera `Retry-After` como un número entero de segundos

