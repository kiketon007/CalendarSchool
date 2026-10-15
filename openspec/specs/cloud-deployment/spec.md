# cloud-deployment Specification

## Purpose
Define el despliegue de CalendarSchool en AWS: infraestructura como código con CDK, mismo origen por HTTPS en el dominio propio, `/api/auth/*` abierto en producción (registro y login, sin función de cierre en CloudFront), despliegue continuo y rollback desde GitHub Actions con OIDC, secretos, logs, base de datos gestionada y copias de seguridad. Origen: cambio `despliegue-aws`.
## Requirements
### Requirement: Infraestructura como código
La infraestructura de AWS MUST definirse con AWS CDK en TypeScript en el workspace `infrastructure/` y desplegarse en `eu-central-1`, salvo el certificado de ACM de CloudFront, que MUST crearse en `us-east-1`. El nombre del entorno (`prod`) MUST ser un parámetro de la infraestructura y formar parte del nombre de los recursos y de la ruta de los parámetros de SSM. Supabase y los DNS de DonDominio MUST quedar fuera de CDK, con pasos manuales documentados.

#### Scenario: Plantilla sintetizada
- **GIVEN** el workspace `infrastructure/`
- **WHEN** se ejecutan sus tests (aserciones sobre la plantilla sintetizada)
- **THEN** la plantilla contiene la distribución de CloudFront, el bucket del frontend, la HTTP API, la Lambda `nodejs24.x`, el grupo de logs y los roles de OIDC
- **AND** todos los recursos regionales están en `eu-central-1` salvo el certificado, que está en `us-east-1`

#### Scenario: Otro entorno
- **GIVEN** el parámetro de entorno con el valor `staging`
- **WHEN** se sintetiza la infraestructura
- **THEN** los nombres de los recursos y la ruta de los parámetros de SSM usan `staging` en lugar de `prod`, sin cambiar el código

### Requirement: Mismo origen por HTTPS en el dominio propio
CloudFront MUST servir la aplicación en `https://app.calendarschools.es`, con el certificado de ACM, y MUST redirigir HTTP a HTTPS. CloudFront MUST servir el frontend desde un bucket de S3 privado, al que solo accede CloudFront (OAC), y MUST redirigir `/api/*` a la HTTP API sin caché y con todas las cabeceras, cookies y parámetros del visitante salvo `Host`. Una ruta de la SPA que no corresponde a un fichero MUST devolver `index.html` con `200`. Las rutas bajo `/api/` y los ficheros estáticos MUST NOT reescribirse.

#### Scenario: Página inicial
- **GIVEN** un despliegue completado
- **WHEN** se abre `https://app.calendarschools.es`
- **THEN** se carga la página inicial

#### Scenario: Recarga en una ruta de la SPA
- **GIVEN** un despliegue completado
- **WHEN** se recarga `https://app.calendarschools.es/registro`
- **THEN** la respuesta es `200` con `index.html` y la aplicación pinta la página de registro

#### Scenario: Salud desde el mismo origen
- **GIVEN** un despliegue completado y la base de datos disponible
- **WHEN** se hace `GET https://app.calendarschools.es/api/health`
- **THEN** la respuesta es `200` con `{ "success": true, "data": { "status": "ok", "database": "up" } }`

#### Scenario: Ruta de la API desconocida
- **WHEN** se hace `GET https://app.calendarschools.es/api/no-existe`
- **THEN** la respuesta es la del backend, `404` con el código `NOT_FOUND` en JSON, y no `index.html`

#### Scenario: HTTP
- **WHEN** se abre `http://app.calendarschools.es`
- **THEN** CloudFront redirige a `https://app.calendarschools.es`

#### Scenario: Bucket privado
- **WHEN** se pide un fichero del frontend directamente a la URL del bucket de S3
- **THEN** S3 rechaza la petición

### Requirement: Despliegue continuo desde main
Un workflow de GitHub Actions MUST desplegar en cada push a `main`, y solo si los jobs `quality` y `e2e` han pasado en esa ejecución, en este orden: build, migraciones, despliegue de la infraestructura y del backend, publicación del frontend en S3, invalidación de CloudFront y smoke test de `GET /api/health` contra `https://app.calendarschools.es`. Si un paso falla, los siguientes MUST NOT ejecutarse y el workflow MUST fallar. Dos despliegues MUST NOT ejecutarse a la vez: el segundo espera al primero.

#### Scenario: Push a main con CI en verde
- **GIVEN** un push a `main` con `quality` y `e2e` en verde
- **WHEN** se ejecuta el workflow
- **THEN** se despliegan backend y frontend sin pasos manuales
- **AND** el smoke test recibe `200` con `"database": "up"`

#### Scenario: CI en rojo
- **GIVEN** un push a `main` en el que `quality` o `e2e` falla
- **WHEN** termina la ejecución
- **THEN** no se despliega nada

#### Scenario: Pull request
- **WHEN** se ejecuta CI por una pull request
- **THEN** no se despliega nada

#### Scenario: Smoke test fallido
- **GIVEN** un despliegue tras el cual `GET /api/health` no responde `200`
- **WHEN** se ejecuta el smoke test
- **THEN** el workflow falla y lo indica en su resultado

