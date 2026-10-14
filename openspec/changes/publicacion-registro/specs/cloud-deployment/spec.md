## MODIFIED Requirements

### Requirement: Registro cerrado en producción
Hasta el cambio que implemente el login (US02), CloudFront MUST responder a toda petición a `/api/auth/*` con `404`, con el cuerpo de error común (`{ "success": false, "error": { "code": "NOT_FOUND", "message": … } }`) y sin reenviarla al backend. El cierre MUST implementarse solo en la infraestructura, de modo que abrirlo no cambie el código de la aplicación. Las rutas de la SPA (`/registro`, `/privacidad`) MUST seguir cargándose.

#### Scenario: Registro cerrado
- **GIVEN** el entorno desplegado
- **WHEN** se hace `POST https://app.calendarschools.es/api/auth/register` con un cuerpo válido
- **THEN** la respuesta es `404` con el código `NOT_FOUND`
- **AND** la Lambda no recibe la petición y no se crea ningún dato

#### Scenario: Renovación cerrada
- **WHEN** se hace `POST https://app.calendarschools.es/api/auth/refresh`
- **THEN** la respuesta es `404` con el código `NOT_FOUND`

#### Scenario: El resto de la API sigue abierta
- **WHEN** se hace `GET https://app.calendarschools.es/api/municipalities`
- **THEN** la petición llega al backend y responde `200`

### Requirement: Copias de seguridad diarias
Un workflow programado MUST, cada día y en este orden: borrar de producción los intentos de `rate_limit_attempts` de más de 24 horas (requisito «Conservación máxima de los intentos» de `attempt-limiting`), hacer un `pg_dump` del esquema `public` por el *pooler* en modo sesión y guardarlo en un bucket de S3 privado, cifrado y con una regla que elimina los objetos de más de 30 días. Después MUST hacer `GET /api/health`, para que el proyecto tenga actividad diaria. Si la purga, el volcado o la subida fallan, el workflow MUST fallar y no se sube ningún fichero. La restauración de una copia en una base vacía MUST estar documentada y probada una vez.

#### Scenario: Copia diaria
- **WHEN** se ejecuta el workflow programado
- **THEN** aparece en S3 un fichero nuevo con la fecha en el nombre
- **AND** `GET /api/health` recibe `200`

#### Scenario: Purga antes del volcado
- **GIVEN** la tabla `rate_limit_attempts` de producción tiene intentos de hace 2 días y de hace 1 hora
- **WHEN** se ejecuta el workflow programado
- **THEN** los intentos de hace 2 días ya no están en la base de datos ni en la copia, y los de hace 1 hora siguen

#### Scenario: Purga fallida
- **GIVEN** la purga de intentos falla
- **WHEN** se ejecuta el workflow programado
- **THEN** el workflow falla y no se sube ningún fichero

#### Scenario: Retención
- **WHEN** se revisa la configuración del bucket
- **THEN** una regla de ciclo de vida elimina los objetos de más de 30 días

#### Scenario: Volcado fallido
- **GIVEN** la base de producción no responde
- **WHEN** se ejecuta el workflow programado
- **THEN** el workflow falla y no se sube ningún fichero

#### Scenario: Restauración
- **GIVEN** una copia descargada de S3
- **WHEN** se sigue la guía de restauración contra un PostgreSQL 17 vacío
- **THEN** la base restaurada contiene las tablas y los datos de la copia

## ADDED Requirements

### Requirement: Política de seguridad de contenidos
CloudFront MUST servir el frontend con la cabecera `Content-Security-Policy` en modo estricto (no `Report-Only`). La política MUST permitir scripts y marcos solo del propio origen y de los de reCAPTCHA (`https://www.google.com/recaptcha/`, `https://www.gstatic.com/recaptcha/` y, para marcos, `https://recaptcha.google.com/recaptcha/`), MUST NOT incluir `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`, y MUST incluir `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `frame-ancestors 'none'`. Las conexiones (`connect-src`) MUST limitarse al propio origen y a `https://www.google.com/recaptcha/`, porque el script de reCAPTCHA v3 envía desde la página una telemetría a esa ruta. La política MUST definirse en un único lugar del repositorio, y `vite preview` (que usa el E2E) MUST servir la misma cabecera.

#### Scenario: Cabecera en producción
- **GIVEN** el entorno desplegado
- **WHEN** se pide `https://app.calendarschools.es/registro`
- **THEN** la respuesta lleva `Content-Security-Policy` con las directivas exigidas y no lleva `Content-Security-Policy-Report-Only`

#### Scenario: reCAPTCHA permitido
- **GIVEN** el entorno desplegado con las claves de sitio reales y el registro cerrado
- **WHEN** se rellena el formulario de registro, se acepta la política y se envía
- **THEN** el script de reCAPTCHA se carga y obtiene un token sin ninguna violación de CSP en la consola
- **AND** la petición de registro recibe `404 NOT_FOUND` de CloudFront

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
