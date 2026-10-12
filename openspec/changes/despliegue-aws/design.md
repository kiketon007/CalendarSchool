## Context

`main` tiene el esqueleto de US00 y el registro completo de US01, pero solo se ejecuta en local y en CI. US00_b se rehízo el 2026-10-11 tras la exploración `despliegue-aws`, con estas decisiones de partida: Supabase gratuito en lugar de RDS, `eu-central-1`, el dominio `app.calendarschools.es` en DonDominio, coste fijo cercano a 0 y el registro cerrado hasta `publicacion-registro`.

**Estado actual relevante:**

- **Puntos de entrada:** `server.ts` es el único. Compone todas las dependencias (unas 40 líneas de cableado) y `test/support/realApp.ts` repite ese cableado para los tests de integración.
- **Configuración:** `loadConfig` exige con `NODE_ENV=production` los secretos de reCAPTCHA, `JWT_SECRET` y `APP_ORIGIN`. Un `ConfigError` sale como una traza de Node, no como JSON (tarea heredada).
- **Cliente de base de datos:** `createPrismaClient` crea `PrismaPg` sin `max`, sin `connectionTimeoutMillis` y sin TLS (tarea heredada).
- **Prisma:** `prisma` es dependencia de desarrollo y el `postinstall` ejecuta `prisma generate` (tarea heredada: no hay instalación de producción posible con `--omit=dev`).
- **IP del cliente:** `createApp` aplica `trust proxy` con `TRUST_PROXY_HOPS`, y el código de error `ORIGIN_NOT_ALLOWED` (`403`) ya existe en el contrato.
- **PostgreSQL:** local y CI usan PostgreSQL 18, y las migraciones no usan nada exclusivo de la 18 (el UUIDv7 lo genera la aplicación).

**Restricciones comprobadas antes del diseño (2026-10-11):**

- **Versión de PostgreSQL:** Supabase crea los proyectos nuevos con PostgreSQL 17.
- **Pausa del plan gratuito:** Supabase pausa los proyectos gratuitos con poca actividad de consultas en 7 días. Unas pocas consultas diarias bastan, y abrir una conexión sin consultar no cuenta.
- **Sentencias preparadas:** `@prisma/adapter-pg` solo da nombre a las sentencias si se configura `statementNameGenerator` (`dist/index.mjs`, `name: this.pgOptions?.statementNameGenerator?.(query)`). Por defecto son anónimas, compatibles con el modo transacción de Supavisor.
- **Cuenta de AWS:** está creada y vacía, y su cuota de concurrencia de Lambda puede ser la inicial de 10.

Historia de referencia: US00_b de `docs/User_Stories_MVP.md`.

## Goals / Non-Goals

**Goals:**

- Desplegar `main` en `https://app.calendarschools.es` sin pasos manuales tras la puesta en marcha inicial, con migraciones explícitas, smoke test y rollback.
- Cerrar las dos vías de falsear la IP (la llamada directa a API Gateway y un `X-Forwarded-For` escrito por el cliente) y medir `TRUST_PROXY_HOPS`.
- Que ningún secreto esté en el repositorio ni en claro en CloudFormation, salvo el de la cabecera de origen, que CloudFront necesita (ver D6).
- Copias de seguridad propias y actividad diaria en Supabase, con coste fijo cercano a 0.
- Resolver las tres tareas heredadas de US00.

**Non-Goals:**

- Abrir el registro, CSP, consentimiento y prueba del secreto v2 (`publicacion-registro`).
- `staging`, WAF, VPC, Redis, SQS y X-Ray.
- Supabase y DNS como código.

## Decisions

### D1. Workspace `infrastructure/` con dos stacks de CDK

`infrastructure/` es un tercer workspace de npm (`@calendarschool/infrastructure`), con TypeScript estricto, ESLint y Prettier como los otros y tests con Vitest y `aws-cdk-lib/assertions`. `bin/app.ts` recibe el entorno (`prod`) por contexto (`-c env=prod`) e instancia:

- **`CalendarSchool-<env>-Certificate`** (`us-east-1`): el certificado de ACM de `app.calendarschools.es` con validación por DNS. Como no hay zona de Route 53, CloudFormation espera a que el CNAME de validación exista en DonDominio.
- **`CalendarSchool-<env>-App`** (`eu-central-1`):
  - Bucket del frontend, privado, con OAC.
  - Lambda, HTTP API y grupo de logs.
  - Distribución de CloudFront con sus dos funciones.
  - Bucket de copias.
  - Roles de OIDC de despliegue y de copias, con el proveedor OIDC de GitHub.
  - Usa el certificado con `crossRegionReferences: true`.

