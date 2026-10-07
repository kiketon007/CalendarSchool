## MODIFIED Requirements

### Requirement: Contrato documentado en OpenAPI
`docs/api-spec.yml` MUST definir el formato de error como componente reutilizable `ErrorResponse` con los códigos `NOT_FOUND`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`, `REQUEST_TIMEOUT`, `DATABASE_UNAVAILABLE`, `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `CAPTCHA_CHALLENGE_REQUIRED`, `CAPTCHA_FAILED` y `TOO_MANY_REQUESTS`, y documentar `GET /api/health` con sus respuestas `200` y `503`. La lista de códigos del backend MUST coincidir con la del contrato.

#### Scenario: Especificación válida
- **WHEN** se valida `docs/api-spec.yml` como OpenAPI 3
- **THEN** es válida, incluye `/api/health` con respuestas `200` y `503`, y la respuesta `503` referencia `ErrorResponse`

#### Scenario: Códigos del backend alineados con el contrato
- **GIVEN** el enum `ErrorCode` de `docs/api-spec.yml`
- **WHEN** se compara con el tipo `ErrorCode` del backend
- **THEN** ambos contienen exactamente los mismos códigos

## ADDED Requirements

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
