## ADDED Requirements

### Requirement: API de autenticación abierta en producción
CloudFront MUST reenviar al backend las peticiones a `/api/auth/*` como al resto de `/api/*`, sin ninguna CloudFront Function que las intercepte. La apertura MUST desplegarse solo cuando el E2E de vuelta a la sesión (capacidad `user-login`) pasa y la revisión legal del texto de `/privacidad` está confirmada. El smoke test del despliegue MUST comprobar, además de `GET /api/health`, que `POST /api/auth/login` con un cuerpo vacío y el `Origin` de la aplicación llega al backend y responde `400 VALIDATION_ERROR`, sin crear datos ni contar intentos. Las rutas de la SPA (`/registro`, `/login`, `/privacidad`) MUST seguir cargándose.

#### Scenario: Login accesible
- **GIVEN** el entorno desplegado
- **WHEN** se hace `POST https://app.calendarschools.es/api/auth/login` con `{}` y el `Origin` de la aplicación
- **THEN** la respuesta es `400` con el código `VALIDATION_ERROR` del backend
- **AND** no se guarda ningún intento en `rate_limit_attempts`

#### Scenario: Smoke test de la apertura
- **WHEN** se ejecuta el smoke test tras un despliegue
- **THEN** comprueba `GET /api/health` y `POST /api/auth/login`, y falla si este último responde `404` u otro código distinto de `400 VALIDATION_ERROR`

#### Scenario: Rutas de la SPA
- **WHEN** se recarga `https://app.calendarschools.es/login`
- **THEN** la respuesta es `200` con `index.html` y la aplicación pinta la página de inicio de sesión

## MODIFIED Requirements

### Requirement: Política de seguridad de contenidos
CloudFront MUST servir el frontend con la cabecera `Content-Security-Policy` en modo estricto (no `Report-Only`). La política MUST permitir scripts y marcos solo del propio origen y de los de reCAPTCHA (`https://www.google.com/recaptcha/`, `https://www.gstatic.com/recaptcha/` y, para marcos, `https://recaptcha.google.com/recaptcha/`), MUST NOT incluir `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`, y MUST incluir `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `frame-ancestors 'none'`. Las conexiones (`connect-src`) MUST limitarse al propio origen y a `https://www.google.com/recaptcha/`, porque el script de reCAPTCHA v3 envía desde la página una telemetría a esa ruta. La política MUST definirse en un único lugar del repositorio, y `vite preview` (que usa el E2E) MUST servir la misma cabecera.

#### Scenario: Cabecera en producción
- **GIVEN** el entorno desplegado
- **WHEN** se pide `https://app.calendarschools.es/registro` o `https://app.calendarschools.es/login`
- **THEN** la respuesta lleva `Content-Security-Policy` con las directivas exigidas y no lleva `Content-Security-Policy-Report-Only`

#### Scenario: reCAPTCHA permitido
- **GIVEN** el entorno desplegado con las claves de sitio reales
- **WHEN** se envía el formulario de inicio de sesión con un email no registrado
- **THEN** el script de reCAPTCHA se carga y obtiene un token sin ninguna violación de CSP en la consola
- **AND** la petición de login recibe la respuesta del backend (`401 INVALID_CREDENTIALS`, o `422 CAPTCHA_CHALLENGE_REQUIRED` si el score es bajo) sin crear datos

#### Scenario: Script de otro origen bloqueado
- **GIVEN** una página servida con la política
- **WHEN** se intenta cargar un script de un origen que no es el propio ni el de reCAPTCHA, o un script en línea
- **THEN** el navegador lo bloquea

#### Scenario: Misma política en el E2E
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** `vite preview` sirve la página con la misma `Content-Security-Policy` que CloudFront y los tests pasan sin violaciones de CSP

#### Scenario: La aplicación no se puede enmarcar
- **WHEN** otra web intenta mostrar la aplicación en un `iframe`
- **THEN** el navegador lo impide por `frame-ancestors 'none'`

## REMOVED Requirements

### Requirement: Registro cerrado en producción
**Reason**: el cierre existía porque sin inicio de sesión un usuario registrado no podría volver a entrar; con US02 implementado, se abre `/api/auth/*`.
**Migration**: se elimina la CloudFront Function `apiGuard.js` y su asociación al comportamiento `/api/*`; el smoke test pasa a comprobar `POST /api/auth/login` → `400 VALIDATION_ERROR` (requisito «API de autenticación abierta en producción»).
