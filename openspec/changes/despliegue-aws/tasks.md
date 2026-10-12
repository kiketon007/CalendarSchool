## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/despliegue-aws` desde `main` actualizado (con la US00_b reescrita ya integrada, o incluyéndola en la rama)
- [x] 0.2 Verificar que la rama actual es `feature/despliegue-aws` y que el árbol de trabajo solo contiene los artefactos de este cambio y la historia

## 1. PostgreSQL 17 en local y en CI (D13)

- [x] 1.1 Cambiar `docker-compose.yml` a `postgres:17` con el volumen en `/var/lib/postgresql/data` (y su comentario); recrear el volumen local con `docker compose down -v` y `docker compose up -d` y verificar que existen `calendarschool` y `calendarschool_test` con `SELECT version()` 17
- [x] 1.2 Cambiar los contenedores de servicio de `.github/workflows/ci.yml` a `postgres:17` (y el comentario de cabecera)
- [x] 1.3 Comprobar que las migraciones no usan nada exclusivo de PostgreSQL 18, ejecutar `npm run db:migrate`, `npm test` y `npm run test:e2e` sobre la 17 y verificar que pasan

## 2. Spike: adaptador de Lambda (D2)

- [x] 2.1 Añadir `serverless-http` a las dependencias del backend (y, si trae scripts de instalación, decidirlo en `allowScripts`)
- [x] 2.2 Escribir `backend/src/presentation/lambda/lambdaAdapter.test.ts` con eventos de la HTTP API 2.0 (fixtures propios): `GET /api/health` sobre `createApp` con dobles devuelve `200` y el cuerpo común; un `POST` con JSON en base64 llega parseado; `POST /api/auth/register` (con doble) devuelve la cookie de sesión en `cookies`, también cuando hay más de una. Verificar que pasa con `serverless-http` y `createLambdaHandler` (envoltorio que mueve `set-cookie` de `headers` a `cookies`, ver D2); si no pasa con Express 5, pausar, cambiar a `@codegenie/serverless-express` y actualizar D2 de `design.md`
- [x] 2.3 Registrar el resultado en `reports/YYYY-MM-DD-step-2-spike-lambda-adapter.md`

## 3. Configuración: `ORIGIN_VERIFY_SECRET` y error de configuración en JSON (TDD, D9)

- [x] 3.1 Ampliar `config.test.ts`: sin `ORIGIN_VERIFY_SECRET` en desarrollo (`originVerifySecret` indefinido), producción sin él (nombra la variable), de 31 caracteres (nombra la variable sin el valor) y válido; verificar que falla
- [x] 3.2 Añadir `ORIGIN_VERIFY_SECRET` al esquema Zod (obligatorio en producción junto a los secretos de reCAPTCHA) y `originVerifySecret` a `AppConfig`; verificar que pasa
- [x] 3.3 Documentarla comentada en `backend/.env.example`; verificar que el test de la plantilla sigue pasando
- [x] 3.4 Escribir los tests de `loadConfigOrLog(env, logger)`: con configuración válida devuelve la de `loadConfig`; con un `ConfigError` escribe una única línea JSON `fatal` con `invalidVariables` y sin valores, y relanza; verificar que falla, implementarlo y verificar que pasa

## 4. Backend: pool de conexiones y TLS (TDD, D10)

- [x] 4.1 Ampliar los tests de `createPrismaClient`: acepta `poolMax`, `connectionTimeoutMillis` y `ssl` y los pasa a `PrismaPg` (sin cambiar el comportamiento con `schema` de los tests); verificar que falla, implementarlo y verificar que pasa
- [x] 4.2 Escribir un test de integración con un servidor TCP local que acepta conexiones y no responde: con `connectionTimeoutMillis` corto, `PrismaDatabasePing` falla en ese tiempo y `GET /api/health` responde `503 DATABASE_UNAVAILABLE` sin consultas pendientes acumuladas; verificar que pasa

## 5. Backend: verificación del origen (TDD, D6, D7 y D14)

- [x] 5.1 Escribir `presentation/http/requireOriginVerification.test.ts`: cabecera `X-Origin-Verify` correcta pasa; ausente, distinta o de otra longitud responde `403 ORIGIN_NOT_ALLOWED` en el formato común; el `warn` no contiene el valor recibido; el `debug` registra `ip` y `forwardedFor`; verificar que falla
- [x] 5.2 Implementar el middleware (comparación con `timingSafeEqual` sobre SHA-256) y verificar que pasa
- [x] 5.3 Ampliar `app.test.ts`: con `originVerifySecret`, el middleware va antes que todo (también antes que el `404` y que un JSON mal formado); sin él, no se aplica; verificar que falla, añadir la dependencia opcional a `createApp` y verificar que pasa
- [x] 5.4 Documentar en la descripción general de `docs/api-spec.yml` el `403 ORIGIN_NOT_ALLOWED` fuera de CloudFront y el `404` de `/api/auth/*` mientras el registro está cerrado; validar con `npx @redocly/cli lint docs/api-spec.yml` y ejecutar `npm run api:types:check -w frontend` (regenerar si cambia)