- **Nombre del dominio:** el dominio registrado es `calendarschools.es` (con *s* final) y la aplicación se sirve en `app.calendarschools.es`. Durante la redacción del cambio se usó por error `calendarschool.es`, que no existe en DNS; se detectó en la tarea 12.4, al comprobar que `a.nic.es` no conocía el dominio, y se corrigió en todos los artefactos, el código y la documentación antes de crear nada en AWS que dependiera de él.

Los nombres llevan el entorno, y la ruta de SSM es `/calendarschool/<env>/`. La cuenta y la región salen del perfil de la CLI, y los IDs de cuenta no se versionan.

Alternativas descartadas:

- *Serverless Framework (§11):* desde la v4 exige cuenta y licencia en su servicio, y la historia pide no depender de cuentas externas a AWS.
- *SAM o Terraform:* CDK usa el mismo lenguaje que el resto del repo y se prueba con Vitest.
- *Un único stack en `us-east-1`:* sacaría los datos de la UE.

### D2. Adaptador de Lambda: `serverless-http`

`lambda.ts` envuelve la app de Express con `serverless-http`. La librería admite eventos de la HTTP API 2.0: traduce `cookies`, el cuerpo en base64 y las cabeceras. **Matiz (spike, tarea 2.2):** solo devuelve `Set-Cookie` en `cookies` cuando Express lo escribe como array; con una cadena, como hacen nuestros routers, lo deja en `headers['set-cookie']`, y la HTTP API 2.0 junta en una sola las cabeceras repetidas. Por eso `lambda.ts` no usa `serverless(app)` directamente, sino `createLambdaHandler(app)` (`presentation/lambda/lambdaAdapter.ts`), que mueve `set-cookie` de `headers` a `cookies`. Los routers no cambian.

- **Primera tarea:** un test con un evento 2.0 real contra una app con dobles fija el comportamiento que necesitamos: `GET /api/health`, un `POST` JSON en base64 y una cookie de respuesta (spec `serverless-runtime`).
- **Plan alternativo:** si `serverless-http` no funciona con Express 5, se cambia a `@codegenie/serverless-express`. Solo cambia `lambda.ts` y el test.

Alternativas descartadas:

- *AWS Lambda Web Adapter:* sustituiría el handler por un servidor HTTP en una capa. Exige ejecutar `server.ts` dentro de Lambda y una capa de un tercero.
- *Reescribir los handlers como funciones Lambda:* rompe la arquitectura de US00.

### D3. Empaquetado con esbuild en `x86_64`; `prisma` sigue en desarrollo

- **Empaquetado:** CDK `NodejsFunction` empaqueta `backend/src/lambda.ts` con esbuild en formato ESM (con el *banner* de `createRequire` para las dependencias CommonJS), con *source maps* y `NODE_OPTIONS=--enable-source-maps`.
- **Módulos nativos:** `@node-rs/bcrypt` es nativo y va en `nodeModules`, para que se instale el binario de la plataforma.
- **Arquitectura `x86_64`:** coincide con los *runners* de GitHub (`ubuntu-latest`, x64), de modo que `npm` instala el binario correcto sin compilación cruzada. `arm64` ahorraría un 20 % del coste por GB-s, que dentro del nivel gratuito es 0.
- **Cliente de Prisma:** se empaqueta desde el código generado. Si esbuild no resuelve el compilador de consultas WASM de `@prisma/client`, se añade también a `nodeModules`. Lo decide la tarea de empaquetado con un arranque del bundle en local (`node -e "import('./index.mjs')"` con un evento de prueba).
- **Resultado de la tarea 8.8:** el bundle (8 MB sin minificar, con la CA copiada y `@node-rs/bcrypt` en `node_modules`) arranca en local en unos 220 ms. El cliente de Prisma se empaqueta sin `nodeModules`: la consulta `SELECT 1` se ejecutó con el compilador de consultas dentro del bundle, así que `@prisma/client` no hace falta en `nodeModules`. Con un PostgreSQL local con TLS y un certificado de otra CA, la conexión se rechazó (`unable to verify the first certificate`); con la CA correcta, `GET /api/health` respondió `200`.
- **Binario de Bcrypt según la plataforma:** `nodeModules` instala con `npm` en la máquina que empaqueta, y desde Windows se subiría `bcrypt-win32-x64-msvc`. Por eso `bundling.environment` fija `npm_config_os=linux`, `npm_config_cpu=x64` y `npm_config_libc=glibc`, y la síntesis desde Windows instala `bcrypt-linux-x64-gnu`. Así el primer despliegue puede hacerse desde local sin sorpresas.
- **Tarea heredada «`prisma` en producción»:** se resuelve sin mover `prisma` a `dependencies`. Nunca se hace una instalación con `--omit=dev`, porque el bundle se construye en CI sobre `npm ci` completo y lleva dentro el cliente ya generado.

