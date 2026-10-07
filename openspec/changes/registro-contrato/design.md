## Context

US01 (registro) se divide en seis partes (`docs/User_Stories_MVP.md`). US01_a fija el contrato de `POST /api/auth/register` y la generación de tipos del frontend antes de que exista el endpoint; las decisiones sobre códigos y formatos de error ya están tomadas en la historia (sección *Respuestas de error del registro*).

Estado actual:
- `docs/api-spec.yml` (OpenAPI 3.1) solo documenta `GET /api/health`, el formato `ErrorResponse` con 7 códigos y las respuestas reutilizables de los errores comunes. `ErrorResponse.error.details` es una lista libre (`items: {}`).
- `backend/src/presentation/http/appError.ts` copia a mano esa lista de códigos en el tipo `ErrorCode`, con el comentario «deben coincidir con `ErrorCode` de docs/api-spec.yml», sin nada que lo compruebe.
- El frontend no tiene cliente HTTP ni tipos de la API.
- CI (`.github/workflows/ci.yml`, job `quality`) ejecuta lint, tipos, tests, build y la comprobación de enlaces simbólicos.

## Goals / Non-Goals

**Goals:**
- Documentar en `docs/api-spec.yml` la petición y todas las respuestas del registro, con los nuevos códigos y las respuestas reutilizables `ValidationError` y `TooManyRequests`.
- Generar los tipos del frontend desde el contrato con un script, versionar el resultado y hacer que CI falle si no está al día.
- Comprobar automáticamente que los códigos de error del backend coinciden con los del contrato.

**Non-Goals:**
- Implementar el endpoint (US01_b a US01_e), el formulario o un cliente HTTP en el frontend.
- Generar tipos o validadores para el backend, que sigue usando Zod como fuente de la validación.
- Tests de contrato que validen las respuestas reales del backend contra `api-spec.yml`.
- Los datos de sesión de la respuesta `201` (token de acceso y cookie de refresco), que añade US01_c.

## Decisions

### D1. Esquemas del registro en `components.schemas`

Se añaden esquemas con nombre (en inglés, como el resto del código) para que los tipos generados sean legibles:
- `RegisterRequest`: `schoolName`, `firstName`, `lastName`, `email`, `password` y `captcha`, todos obligatorios y con `additionalProperties: false`. Las longitudes máximas de la historia (150, 100, 100, 320 y 128) se declaran con `maxLength`; los patrones de caracteres permitidos no se trasladan al contrato porque la validación de referencia es la de Zod en US01_b y duplicarlos en dos sitios invita a que diverjan.
- `CaptchaToken`: `version` (`v3` | `v2`) y `token`. La versión viaja en la petición porque cada versión de reCAPTCHA se verifica con una clave secreta distinta.
- `RegisterResponse`: formato de éxito común con `data.user` (`id`, `email`, `firstName`, `lastName`) y `data.school` (`id`, `name`), definidos como esquemas propios (`RegisteredUser` y `RegisteredSchool`) para que los tipos generados tengan nombres legibles. Los `id` son `string` con `format: uuid`, en línea con el ticket BE1 del README; si US01_b elige otro tipo de identificador, actualiza el contrato en ese cambio.
- `FieldError` (`field`, `code`) y `FieldErrorCode` (`REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`).
- `ValidationErrorResponse`: igual que `ErrorResponse`, pero con `details` tipado como lista de `FieldError`. Se define como esquema independiente y no con `allOf` sobre `ErrorResponse`, porque `additionalProperties: false` en el objeto `error` hace que la composición con `allOf` rechace la propiedad `details` redefinida.

`code` en `ValidationErrorResponse` referencia el `ErrorCode` general, de modo que la respuesta `400` del registro cubre tanto `VALIDATION_ERROR` como `INVALID_JSON` (este último sigue siendo un error común a toda la API).

*Alternativa descartada:* cambiar `ErrorResponse.details` de lista libre a `FieldError`. Otras historias pueden necesitar `details` con otra forma; tiparlo para todos los errores por la necesidad de uno solo lo encorseta.

### D2. Respuestas reutilizables y respuestas del endpoint

- `components.responses.ValidationError` (`400`, `ValidationErrorResponse`) y `components.responses.TooManyRequests` (`429`, `ErrorResponse`, cabecera `Retry-After` de tipo entero y obligatoria). La cabecera se declara con `required: true` porque en OpenAPI las cabeceras de respuesta son opcionales por defecto, y la spec exige que el `429` la incluya siempre.
- Las dos causas de `422` (`CAPTCHA_CHALLENGE_REQUIRED` y `CAPTCHA_FAILED`) se documentan en una sola respuesta con dos ejemplos, porque OpenAPI admite una única respuesta por código de estado; el cliente las distingue por `error.code`.
- El endpoint referencia además `PayloadTooLarge` (`413`), `UnsupportedMediaType` (`415`), `InternalError` (`500`) y `ServiceUnavailable` (`503`), porque recibe cuerpo y puede sufrir esos errores. `INVALID_JSON` y `NOT_FOUND` se quedan en la descripción general de la API, como hasta ahora.
- `security: []`, como `GET /api/health`: es un endpoint público.

### D3. `openapi-typescript` con el fichero generado versionado