## 6. Backend: composición compartida (TDD, D4)

- [x] 6.1 Escribir un test de integración de `composeApp(config, { logger, poolMax })` contra la base de test: `GET /api/health` responde `200`; verificar que falla
- [x] 6.2 Extraer el cableado de `server.ts` a `backend/src/composeApp.ts` y verificar que pasa
- [x] 6.3 Reescribir `server.ts` sobre `loadConfigOrLog` y `composeApp` (con `process.exit(1)` ante un `ConfigError` y sin lógica); comprobar a mano que con una configuración inválida `npm run dev -w backend` escribe solo la línea JSON y termina con código 1
- [x] 6.4 Valorar si `test/support/realApp.ts` puede construirse sobre `composeApp` sin complicar su firma; hacerlo si es así o dejar la razón en `design.md` (D4), y verificar que los tests de integración siguen pasando

## 7. Backend: Lambda (TDD, D3 y D5)

- [x] 7.1 Añadir `@aws-sdk/client-ssm` a las dependencias del backend
- [x] 7.2 Escribir `infrastructure/aws/ssmEnvironment.test.ts` con un cliente simulado: combina los parámetros por el último segmento, pagina con `NextToken`, pide `WithDecryption` y `Recursive: false`, y propaga el error de SSM sin valores; verificar que falla, implementar `loadSsmEnvironment` y verificar que pasa
- [x] 7.3 Escribir `backend/src/lambda.ts` (lectura de SSM con *top-level await*, `loadConfigOrLog`, `composeApp` con `poolMax: 2` y la CA de Supabase, `createLambdaHandler(app)`), sin lógica, y excluirlo de la cobertura como `server.ts`
- [x] 7.4 Añadir `infrastructure/assets/supabase-ca.crt` (CA raíz pública de Supabase, descargada de su panel o documentación) con un comentario de origen en la guía

## 8. Infraestructura: workspace y stacks de CDK (TDD, D1, D3, D5, D6, D8 y D12)

- [x] 8.1 Crear el workspace `infrastructure/` (`package.json` con `aws-cdk-lib`, `constructs` y `aws-cdk`; `tsconfig`; ESLint; `.lintstagedrc.json`; Vitest) y añadirlo a `workspaces`, `lint`, `format`, `build` y `test` del `package.json` raíz; decidir en `allowScripts` las dependencias con scripts; verificar `npm install`, `npm run lint` y `npm run typecheck --workspaces`
- [x] 8.2 Escribir los tests de las CloudFront Functions (`spa-rewrite` y `api-guard`), evaluando su código fuente en Vitest: una ruta sin extensión pasa a `/index.html`, `/assets/x.js` y `/api/*` no cambian; `/api/auth/register` y `/api/auth/refresh` responden `404` con el JSON común `NOT_FOUND` y `/api/health` pasa; verificar que fallan, implementarlas (runtime `cloudfront-js-2.0`) y verificar que pasan
- [x] 8.3 Escribir los tests del stack del certificado (`us-east-1`, `app.calendarschools.es`, validación por DNS); verificar que fallan, implementarlo y verificar que pasan
- [x] 8.4 Escribir los tests del stack de la aplicación con `aws-cdk-lib/assertions`: bucket del frontend privado con OAC y bloqueo de acceso público; distribución con el dominio, redirección a HTTPS, `PriceClass_100`, cabeceras de seguridad sin CSP, comportamiento `/api/*` con `CachingDisabled`, `AllViewerExceptHostHeader`, todos los métodos, la cabecera `X-Origin-Verify` desde un parámetro `NoEcho` y las dos funciones; verificar que fallan
- [x] 8.5 Ampliar los tests: Lambda `nodejs24.x`, `x86_64`, 1024 MB, 15 s, sin concurrencia reservada, formato de log JSON con el nivel de log de la aplicación de Lambda en `TRACE` (así lo decide solo `LOG_LEVEL`), variables `NODE_ENV`, `APP_ORIGIN`, `TRUST_PROXY_HOPS`, `LOG_LEVEL`, `SSM_PARAMETER_PATH` y `ORIGIN_VERIFY_ROTATION`, permiso `ssm:GetParametersByPath` solo sobre `/calendarschool/<env>/`; grupo de logs con 30 días; HTTP API con `ANY /{proxy+}`, payload 2.0 y *throttling* 10/20; verificar que fallan
- [x] 8.6 Ampliar los tests: bucket de copias privado, cifrado, con `enforceSSL`, regla de 30 días y `RETAIN`; roles de OIDC con `aud` y `sub = repo:kiketon007@48519594/CalendarSchool@1366177326:environment:prod` (subject inmutable de GitHub, con los IDs del propietario y del repositorio), el de despliegue con los permisos de D11 y el de copias solo con `s3:PutObject` en su bucket; el entorno como parámetro cambia nombres y ruta de SSM; salidas con el bucket, el ID de la distribución y la URL de `execute-api`; verificar que fallan
- [x] 8.7 Implementar el stack de la aplicación (`NodejsFunction` sobre `backend/src/lambda.ts`, ESM con el *banner* de `createRequire`, `nodeModules: ['@node-rs/bcrypt']`, *source maps* y la CA copiada con `commandHooks`) y verificar que todos los tests de la infraestructura pasan
- [x] 8.8 Sintetizar (`npx cdk synth -c env=prod`), arrancar el bundle en local con un evento `GET /api/health` y una configuración de prueba, y decidir si `@prisma/client` debe ir también en `nodeModules`; anotar la decisión en D3 de `design.md`