Alternativas descartadas:

- *`npm ci --omit=dev` y zip de `node_modules`:* exige mover `prisma` y arrastra el árbol completo de dependencias.
- *Imagen de contenedor:* ECR tiene coste fijo y empeora el arranque en frío.

### D4. Composición compartida (`backend/src/composeApp.ts`)

`composeApp(config, { logger, poolMax })` construye el cliente Prisma, los repositorios, los casos de uso y `createApp(...)`, y devuelve `{ app, prisma }`. Vive en la raíz de `src`, junto a `app.ts`: como `server.ts`, es raíz de composición y no pertenece a ninguna capa, porque conoce a todas.

- `server.ts` queda en `loadConfig` → `composeApp` → `listen`.
- `lambda.ts` queda en leer SSM → `loadConfig` → `composeApp` → `serverless(app)`.
- `realApp.ts` se reescribe sobre `composeApp` si sus opciones (`registrationAttemptsMax`, el verificador falso inyectado y el logger capturado) caben como parámetros opcionales. Si no caben sin complicar la firma, se mantiene aparte y se decide en la tarea. En cualquier caso, un test de integración compone con `composeApp` contra la base de test y llama a `GET /api/health`.
- **Decisión (tarea 6.4):** `realApp.ts` se reescribió sobre `composeApp`. Las opciones de los tests caben como parámetros opcionales (`prisma`, `now`, `captchaVerifier`) junto a `logger`, `poolMax` y `ssl`, y `composeApp` devuelve también `tokenIssuer`. A cambio, los tests de integración ejercitan exactamente el cableado de producción y no una copia. `server.ts` crea un logger de nivel `info` solo para el error de configuración y el definitivo con `LOG_LEVEL` ya validado.

### D5. Secretos en SSM Parameter Store, leídos al arrancar en frío

- **Dónde se guardan:** los cinco secretos son parámetros `SecureString` de nivel estándar (gratuitos, cifrados con la clave `aws/ssm`) en `/calendarschool/prod/<VARIABLE>`. Se crean a mano con la CLI (`aws ssm put-parameter --type SecureString`), porque CloudFormation no crea `SecureString`, y la guía lo documenta.
- **Lectura:** `infrastructure/aws/ssmEnvironment.ts` (`loadSsmEnvironment(client, path)`) hace `GetParametersByPath` con `WithDecryption` y paginación. Devuelve `{ NOMBRE: valor }` con el último segmento de cada parámetro y recibe el cliente inyectado.
- **Uso en `lambda.ts`:** combina el resultado con `{ ...process.env, ...ssm }` (prevalece SSM) mediante *top-level await*, que en ESM se ejecuta durante la inicialización de Lambda, una vez por instancia.
- **Permisos de la Lambda:** `ssm:GetParametersByPath` sobre esa ruta. El descifrado con `aws/ssm` no necesita permiso de KMS aparte.
- **Configuración que no es secreta:** va en variables de entorno de la función: `NODE_ENV`, `APP_ORIGIN`, `TRUST_PROXY_HOPS`, `LOG_LEVEL` y `SSM_PARAMETER_PATH`.

Alternativas descartadas:

- *Secrets Manager:* cuesta 0,40 $/mes por secreto, o 0,40 $ en total con un único JSON.
- *Variables de entorno con el valor en claro:* quedarían visibles en la consola y en la plantilla.
- *Extensión «AWS Parameters and Secrets» de Lambda:* añade una capa y una llamada HTTP local para el mismo resultado.

### D6. Verificación del origen con una cabecera secreta