### Requirement: Migraciones antes de publicar el backend
El workflow MUST aplicar `prisma migrate deploy` a la base de producción con el usuario propietario del esquema, por el *pooler* en modo sesión, antes de publicar el nuevo backend. Si la migración falla, MUST NOT publicarse ni el backend ni el frontend, y MUST seguir en servicio la versión anterior. Toda migración MUST ser compatible con la versión anterior del código (patrón *expand/contract*).

#### Scenario: Migración nueva
- **GIVEN** un push a `main` que añade una migración
- **WHEN** se ejecuta el workflow
- **THEN** la migración queda aplicada antes de que se despliegue la Lambda

#### Scenario: Migración fallida
- **GIVEN** una migración que falla al aplicarse
- **WHEN** se ejecuta el workflow
- **THEN** el workflow se detiene sin desplegar
- **AND** `GET /api/health` sigue respondiendo con la versión anterior

### Requirement: Rollback por referencia
El workflow de despliegue MUST poder lanzarse a mano (`workflow_dispatch`) con la referencia de un commit de `main`, y MUST desplegar esa versión con los mismos pasos, incluido el smoke test, sin pasos manuales adicionales.

#### Scenario: Volver a un commit anterior
- **GIVEN** una versión desplegada
- **WHEN** se lanza el workflow con la referencia de un commit anterior de `main`
- **THEN** se despliega esa versión y el smoke test pasa

### Requirement: Credenciales de despliegue sin claves de larga duración
GitHub Actions MUST autenticarse en AWS por OIDC, con roles de IAM cuya política de confianza solo admite este repositorio y el entorno `prod` de GitHub. El entorno `prod` MUST admitir solo la rama `main`. El repositorio y los secretos de GitHub MUST NOT contener claves de acceso de AWS. El rol de las copias de seguridad MUST limitarse a escribir en su bucket.

#### Scenario: Ningún secreto de AWS en GitHub
- **WHEN** se revisan los secretos del repositorio y del entorno `prod`
- **THEN** no hay ninguna `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY`

#### Scenario: Otra rama
- **GIVEN** un workflow lanzado desde una rama distinta de `main`
- **WHEN** intenta asumir el rol de despliegue
- **THEN** AWS lo rechaza

### Requirement: Secretos fuera del repositorio
Los secretos de producción (`DATABASE_URL`, `JWT_SECRET`, `RECAPTCHA_V3_SECRET`, `RECAPTCHA_V2_SECRET` y `ORIGIN_VERIFY_SECRET`) MUST guardarse como parámetros `SecureString` de SSM bajo la ruta del entorno (`/calendarschool/prod/`). La cadena de conexión de las migraciones y copias MUST guardarse como secreto del entorno `prod` de GitHub. Ningún fichero versionado MUST contener credenciales de AWS, Supabase o reCAPTCHA. Los secretos MUST NOT aparecer en la plantilla de CloudFormation en claro, salvo el valor de la cabecera de origen, que la distribución de CloudFront necesita y que el workflow lee de SSM en cada despliegue.

#### Scenario: Repositorio sin credenciales
- **WHEN** se buscan en los ficheros versionados cadenas de conexión con contraseña, secretos de reCAPTCHA o claves de AWS
- **THEN** no aparece ninguna

#### Scenario: Una sola fuente del secreto de origen
- **GIVEN** el parámetro `ORIGIN_VERIFY_SECRET` de SSM cambia
- **WHEN** se ejecuta el siguiente despliegue y la Lambda arranca en frío
- **THEN** CloudFront envía el valor nuevo y la Lambda lo acepta

### Requirement: Logs en CloudWatch
La Lambda MUST escribir sus logs como JSON de pino en un grupo de logs de CloudWatch con una retención de 30 días.

#### Scenario: Retención
- **WHEN** se revisa el grupo de logs de la función
- **THEN** su retención es de 30 días

#### Scenario: Error registrado
- **GIVEN** el backend desplegado
- **WHEN** una petición produce un error no controlado
- **THEN** el log de CloudWatch contiene una línea JSON de pino con el error, y la respuesta no lo expone

### Requirement: Base de datos gestionada protegida
La base de producción MUST estar en un proyecto de Supabase en Fráncfort con SSL obligatorio y la *Data API* desactivada. La Lambda MUST conectarse por el *pooler* en modo transacción con un usuario de aplicación que solo tiene privilegios de lectura y escritura sobre las tablas de `public` (ni `CREATE` ni `ALTER` ni `DROP`) y un `statement_timeout` propio. Las migraciones MUST usar el usuario propietario del esquema. La creación del usuario de aplicación MUST estar en un script SQL versionado sin contraseñas.

#### Scenario: Conexión sin TLS
- **WHEN** se intenta conectar a la base de producción sin TLS
- **THEN** la conexión se rechaza

#### Scenario: Usuario de aplicación sin privilegios de esquema
- **GIVEN** una conexión con el usuario de aplicación
- **WHEN** se ejecuta `CREATE TABLE` o `ALTER TABLE` en `public`
- **THEN** PostgreSQL lo rechaza por falta de privilegios

#### Scenario: Tablas de migraciones nuevas
- **GIVEN** una migración aplicada con el usuario propietario que crea una tabla
- **WHEN** el usuario de aplicación lee y escribe en ella
- **THEN** tiene permiso sin ningún paso manual (privilegios por defecto)

#### Scenario: Data API desactivada
- **WHEN** se llama a la URL REST del proyecto de Supabase
- **THEN** no devuelve datos de `public`

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