## 9. Supabase y smoke test (D10 y D11)

- [x] 9.1 Escribir `infrastructure/supabase/app-role.sql` (rol `calendarschool_app` con la contraseña por variable de `psql`, privilegios de lectura y escritura actuales y por defecto, sin `_prisma_migrations`, `statement_timeout` de 9 s y revocación a `anon` y `authenticated`); probarlo en el PostgreSQL 17 local creando antes los roles `anon` y `authenticated`, y verificar que el usuario de aplicación lee y escribe, no puede `CREATE TABLE` ni `ALTER TABLE` y obtiene permisos sobre una tabla creada después por el propietario
- [x] 9.2 Escribir los tests de `scripts/smoke.mjs` con `fetch` simulado (salud `200` con `database: up`, registro `404 NOT_FOUND`, `execute-api` sin cabecera `403 ORIGIN_NOT_ALLOWED`, reintentos hasta 2 minutos y fallo con mensaje claro); verificar que fallan, implementarlo y verificar que pasan

## 10. Workflows de GitHub Actions (D11)

- [x] 10.1 Escribir `.github/workflows/deploy.yml` (`workflow_call` y `workflow_dispatch` con `ref`, `environment: prod`, `concurrency` sin cancelación y los pasos de D11 en orden)
- [x] 10.2 Añadir a `ci.yml` el job `deploy` (`needs: [quality, e2e]`, solo en push a `main`, `secrets: inherit` y permisos `id-token: write`)
- [x] 10.3 Escribir `.github/workflows/backup.yml` (programado a las 03:17 UTC y `workflow_dispatch`, `/usr/lib/postgresql/17/bin/pg_dump -Fc -n public` (ruta versionada) con la CA y `set -euo pipefail`, subida a S3 con la fecha en el nombre y `curl -f` final a `GET /api/health`)
- [x] 10.4 Validar los tres workflows con `actionlint` (o `npx` equivalente)

## 11. Guía de puesta en marcha (MANDATORY antes de desplegar)

- [x] 11.1 Escribir `docs/despliegue/PUESTA_EN_MARCHA.md` con los pasos del plan de puesta en marcha de `design.md`: cuenta de AWS, Supabase y `app-role.sql`, parámetros de SSM y entorno `prod` de GitHub, certificado y CNAME en DonDominio, primer despliegue desde local, medición de `TRUST_PROXY_HOPS`, reCAPTCHA, rotación del secreto de origen, restauración de una copia y aviso de los workflows programados desactivados por inactividad

## 12. Puesta en marcha real (requiere al responsable para los pasos de consola)

- [x] 12.1 El responsable completa la cuenta de AWS (MFA, usuario de IAM con `AdministratorAccess` y clave de acceso temporal, o Identity Center y `aws configure sso`; presupuesto); el agente verifica con `aws sts get-caller-identity`, comprueba la cuota de concurrencia de Lambda y ejecuta `cdk bootstrap` en `eu-central-1` y `us-east-1`
- [x] 12.2 El responsable crea el proyecto de Supabase en Fráncfort (*Data API* desactivada, *Enforce SSL*); el agente ejecuta `app-role.sql`, comprueba el TLS del *pooler* con `psql "sslmode=verify-full sslrootcert=…"` (si falla, pausar y actualizar D10) y aplica las migraciones
- [x] 12.3 Crear los cinco parámetros `SecureString` de SSM (los secretos los introduce el responsable sin pegarlos en la conversación) y el entorno `prod` de GitHub (solo `main`) con `MIGRATION_DATABASE_URL` y las `vars` de reCAPTCHA
- [x] 12.4 Desplegar el stack del certificado; el responsable crea el CNAME de validación en DonDominio; verificar que ACM lo da por válido
- [x] 12.5 Desplegar el stack de la aplicación desde local con el secreto de origen leído de SSM, publicar el frontend; el responsable crea el CNAME `app`; verificar `https://app.calendarschools.es` y `GET /api/health`
- [x] 12.6 Medir `TRUST_PROXY_HOPS` según D7, fijarlo, redesplegar con `LOG_LEVEL=info` y anotar el valor y la cadena observada en `design.md` y en la nota de «IP real del cliente» de `docs/User_Stories_MVP.md`
- [x] 12.7 El responsable añade `calendarschools.es` a las dos claves de reCAPTCHA
- [ ] 12.8 Si se usó una clave de acceso de IAM en lugar de Identity Center: desactivarla y borrarla desde «Credenciales de seguridad» y eliminar el perfil local (`calendarschool` en `~/.aws/credentials` y `~/.aws/config`), para no dejar claves de larga duración con permisos de administrador; borrar también el fichero local de secretos `~/.calendarschool-secrets.env`