- **Comprobación en el backend:** el middleware `presentation/http/requireOriginVerification.ts` es el primero de `createApp` (antes que `requestTimeout`). Solo se monta si `AppDependencies.originVerifySecret` está definido, y compara `X-Origin-Verify` con `crypto.timingSafeEqual` sobre los SHA-256 de los dos valores, para que la longitud no filtre nada. Si no coincide, lanza un `AppError` `403 ORIGIN_NOT_ALLOWED`, como `requireAllowedOrigin`, y registra un `warn` con la ruta y sin la cabecera.
- **Valor:** el secreto es `ORIGIN_VERIFY_SECRET` (D9) y vive en SSM (D5).
- **Envío desde CloudFront:** CloudFront lo añade como *custom header* del origen de API Gateway. Como el valor tiene que estar en la configuración de la distribución, entra como `CfnParameter` con `noEcho: true`. El workflow lo lee de SSM (`aws ssm get-parameter --with-decryption`, enmascarado con `::add-mask::`) y lo pasa a `cdk deploy --parameters`. SSM es la única fuente del valor.
- **Rotación:** se cambia el parámetro y se lanza el workflow. El despliegue actualiza la variable `ORIGIN_VERIFY_ROTATION` de la función con un *hash* corto del valor, lo que obliga a Lambda a crear instancias nuevas. Hasta que CloudFront propaga el cambio puede haber unos segundos de `403`, y es aceptable.

Alternativas descartadas:

- *Desactivar el endpoint `execute-api`:* CloudFront lo necesita como origen, salvo que se añada un dominio propio a API Gateway, con otro certificado regional y otro CNAME.
- *Lambda@Edge o firma SigV4 con OAC hacia Lambda:* OAC solo admite *function URLs*, no API Gateway, y Lambda@Edge añade coste y complejidad.
- *WAF:* tiene coste fijo.

### D7. Medición de `TRUST_PROXY_HOPS`

`requireOriginVerification` registra a nivel `debug` `{ ip: req.ip, forwardedFor: req.headers['x-forwarded-for'] }`. La IP se registra completa, según la regla de datos personales de US01.

La medición se hace una vez:

1. Se despliega con `LOG_LEVEL=debug` (contexto de CDK).
2. Se hace `curl -H 'X-Forwarded-For: 198.51.100.9' https://app.calendarschools.es/api/health`.
3. En CloudWatch se ve la cadena completa, por ejemplo `198.51.100.9, <IP del visitante>, <IP de CloudFront>`, junto a la IP del *socket* que pone `serverless-http`.
   Con el formato de log JSON, Lambda filtra por su propio nivel de aplicación (`INFO` por defecto) y descartaría el `debug` antes de escribirlo en CloudWatch, aunque `LOG_LEVEL=debug`. Por eso el stack fija el nivel de aplicación de Lambda en `TRACE` y deja que `LOG_LEVEL` sea la única fuente de verdad (lo descubrió la primera medición real).
4. Se fija el número de saltos para que `req.ip` sea la IP del visitante y se vuelve a `LOG_LEVEL=info`.

Se espera `2`: CloudFront añade la IP del visitante y API Gateway la del nodo de CloudFront. Pero el valor se mide, no se deduce. El resultado y la cadena observada se anotan en este diseño, y el smoke test comprueba después que la IP escrita por el cliente no gana (spec `serverless-runtime`, escenario «IP del visitante en producción»).

### D8. CloudFront: dos comportamientos y dos funciones

- **Comportamiento por defecto (S3):**
  - Orígenes y políticas: origen S3 con OAC, `CachingOptimized`, compresión, `PriceClass_100` (Europa y Norteamérica) y HTTP/2 y HTTP/3.
  - Cabeceras de seguridad gestionadas (HSTS, `X-Content-Type-Options` y `X-Frame-Options`), sin CSP, que es de `publicacion-registro`.
  - La CloudFront Function `spa-rewrite` (*viewer request*) cambia la URI a `/index.html` cuando el último segmento no tiene extensión.
- **Comportamiento `/api/*` (HTTP API):**
  - Políticas y métodos: todos los métodos, `CachingDisabled`, `AllViewerExceptHostHeader` y la cabecera `X-Origin-Verify` del origen.
  - La CloudFront Function `api-guard` (*viewer request*) responde `404` con el JSON común `NOT_FOUND` cuando la URI empieza por `/api/auth/`. Abrir el registro en `publicacion-registro` es quitar esa condición, sin tocar la aplicación.
- **Caché de los ficheros:** el workflow sube los ficheros con hash de `assets/` con `Cache-Control: public, max-age=31536000, immutable` y `index.html` con `no-cache`, e invalida `/index.html`.

Alternativas descartadas:

