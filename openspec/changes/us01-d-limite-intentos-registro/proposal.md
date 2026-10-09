## Why

`POST /api/auth/register` no tiene ningún límite: cualquiera puede lanzar altas automatizadas o usar el formulario para averiguar en masa qué emails y colegios están registrados (el `409` lo revela). US01_d añade el paso 1 del orden de procesamiento de US01: como máximo 5 intentos de registro por IP cada 15 minutos. Junto con el reCAPTCHA (US01_e), es requisito para publicar el registro en producción. El login (US02 CA6) y la aceptación de invitaciones (US02_b, US02_c) piden «el mismo mecanismo», así que conviene construirlo ya como pieza reutilizable.

## What Changes

- **Limitador de intentos genérico:** cuenta los intentos por clave (`<operación>:<ip>`) en una ventana deslizante y rechaza el que supera el máximo con el tiempo de espera. Los intentos se guardan en PostgreSQL, compartidos entre instancias (AWS Lambda), y se serializan por clave para que dos peticiones simultáneas no superen el límite. Un intento rechazado no cuenta. Si la base de datos no responde, se rechaza (`503`), nunca se deja pasar.
- **Límite del registro:** 5 intentos por IP cada 15 minutos, contando todos los que llegan al endpoint (también los de un email ya registrado). El sexto responde `429 TOO_MANY_REQUESTS` con `Retry-After`, sin verificar el captcha, validar el payload ni consultar la base de datos de usuarios y colegios. Se registra el evento `USER_REGISTER_RATE_LIMITED`.
- **IP real del cliente:** `TRUST_PROXY_HOPS` configura cuántos proxies de confianza hay delante del backend (`trust proxy` de Express), de modo que la IP sale de `X-Forwarded-For` sin que el cliente pueda falsearla. En local vale `0`; el valor de producción lo fija `despliegue-aws`.
- **Máximo configurable:** `REGISTRATION_ATTEMPTS_MAX` (por defecto 5). El E2E lo sube, porque todas sus peticiones llegan desde la misma IP; el límite real se prueba en los tests de integración con PostgreSQL.
- **Modelo de datos (Prisma + migración):** tabla `rate_limit_attempts` (clave, instante del intento).
- **Frontend:** el `429` deja de mostrarse como error genérico. El formulario avisa de que se ha superado el número de intentos y de cuántos minutos esperar, y conserva los datos salvo la contraseña. Textos por i18n.
- **Contrato (`docs/api-spec.yml`):** la descripción del `429` del registro indica el límite (5 intentos por IP cada 15 minutos). El esquema ya existía desde US01_a; se regeneran los tipos por el cambio de descripción.
- **Documentación:** `MODELO_DATOS.md`, `README.md`, `CLAUDE.md` y la historia de usuario (decisiones pendientes de US01_d resueltas).

## Capabilities

### New Capabilities

- `attempt-limiting`: limitador de intentos por clave con ventana deslizante, persistido en PostgreSQL, serializado por clave, con `Retry-After`, que falla cerrado; y obtención de la IP real del cliente detrás de proxies de confianza. Lo reutilizarán US02, US02_b y US02_c.

### Modified Capabilities

- `user-registration`: el registro aplica el límite de intentos como paso 1 (`429` con `Retry-After` y evento `USER_REGISTER_RATE_LIMITED`), y el formulario muestra el aviso de demasiados intentos en lugar del mensaje genérico.
- `app-configuration`: nuevas variables opcionales `TRUST_PROXY_HOPS` y `REGISTRATION_ATTEMPTS_MAX` validadas al arrancar.
- `test-infrastructure`: el E2E arranca el backend con un máximo de intentos alto para que sus registros no choquen con el límite.

## Impact

- **Backend:** nueva feature `attempts` en las cuatro capas DDD (puerto `AttemptRepository`, servicio `AttemptLimiter`, error `TooManyAttempts`); un caso de uso del registro que aplica el límite y registra el evento; un middleware en `POST /api/auth/register` antes del handler; `errorHandler` traduce `TooManyAttempts` a `429` con `Retry-After`; `createApp` aplica `trust proxy`. Sin dependencias nuevas.
- **Base de datos:** una migración Prisma nueva (`rate_limit_attempts`).
- **API:** solo la descripción del `429` del registro; `TOO_MANY_REQUESTS` ya está en `ErrorCode` y en `ERROR_CODES`. `frontend/src/api/generated/schema.ts` regenerado.
- **Frontend:** `registrationService` (nuevo resultado `tooManyRequests`), `RegisterPage` y claves i18n.
- **Pruebas e infraestructura:** tests de integración del límite real y de la concurrencia, E2E con `cy.intercept` para el aviso, `REGISTRATION_ATTEMPTS_MAX` en `scripts/e2e.mjs`.
- **Referencias:** US01_d (CA9) de `docs/User_Stories_MVP.md`; PRD §3.1; orden de procesamiento de US01.

### Fuera de alcance

Límite por «fingerprint» del navegador (no está definido y el cliente lo puede falsear: el límite es solo por IP), límite del login (US02) y de las invitaciones (US02_b, US02_c), que reutilizarán este mecanismo, cabecera secreta entre CloudFront y API Gateway para impedir que se llame a la API sin pasar por CloudFront (`despliegue-aws`), reglas de tasa en AWS WAF, limpieza programada de la tabla de intentos, reCAPTCHA real (US01_e) y resiliencia del formulario (US01_f).
