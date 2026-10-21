## MODIFIED Requirements

### Requirement: Errores de validación por campo
Los errores de validación de la entrada MUST responder `400` con el código `VALIDATION_ERROR` y un elemento en `details` por cada campo inválido, con la forma `{ "field": "<nombre del campo>", "code": "<código de campo>" }`. Los códigos de campo MUST ser genéricos y reutilizables entre historias: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`, `DUPLICATE` (un elemento repetido de una lista), `NOT_FOUND` (un campo que apunta a algo que no existe en el colegio) y `NOT_ALLOWED` (un campo que no se admite por el valor de otro campo). El frontend MUST traducir la pareja campo-código mediante i18n y mostrar el mensaje bajo el campo correspondiente. El contrato MUST definirlo como respuesta reutilizable `ValidationError` en `components.responses`.

#### Scenario: Error de validación documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consulta la respuesta reutilizable `ValidationError`
- **THEN** su cuerpo usa el formato de error común con el código `VALIDATION_ERROR` y `details` como lista de objetos `{ field, code }`
- **AND** `code` solo admite `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`, `DUPLICATE`, `NOT_FOUND` y `NOT_ALLOWED`

#### Scenario: Campo no admitido por el valor de otro
- **GIVEN** un cuerpo en el que un campo solo se admite según el valor de otro (p. ej. la beca de comedor de un alumno que no come en el comedor)
- **WHEN** se envía con ese campo
- **THEN** la respuesta es `400 VALIDATION_ERROR` con `{ "field": "<campo>", "code": "NOT_ALLOWED" }`