- *Respuestas de error personalizadas (403/404 → `index.html`):* también afectarían a los `404` de `/api/*`.
- *Cerrar el registro en Express con una variable:* añade código de aplicación que habría que retirar después.

### D9. Configuración: `ORIGIN_VERIFY_SECRET` y el log de `ConfigError`

- **Variable nueva:** `loadConfig` añade `ORIGIN_VERIFY_SECRET` (mínimo 32 caracteres, obligatoria en producción con la misma regla que los secretos de reCAPTCHA) y `AppConfig.originVerifySecret`. `createApp` lo recibe como dependencia opcional.
- **Log del error:** un helper probado `loadConfigOrLog(env, logger)` (`infrastructure/config.ts`) envuelve `loadConfig`. Ante un `ConfigError`, registra `logger.fatal({ invalidVariables }, 'Configuración inválida')` y relanza. El logger se crea antes de la configuración con nivel `info`, porque `LOG_LEVEL` aún no está validado.
- **Salida de cada punto de entrada:** `server.ts` captura y hace `process.exit(1)`, sin traza. `lambda.ts` deja que la excepción haga fallar la inicialización; Lambda añade su propio aviso de error, pero la línea de pino queda antes.

### D10. Conexión a Supabase

- **Cadena de conexión de la Lambda:** `DATABASE_URL` es `postgresql://calendarschool_app.<ref>:<pw>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`, en modo transacción y sin `sslmode`.
- **Verificación (tarea 12.2):** el host del *pooler* de este proyecto es `aws-1-eu-central-1.pooler.supabase.com` (no `aws-0`; el prefijo lo asigna Supabase y se copia del botón *Connect*). Una conexión con `rejectUnauthorized: true` y `supabase-ca.crt` llega a la autenticación en los puertos 5432 y 6543, así que la CA y el nombre del host se validan.
- **Opciones del pool:** `createPrismaClient` gana `poolMax`, `connectionTimeoutMillis` y `ssl` (opciones de `pg.PoolConfig` que acepta `PrismaPg`):

  | Punto de entrada | `max` | `connectionTimeoutMillis` | `ssl` |
  |---|---|---|---|
  | `server.ts` | por defecto (10) | 5000 | no (local) |
  | `lambda.ts` | 2 | 5000 | `{ ca: <CA de Supabase> }` |