## 13. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 13.1 Revisar los tests de backend afectados por `composeApp`, el pool y `ORIGIN_VERIFY_SECRET` (`config.test.ts`, la plantilla, `appDoubles.ts`, `realApp.ts`) y los umbrales y exclusiones de cobertura (`lambda.ts`)
- [x] 13.2 Revisar que `scripts/e2e.mjs` y los tests no dependen de PostgreSQL 18

## 14. Ejecutar tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 14.2 Ejecutar los tests de los módulos modificados de backend e infraestructura
- [x] 14.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 14.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 14.5 Crear el informe `reports/YYYY-MM-DD-step-14-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 15. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 En local, arrancar el backend con `ORIGIN_VERIFY_SECRET` y comprobar con `curl` que `GET /api/health` sin la cabecera da `403 ORIGIN_NOT_ALLOWED`, con ella da `200`, y que sin la variable da `200`; parar el backend y comprobar que el puerto 3000 queda libre
- [x] 15.2 En producción, comprobar con `curl`: página inicial y `/registro` con `200`; `http://` redirige a `https://`; `GET /api/health` `200` con `database: up`; `POST /api/auth/register` y `POST /api/auth/refresh` `404 NOT_FOUND` sin crear datos; `GET <execute-api>/api/health` sin cabecera `403`; `X-Forwarded-For` escrito por el cliente no cambia `req.ip` (log de `debug` o de `warn`); la URL del bucket rechaza la descarga directa; la conexión sin TLS a Supabase se rechaza; la *Data API* no responde
- [x] 15.3 Comprobar una petición tras más de 15 minutos sin uso (conexiones tras descongelar); si falla, pausar y actualizar D10 y el riesgo correspondiente
- [x] 15.4 Lanzar `backup.yml` a mano, verificar el fichero en S3 y restaurarlo en un PostgreSQL 17 local vacío siguiendo la guía
- [x] 15.5 Comprobar en la PR que el job `deploy` aparece como omitido; integrar la PR en `main` y verificar el despliegue automático y su smoke test; lanzar un rollback de prueba con `workflow_dispatch` a un commit anterior de `main`, verificar el smoke test y volver al último
- [x] 15.6 Documentar los comandos y respuestas (sin secretos) en `reports/YYYY-MM-DD-step-15-curl-manual-testing.md`

## 16. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 16.1 Sin cambios de interfaz: ejecutar en modo headless `npm run test:e2e` completo sobre PostgreSQL 17 y verificar que pasa
- [x] 16.2 Verificar y restaurar la base de datos de test
- [x] 16.3 Documentar el resultado en `reports/YYYY-MM-DD-step-16-e2e-cypress.md`

## 17. Actualizar la documentación técnica (MANDATORY)

- [x] 17.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (dos puntos de entrada, `composeApp`, verificación del origen y lectura de SSM)
- [x] 17.2 Actualizar `README.md` (§2.3 PostgreSQL 17 y `docker compose down -v`; §2.4 infraestructura real; workspace `infrastructure`; enlace a la guía) y `CLAUDE.md` (estado del repositorio, comandos de infraestructura, arquitectura de `lambda.ts` y `composeApp`)
- [x] 17.3 Actualizar `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11 y `DIAGRAMA_C4.md` (CDK, Supabase, `eu-central-1`, CloudFront), `docs/Modelo_de_Datos/MODELO_DATOS.md` (PostgreSQL 17) y el contexto de `openspec/config.yaml`
- [x] 17.4 Actualizar `docs/User_Stories_MVP.md`: marcar las tareas heredadas de US00 resueltas y lo pendiente para `publicacion-registro` (el valor medido de `TRUST_PROXY_HOPS` se anota en la tarea 12.6)
- [x] 17.5 Verificar con `openspec validate despliegue-aws` que el cambio es válido antes de archivarlo
