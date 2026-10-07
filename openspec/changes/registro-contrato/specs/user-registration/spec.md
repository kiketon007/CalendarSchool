## ADDED Requirements

### Requirement: Contrato del registro documentado en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/auth/register` como endpoint público (sin autenticación). La petición MUST ser un objeto JSON con `schoolName`, `firstName`, `lastName`, `email`, `password` y `captcha`, este último con `version` (`v3` o `v2`) y `token`, todos obligatorios. Las respuestas MUST ser:
- `201`: colegio y usuario creados, con el formato de éxito común; `data` contiene el usuario (`id`, `email`, `firstName`, `lastName`) y el colegio (`id`, `name`), sin la contraseña ni su hash.
- `400`: `VALIDATION_ERROR` con un elemento en `details` por campo inválido (`{ field, code }`), o `INVALID_JSON`.
- `409`: `EMAIL_ALREADY_REGISTERED`.
- `422`: `CAPTCHA_CHALLENGE_REQUIRED` (el score de reCAPTCHA v3 es menor que 0.6 y el cliente debe presentar el reto v2) o `CAPTCHA_FAILED` (token ausente, inválido o caducado, o reto v2 no superado).
- `429`: `TOO_MANY_REQUESTS`, con la cabecera `Retry-After`.
- Los errores comunes a toda la API (`413`, `415`, `500` y `503`), referenciados desde `components.responses`.

#### Scenario: Endpoint documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se valida como OpenAPI 3.1
- **THEN** es válido e incluye `POST /api/auth/register` con las respuestas `201`, `400`, `409`, `422`, `429`, `413`, `415`, `500` y `503`
- **AND** todas las respuestas de error referencian el formato de error común

#### Scenario: Petición documentada
- **GIVEN** la definición de `POST /api/auth/register`
- **WHEN** se consulta el esquema de la petición
- **THEN** exige `schoolName`, `firstName`, `lastName`, `email`, `password` y `captcha` con `version` (`v3` o `v2`) y `token`, y no admite propiedades adicionales

#### Scenario: Respuesta de alta sin credenciales
- **GIVEN** la definición de la respuesta `201`
- **WHEN** se consulta su esquema
- **THEN** `data` contiene el usuario (`id`, `email`, `firstName`, `lastName`) y el colegio (`id`, `name`)
- **AND** no contiene la contraseña ni su hash

#### Scenario: Dos causas distintas de 422
- **GIVEN** la definición de la respuesta `422`
- **WHEN** se consultan sus códigos de error
- **THEN** distingue `CAPTCHA_CHALLENGE_REQUIRED`, con el que el cliente presenta el reto v2, de `CAPTCHA_FAILED`, con el que el cliente informa del fallo de verificación