- **TLS:** `ssl.ca` verifica la cadena y el nombre del host. La CA raíz de Supabase es pública y se versiona en `infrastructure/assets/supabase-ca.crt`; esbuild la copia al bundle con `commandHooks` y `lambda.ts` la lee con `readFileSync` junto al handler. Si el *pooler* presenta un certificado con otro nombre o de otra CA, la tarea de puesta en marcha lo detecta con `psql "sslmode=verify-full sslrootcert=…"` y se ajusta esta decisión antes de seguir. Nunca se usa `rejectUnauthorized: false`.
- **Funciones de PostgreSQL usadas:** `pg_advisory_xact_lock` (US01_d) es de transacción y funciona en modo transacción. La aplicación no usa nada de sesión: ni `SET`, ni `LISTEN`, ni bloqueos de sesión.
- **Usuario de aplicación:** lo crea `infrastructure/supabase/app-role.sql`, que se ejecuta una vez con `psql -v app_password=…` como `postgres` por el modo sesión:
  - Crea el rol `calendarschool_app` con `LOGIN`, `CONNECT` y `USAGE` en `public`.
  - Le da `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre todas las tablas y `USAGE` y `SELECT` sobre las secuencias, también para las tablas futuras con `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`.
  - Le quita todo sobre `_prisma_migrations`.
  - Fija `ALTER ROLE … SET statement_timeout = '9s'`, por debajo de los 10 s de la petición. El ajuste del rol se aplica también por el *pooler*, porque las conexiones del servidor van por rol.
  - Además revoca a `anon` y `authenticated` (los roles de la *Data API*) los privilegios sobre `public` y los privilegios por defecto que Supabase les concede, como defensa en profundidad aunque la *Data API* esté desactivada.
- **Orden y repetición:** `app-role.sql` se ejecuta después de la primera migración y es idempotente. Si se ejecutara antes, `_prisma_migrations` heredaría los privilegios por defecto del rol de aplicación al crearse; repetir el script los revoca. Verificado en PostgreSQL 17 local (con los roles `postgres`, `anon` y `authenticated` creados a mano): el rol lee y escribe, no puede `CREATE TABLE`, `ALTER TABLE` ni `DROP TABLE`, no puede leer `_prisma_migrations`, obtiene permisos sobre una tabla creada después por `postgres`, `statement_timeout` es `9s`, una segunda ejecución con otra contraseña rota la anterior, y `anon` y `authenticated` no tienen privilegios de tabla (conservan el `USAGE` sobre `public` que da el valor por defecto de PostgreSQL a `PUBLIC`, sin efecto sin privilegios de tabla).
- **Migraciones y copias:** usan `postgres.<ref>` por el modo sesión (`:5432`). Prisma (motor de esquemas) usa `sslmode=require`, que cifra pero no verifica la CA, porque su verificación exige una configuración de certificados de cliente que no aporta nada aquí. `pg_dump` usa `sslmode=verify-full` con la CA. Es una diferencia aceptada en una conexión saliente desde los *runners* de GitHub.

### D11. Workflows

- **`ci.yml`:** añade el job `deploy` con `needs: [quality, e2e]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, `uses: ./.github/workflows/deploy.yml` y `secrets: inherit`. Sus permisos son `id-token: write` y `contents: read`. Los contenedores de servicio pasan a `postgres:17`. El job `quality` ejecuta también los tests de `infrastructure` (`npm test` recorre los workspaces).
- **`deploy.yml`:** se dispara con `workflow_call` (entrada `ref`, por defecto el commit actual) y con `workflow_dispatch` (entrada `ref` obligatoria, para el rollback). Usa `environment: prod`, que solo admite `main`, y `concurrency: { group: deploy-prod, cancel-in-progress: false }`. Los pasos, en orden:
  1. `checkout` de `ref`, Node desde `.nvmrc` y `npm ci` con `CYPRESS_INSTALL_BINARY=0`.
  2. `npm run build`, con `VITE_RECAPTCHA_SITE_KEY_V3` y `_V2` como `vars` del entorno, que son públicas.
  3. `npm run db:migrate` con `DATABASE_URL=${{ secrets.MIGRATION_DATABASE_URL }}`.
  4. `aws-actions/configure-aws-credentials` con el rol de despliegue.
  5. Lectura del secreto de origen de SSM, enmascarado.
  6. `npx cdk deploy --all --require-approval never -c env=prod --parameters …`.
  7. `aws s3 sync` del `dist` con las cabeceras de D8 e invalidación de `/index.html`, con el bucket y el ID de la distribución tomados de las salidas del stack.
  8. Smoke test (`scripts/smoke.mjs`, con reintentos durante 2 minutos):
     - `GET /api/health` → `200` con `database: up`.
     - `POST /api/auth/register` → `404 NOT_FOUND`.
     - `GET <execute-api>/api/health` → `403 ORIGIN_NOT_ALLOWED`.
- **`backup.yml`:** se ejecuta con `schedule` diario (03:17 UTC) y `workflow_dispatch`, en `environment: prod` y con el rol de copias. Instala `postgresql-client-17` (repositorio PGDG) y llama al binario por su ruta versionada (`/usr/lib/postgresql/17/bin/pg_dump`), porque el `pg_dump` del `PATH` es un envoltorio de Debian que sigue eligiendo la versión 16 que trae el runner (lo descubrió la primera ejecución real). Ejecuta `pg_dump -Fc -n public --no-owner --no-privileges` con `secrets.MIGRATION_DATABASE_URL` y la CA. Sube el volcado a `s3://<bucket>/calendarschool-<AAAA-MM-DD>.dump`, con `set -euo pipefail` para que un fallo no suba un fichero vacío, y termina con `curl -f https://app.calendarschools.es/api/health`.
- **Roles de OIDC:** el proveedor `token.actions.githubusercontent.com` lo crea el stack, salvo que ya exista en la cuenta. Las políticas de confianza exigen `aud = sts.amazonaws.com` y `sub = repo:kiketon007@48519594/CalendarSchool@1366177326:environment:prod`. El repositorio tiene activado el *subject* inmutable de GitHub (`GET /repos/{repo}/actions/oidc/customization/sub` devuelve `use_immutable_subject: true`), así que el `sub` lleva los IDs del propietario (`48519594`) y del repositorio (`1366177326`) y sobrevive a un cambio de nombre; el formato clásico `repo:<propietario>/<repo>:environment:prod` no coincide y `sts:AssumeRoleWithWebIdentity` se rechaza (lo descubrió el primer despliegue automático).
  - **Rol de despliegue:** permisos para asumir los roles de *bootstrap* de CDK, `ssm:GetParameter` sobre el secreto de origen, `cloudformation:DescribeStacks`, `s3:*Object`/`ListBucket` sobre el bucket del frontend y `cloudfront:CreateInvalidation` sobre la distribución.
  - **Rol de copias:** solo `s3:PutObject` en su bucket.

