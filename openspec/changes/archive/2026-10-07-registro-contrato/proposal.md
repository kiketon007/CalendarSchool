## Why

US01 (registro) se implementa en seis partes y todas comparten el contrato de `POST /api/auth/register`. US01_a lo fija antes que el código (`docs/User_Stories_MVP.md`, US01_a, CA7), junto con la generación automática de los tipos del frontend, para que backend y frontend no diverjan ni dupliquen los DTOs desde la primera historia con endpoints de negocio (PRD §3.1, registro del colegio y su usuario).

## What Changes

- `docs/api-spec.yml` documenta `POST /api/auth/register`: petición (`schoolName`, `firstName`, `lastName`, `email`, `password` y el token de reCAPTCHA con su versión) y respuestas `201`, `400`, `409`, `422` y `429`, además de los errores comunes ya existentes.
- Nuevos códigos de error en el enum `ErrorCode`: `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `CAPTCHA_CHALLENGE_REQUIRED`, `CAPTCHA_FAILED` y `TOO_MANY_REQUESTS`.
- Errores de validación por campo con la forma `{ field, code }` y códigos de campo genéricos: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`.
- Respuestas reutilizables `ValidationError` (`400`) y `TooManyRequests` (`429`, con la cabecera `Retry-After`) en `components.responses`, para que las reutilicen otras historias (p. ej. el inicio de sesión, US02).
- El workspace `frontend` genera sus tipos de la API desde `docs/api-spec.yml` con `openapi-typescript`, mediante un script; el fichero generado se versiona y no se edita a mano.
- CI (job `quality`) falla si los tipos generados no coinciden con el contrato.
- La lista de códigos de error del backend (`ErrorCode` en `appError.ts`) se amplía con los nuevos códigos para seguir coincidiendo con el contrato.

**Fuera de alcance:**
- La implementación del endpoint y su lógica: validación, alta del colegio y del usuario (US01_b), sesión (US01_c), límite de intentos (US01_d) y reCAPTCHA (US01_e).
- El formulario de registro y cualquier cliente HTTP en el frontend: aquí solo se generan los tipos.
- La validación de las respuestas del backend contra el contrato (tests de contrato) y la generación de tipos para el backend.
- Los datos de sesión de la respuesta `201` (token de acceso y cookie de refresco), que añade US01_c al contrato.

## Capabilities

### New Capabilities
- `user-registration`: contrato del registro de un colegio y su usuario (`POST /api/auth/register`); las partes US01_b a US01_f añadirán aquí su comportamiento.
- `api-contract-types`: generación de los tipos TypeScript del frontend a partir de `docs/api-spec.yml` y comprobación de que están al día.

### Modified Capabilities
- `api-error-handling`: el contrato documenta nuevos códigos de error, el formato de los errores de validación por campo y las respuestas reutilizables `ValidationError` y `TooManyRequests`.
- `dev-workflow`: el job `quality` de CI comprueba que los tipos generados están al día con el contrato.

## Impact

- **Contrato API:** `docs/api-spec.yml` (nuevo endpoint, esquemas, códigos y respuestas reutilizables). Sin cambios en el modelo de datos.
- **Frontend:** dependencia de desarrollo `openapi-typescript`, script de generación y comprobación, fichero de tipos generado y versionado, y su exclusión de ESLint, Prettier y cobertura.
- **Backend:** solo la ampliación del tipo `ErrorCode`; ningún endpoint nuevo.
- **CI:** nuevo paso en el job `quality` de `.github/workflows/ci.yml`.
- **Documentación:** `CLAUDE.md` (comando de generación de tipos).
