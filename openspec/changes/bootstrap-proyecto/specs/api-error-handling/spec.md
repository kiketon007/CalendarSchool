## ADDED Requirements

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
`docs/api-spec.yml` MUST definir el formato de error como componente reutilizable `ErrorResponse` con los códigos `NOT_FOUND`, `INVALID_JSON`, `INTERNAL_ERROR`, `REQUEST_TIMEOUT` y `DATABASE_UNAVAILABLE`, y documentar `GET /api/health` con sus respuestas `200` y `503`.

#### Scenario: Especificación válida
- **WHEN** se valida `docs/api-spec.yml` como OpenAPI 3
- **THEN** es válida, incluye `/api/health` con respuestas `200` y `503`, y la respuesta `503` referencia `ErrorResponse`