Alternativas descartadas:

- *Disparar `deploy.yml` con `workflow_run`:* separa el despliegue de la ejecución de CI y complica saber qué commit se despliega.
- *Despliegue en el mismo `ci.yml` sin workflow reutilizable:* impide el rollback por `workflow_dispatch` con los mismos pasos.

### D12. Lambda y HTTP API

- **Lambda:**
  - Runtime y recursos: `nodejs24.x`, `x86_64`, 1024 MB y 15 s de timeout. Con 1024 MB, Bcrypt cost 12 tarda unos 250 ms; con 512 MB, el doble.
  - Concurrencia: sin concurrencia reservada, porque con la cuota inicial de 10 AWS no deja reservar. El límite real lo da la cuota y, con un pool de 2, son como mucho 20 conexiones de cliente al *pooler*.
  - Logs: grupo `/aws/lambda/<nombre>` creado por el stack con 30 días de retención, y formato de log JSON de Lambda para que las líneas de pino no se envuelvan en texto.
- **HTTP API:**
  - Ruta e integración: una única ruta `ANY /{proxy+}` con integración Lambda de payload 2.0.
  - *Throttling* de la etapa por defecto: 10 peticiones por segundo con ráfagas de 20, como tope de coste y de abuso, muy por encima del uso del piloto.

### D13. PostgreSQL 17 en local y en CI

