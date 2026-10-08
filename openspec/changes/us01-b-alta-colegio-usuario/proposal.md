## Why

US01_a dejó definido el contrato de `POST /api/auth/register`, pero el endpoint no existe: el backend solo tiene `GET /api/health` y no hay tablas de dominio. US01_b es la primera parte con lógica de negocio: permite que un visitante cree su colegio y su cuenta de administrador de forma atómica y segura, y es el requisito previo de US01_c (sesión), US01_d (límite de intentos) y US01_e (reCAPTCHA).

## What Changes

- **Modelo de datos (Prisma + migración):** tablas `municipalities` (datos fijos del INE cargados por la migración), `schools` (con `normalizedName` y unicidad `(normalizedName, municipalityCode)`) y `users` (rol `ADMIN`/`MEMBER`, estado `ACTIVE`/`SUSPENDED`/`DELETED`, email único). `access_links` queda fuera: la crean US02_b y US02_c.
- **Endpoint `POST /api/auth/register`:** ejecuta los pasos 3 a 5 del orden de procesamiento (validación del payload `400` → email existente `409` → colegio existente `409` → alta atómica `201`), con Zod, normalización NFC, email en minúsculas y sin espacios, hash Bcrypt cost 12 asíncrono e identificadores UUIDv7.
- **Endpoint público `GET /api/municipalities`:** lista cacheable de municipios (código INE, nombre oficial y provincia), única fuente de verdad del formulario y de la validación del backend.
- **Puerto de verificación del captcha** con adaptador provisional que acepta cualquier token; US01_e lo sustituye.
- **Eventos de log estructurados** `USER_REGISTER_SUCCESS`, `USER_REGISTER_FAILED` y `USER_REGISTER_DUPLICATE` (`reason` `EMAIL` o `SCHOOL`), con email enmascarado, IP y user agent, y `redact` de la contraseña en pino.
- **Contrato (`docs/api-spec.yml`):** `RegisterRequest.municipalityCode`, `RegisteredSchool.municipality`, `409 SCHOOL_ALREADY_REGISTERED`, nuevo código `SCHOOL_ALREADY_REGISTERED` en `ErrorCode` y en `ERROR_CODES`, y `GET /api/municipalities`. Se regeneran los tipos del frontend.
- **Frontend:** página de registro con buscador de municipios, validación inline accesible (`aria-describedby`, `role="alert"`) con las mismas reglas que el backend, envío de un token de captcha fijo y mensaje de confirmación tras el alta (US01_c lo cambiará). Textos por i18n (`es.json`, `en.json`).
- **E2E:** `scripts/e2e.mjs` vacía las tablas del esquema `public` de `calendarschool_test` (salvo `_prisma_migrations`) antes de arrancar el backend; es la primera parte que escribe datos en los E2E.
- **Documentación:** `MODELO_DATOS.md` pasa de «diseño» a «implementado» para `municipalities`, `schools` y `users`.

## Capabilities

### New Capabilities

- `municipality-catalog`: tabla de municipios de la Comunitat Valenciana (datos fijos del INE) y endpoint público `GET /api/municipalities`.

### Modified Capabilities

- `user-registration`: pasa de ser solo contrato a implementar el alta atómica de colegio y usuario (validación, unicidad de email y de colegio, hash, UUIDv7, logs y formulario); amplía el contrato con el municipio y `SCHOOL_ALREADY_REGISTERED`.
- `test-infrastructure`: limpieza de los datos del E2E antes de cada ejecución.

## Impact

- **Backend:** nuevas features `registration` y `municipalities` en las cuatro capas DDD; `app.ts` monta `/api/auth` y `/api/municipalities`; `AppDependencies` añade los puertos del registro. Nueva dependencia de hash Bcrypt compatible con AWS Lambda y de generación de UUIDv7.
- **Base de datos:** una migración Prisma nueva (tablas, enums, índices y carga de municipios).
- **API:** `docs/api-spec.yml` y `backend/src/presentation/http/appError.ts` (`appError.test.ts` exige que coincidan); `frontend/src/api/generated/schema.ts` regenerado.
- **Frontend:** página y ruta de registro, componentes del formulario y claves i18n.
- **Pruebas e infraestructura:** `scripts/e2e.mjs`, Cypress y tests de seguridad (SQLi, XSS) y accesibilidad.
- **Referencias:** US01_b (CA2, CA3, CA4, CA6, CA8, CA11, CA12, CA13) de `docs/User_Stories_MVP.md`; PRD §3.1.

### Fuera de alcance

Límite de intentos (US01_d), verificación real de reCAPTCHA y widget (US01_e), resiliencia del formulario en el navegador (US01_f), inicio de sesión, cookies y redirección a Onboarding (US01_c), invitación de otros usuarios y tabla `access_links` (US02_b), verificación de email (fuera del MVP) y la prueba de carga de 1000 registros (aplazada a tener el entorno desplegado).