- Dependencia de desarrollo del workspace `frontend`. Genera solo tipos (sin código en tiempo de ejecución), admite OpenAPI 3.1 y tiene la opción `--check`, que falla si el fichero no coincide con lo que generaría, sin escribirlo.
- **Compatibilidad con TypeScript 6:** la versión actual (7.13.0) declara `typescript@^5.x` como dependencia peer y el proyecto fija TypeScript `~6.0`, por lo que npm rechaza instalarla. Se resuelve con un `overrides` global en el `package.json` raíz (`"typescript": "~6.0.3"`), que obliga a todo el árbol a usar el TypeScript del proyecto. La forma anidada (`"openapi-typescript": { "typescript": ... }`) no sirve: npm no la aplica a la comprobación de dependencias peer y sigue rechazando la instalación. La global es inocua porque todo el monorepo ya usa TypeScript `~6.0`, y su versión debe mantenerse igual que la de los `devDependencies` de los workspaces. Es seguro porque la herramienta solo usa la API del compilador para construir e imprimir los tipos, y el test de tipos (`schema.test.ts`) y `--check` detectarían una salida incorrecta. El override se retira cuando `openapi-typescript` admita TypeScript 6.
- Salida: `frontend/src/api/generated/schema.ts`.
- Scripts del workspace `frontend`: `api:types` (`openapi-typescript ../docs/api-spec.yml -o src/api/generated/schema.ts`) y `api:types:check` (el mismo comando con `--check`).
- El fichero se versiona: así CI puede compararlo con el contrato (CA7) y cada PR que cambia el contrato muestra su efecto en los tipos.
- Las opciones del generador (p. ej. `--root-types`) se fijan al implementar, según cómo queden los nombres de los tipos; sea cual sea la elección, se aplica igual en `api:types` y `api:types:check`.

*Alternativas descartadas:*
- **`@hey-api/openapi-ts` (admite TypeScript 6):** está en 0.x, con cambios frecuentes, y no tiene un equivalente a `--check`.
- **Ejecutar `openapi-typescript` con `npx` sin instalarlo:** evita el conflicto, pero deja la herramienta fuera del `package-lock.json`.
- **`--legacy-peer-deps`:** relajaría la resolución de dependencias peer de todo el monorepo para resolver el problema de un solo paquete.
- **Generar en el build sin versionar:** no hay nada que comparar en CI y el efecto de un cambio del contrato no se ve en la PR.
- **Generadores de clientes (orval, hey-api):** generan código en tiempo de ejecución que todavía no hace falta; la historia pide solo tipos.
- **DTOs escritos a mano:** es justo la divergencia que la historia quiere evitar.

### D4. El fichero generado queda fuera de las herramientas de formato y calidad

`--check` compara el fichero byte a byte con la salida del generador, así que nada puede reformatearlo:
- Se añade a `.prettierignore` (lo usan `npm run lint`, `npm run format` y el hook, que ya pasa `--ignore-path ../.prettierignore`).
- Se añade a los `ignores` de `frontend/eslint.config.js` (configuración base, que hereda el hook).
- Si un commit incluye el fichero, lint-staged se lo pasa a ESLint de forma explícita y ESLint avisa de que está ignorado, lo que con `--max-warnings=0` haría fallar el hook. Se añade `--no-warn-ignored` al comando de ESLint del hook. Se verifica con un commit real del fichero, como el resto de comprobaciones manuales del hook (US00, CA8).
- Se excluye de la cobertura del frontend (`vite.config.ts`): solo contiene tipos.

Se sigue el mismo criterio que con el cliente de Prisma generado del backend.

### D5. Comprobación en CI

Nuevo paso en el job `quality`, justo después de «Lint y formato»: `npm run api:types:check -w frontend`. Va antes de los tests para fallar pronto, y no necesita base de datos.

### D6. Códigos de error del backend comprobados contra el contrato

El tipo `ErrorCode` de `appError.ts` pasa a derivarse de una lista en tiempo de ejecución (`ERROR_CODES = [...] as const`), que se amplía con los cinco códigos nuevos aunque el backend todavía no los use. Un test unitario del backend lee `docs/api-spec.yml` y comprueba que `ERROR_CODES` contiene exactamente los códigos del enum `ErrorCode` del contrato. Para leer el YAML se añade la dependencia de desarrollo `yaml` al workspace `backend`.

Capa DDD: el tipo sigue en `presentation/http`, porque los códigos y estados HTTP son parte de la capa de presentación; no se toca el dominio.

*Alternativa descartada:* importar en el backend los tipos que genera el frontend. Acoplaría el backend a un workspace hermano y a su herramienta de generación, y un tipo no sirve para comparar en tiempo de ejecución.

### D7. Sin cambios en el modelo de datos ni en seguridad en tiempo de ejecución

No se crea ninguna tabla ni migración, ni se añade ningún endpoint ejecutable. En cuanto a seguridad, el contrato fija que la respuesta `201` nunca incluye la contraseña ni su hash. No hay impacto en rendimiento.

## Risks / Trade-offs

- **`openapi-typescript` no es un validador completo de OpenAPI** → falla con documentos mal formados, pero no detecta todos los incumplimientos de la especificación. Se asume: el contrato es pequeño y se revisa en cada PR. Si crece, se puede añadir un linter de OpenAPI (p. ej. Redocly CLI) en un cambio aparte.
- **`openapi-typescript` no está probado con TypeScript 6** → el override fuerza una combinación que la herramienta no declara compatible. Mitigación: el test de tipos y `--check` fallan si la salida no es correcta; si fallara de forma no evidente, la alternativa es `@hey-api/openapi-ts`.
- **Una nueva versión del generador puede cambiar su salida** → `api:types:check` fallaría tras actualizar la dependencia aunque el contrato no haya cambiado. Mitigación: al actualizar `openapi-typescript`, regenerar el fichero en la misma PR.
- **El contrato de la respuesta `201` se ampliará en US01_c** → se asume: cada parte de US01 actualiza el contrato con lo que añade, y los tipos generados lo reflejan.
- **Los `id` como UUID anticipan una decisión del modelo de datos de US01_b** → si US01_b decide otra cosa, el contrato se corrige en ese cambio (D1).