- **Docker Compose:** pasa a `postgres:17`, con el volumen montado en `/var/lib/postgresql/data`; la ruta de la 18 no sirve en la 17.
- **CI:** `ci.yml` usa `postgres:17`.
- **Paso manual:** `README.md` y `CLAUDE.md` avisan de que hay que ejecutar `docker compose down -v`.
- **Documentación técnica:** se cambian las menciones a PostgreSQL 18 en `openspec/config.yaml`, `README.md` §2.3, `CLAUDE.md`, `ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y `MODELO_DATOS.md`.
- **Compatibilidad:** las migraciones no usan nada exclusivo de la 18 (comprobado). La suite completa y el E2E sobre la 17 lo confirman.

### D14. Contrato de la API

Solo cambia la descripción general de `docs/api-spec.yml`. Explica que en producción toda ruta de `/api` responde `403 ORIGIN_NOT_ALLOWED` si la petición no llega por CloudFront, y que `/api/auth/*` responde `404 NOT_FOUND` hasta que se publique el registro. No hay códigos nuevos (`ORIGIN_NOT_ALLOWED` ya existe), así que `ERROR_CODES` y los tipos generados no cambian. Si `api:types:check` detecta diferencias por la descripción, se regeneran.

## Risks / Trade-offs

- **[Riesgo] `serverless-http` no es compatible con Express 5 o con las cookies de la HTTP API 2.0** → El primer test de D2 lo detecta antes de construir nada más. Plan alternativo: `@codegenie/serverless-express`.
- **[Riesgo] esbuild no empaqueta bien el cliente de Prisma 7 o el binario de Bcrypt** → La tarea de empaquetado arranca el bundle en local antes de desplegar. Alternativa: llevar `@prisma/client` a `nodeModules`.
- **[Riesgo] Conexiones muertas tras congelarse la instancia de Lambda:** Supavisor puede cerrar conexiones de cliente inactivas mientras la instancia está congelada. La primera consulta tras descongelar fallaría (`503` puntual), y el evento `error` de un cliente inactivo del pool podría tumbar el proceso si nadie lo escucha → Se comprueba en la puesta en marcha (petición tras más de 15 minutos sin uso). Si ocurre, se fija `idleTimeoutMillis` corto y se escucha `pool.on('error')` en `createPrismaClient`.
- **[Riesgo] El certificado del *pooler* no se valida con la CA de Supabase** → Se comprueba con `psql` en la puesta en marcha (D10). Se ajusta el diseño; no se desactiva la verificación.
- **[Riesgo] Rollback con migraciones más nuevas aplicadas:** `prisma migrate deploy` con un directorio de migraciones más antiguo que la base. Se espera que no aplique nada y no falle → Se prueba en local antes de dar el rollback por bueno (CA6). Si falla, el rollback salta el paso de migraciones.
- **[Trade-off] Secreto de origen en la configuración de CloudFront:** cualquiera con permiso de lectura sobre la distribución lo ve → La cuenta tiene un único usuario de administración. El secreto solo protege la IP que ve el límite de intentos.
- **[Trade-off] Migraciones con `sslmode=require` sin verificar la CA (D10)** → Es una conexión desde GitHub con credenciales propias. La Lambda, que es la que corre siempre, sí verifica.
- **[Riesgo] Workflows programados desactivados:** GitHub desactiva los programados tras 60 días sin actividad en el repositorio, y entonces se dejan de hacer copias y Supabase pausa el proyecto → Se documenta en la guía. Supabase avisa por email antes de pausar.
- **[Riesgo] Primer despliegue bloqueado por la validación del certificado** → Ver el plan de puesta en marcha: el primer despliegue se hace desde local y el CNAME se crea mientras CloudFormation espera.
- **[Riesgo] La cuenta nueva no puede crear distribuciones de CloudFront hasta que AWS la verifica** → Se comprueba al principio de la puesta en marcha. Si pasa, se abre un caso de soporte antes de seguir.
- **[Seguridad] Aislamiento de datos por colegio y JWT:** no cambian en este cambio. El registro está cerrado, y la sesión (`/api/auth/refresh`) también.

## Migration Plan

**Puesta en marcha (una vez, desde local, con la guía `docs/despliegue/PUESTA_EN_MARCHA.md`):**

1. **Cuenta de AWS:**
   - MFA en el usuario raíz, usuario de IAM Identity Center y presupuesto con alerta.
   - `aws configure sso` y `cdk bootstrap` en `eu-central-1` y `us-east-1`.
   - Comprobar la cuota de concurrencia y que se pueden crear distribuciones de CloudFront.
2. **Supabase:**
   - Proyecto en Fráncfort, con la *Data API* desactivada y *Enforce SSL*.
   - Aplicar las migraciones (`npm run db:migrate` con la cadena del rol `postgres`), porque `app-role.sql` revoca el acceso a `_prisma_migrations` y la tabla tiene que existir.
   - Ejecutar `app-role.sql` y comprobar el TLS con `psql` y la CA (D10).
3. **Secretos:** los cinco parámetros de SSM y, en GitHub, el entorno `prod` (solo `main`) con `MIGRATION_DATABASE_URL` y las `vars` de reCAPTCHA.
4. **Certificado:** `cdk deploy CalendarSchool-prod-Certificate` y el CNAME de validación en DonDominio mientras espera.
5. **Primer despliegue completo desde local:** `cdk deploy` del stack de la aplicación y el CNAME `app` hacia la distribución.
6. **Medidas:** medir `TRUST_PROXY_HOPS` (D7), fijarlo y redesplegar.
7. **Comprobaciones de la puesta en marcha:**
   - Una petición tras 15 minutos sin uso (conexiones muertas).
   - Una copia lanzada a mano y su restauración en un PostgreSQL 17 local.
   - Un rollback de prueba con `workflow_dispatch`.
8. **reCAPTCHA:** añadir `calendarschools.es` a las dos claves.

A partir de ahí, cada push a `main` despliega solo.

**Rollback:**

- **De una versión:** `workflow_dispatch` de `deploy.yml` con la referencia anterior.
- **Del cambio entero:** `cdk destroy` de los dos stacks. Los buckets con datos (copias) tienen `RemovalPolicy.RETAIN` y se borran a mano. El proyecto de Supabase se pausa o elimina desde su panel.

## Open Questions

- **`TRUST_PROXY_HOPS`: medido el 2026-10-12, vale `2`.** Con `curl -H 'X-Forwarded-For: 198.51.100.9'` el log de `debug` mostró `forwardedFor = "198.51.100.9, <IP del visitante>, <IP de CloudFront>"` y `req.ip = <IP del visitante>`: CloudFront añade la IP del visitante y API Gateway la del nodo de CloudFront, y la IP escrita por el cliente queda a la izquierda y se ignora. El valor por defecto del stack ya era `2`, así que no hubo cambio de código. Medirlo exigió además corregir el filtro de nivel de log de Lambda (D7).
- **Cliente de Prisma en `nodeModules`:** se decide con la tarea de empaquetado (D3).
- **Conexiones tras descongelar:** si hacen falta `idleTimeoutMillis` y `pool.on('error')`, se decide con la prueba de la puesta en marcha.
