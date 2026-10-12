## Why

Hasta ahora CalendarSchool solo se ejecuta en local y en CI. US00_b (`docs/User_Stories_MVP.md`) pide desplegar `main` en AWS de forma automática, para validar la infraestructura de producción antes de que las historias funcionales dependan de ella. US01 está completa, y lo pendiente para publicar el registro (`TRUST_PROXY_HOPS`, la cabecera secreta de CloudFront y los secretos de producción) solo se puede cerrar sobre la infraestructura real. El PRD acota el MVP a un colegio piloto durante 2-3 semanas (§211), así que se prioriza un coste fijo cercano a 0.

## What Changes

- **Infraestructura como código (`infrastructure/`, AWS CDK en TypeScript)** en `eu-central-1`, con el certificado de ACM en `us-east-1`:
  - CloudFront con el dominio `app.calendarschools.es`, que sirve el build de Vite desde un bucket de S3 privado (OAC) y redirige `/api/*` a una HTTP API de API Gateway con una Lambda `nodejs24.x`.
  - CloudFront Functions para las rutas de la SPA y para cerrar `/api/auth/*`.
  - Parámetros de SSM para los secretos y logs en CloudWatch, conservados 30 días.
  - El bucket de copias de seguridad y los roles de OIDC para GitHub Actions.
- **Base de datos en Supabase (plan gratuito, Fráncfort):**
  - La Lambda se conecta por el *pooler* en modo transacción, y las migraciones y copias por el modo sesión, con SSL verificado.
  - Un usuario de aplicación sin privilegios sobre el esquema y la *Data API* desactivada.
  - La configuración de Supabase es manual y queda documentada con un script SQL versionado.
- **Punto de entrada `backend/src/lambda.ts`:**
  - Lee los secretos de SSM al arrancar en frío, valida la configuración con `loadConfig` y envuelve la app de `createApp()`.
  - La composición de dependencias, que hoy vive en `server.ts`, pasa a un módulo compartido y probado, que usan los dos puntos de entrada.
- **Verificación del origen:** CloudFront añade una cabecera secreta a `/api/*`, y en producción el backend rechaza con `403 ORIGIN_NOT_ALLOWED` las peticiones que no la traen. `ORIGIN_VERIFY_SECRET` es una variable nueva, obligatoria con `NODE_ENV=production`. `TRUST_PROXY_HOPS` se fija midiendo lo que llega a Express.
- **Registro cerrado en producción:** `/api/auth/*` responde `404 NOT_FOUND` en CloudFront sin llegar al backend, hasta el cambio posterior `publicacion-registro`.
- **Despliegue continuo:** un workflow reutilizable `deploy.yml` se ejecuta tras `quality` y `e2e` en cada push a `main`, y también a mano (`workflow_dispatch`) con una referencia, para hacer rollback. Sigue este orden: build, migraciones, despliegue con CDK, publicación del frontend e invalidación de CloudFront y, al final, un smoke test de `GET /api/health`.
- **Copias de seguridad:** un workflow programado hace cada día un `pg_dump` del esquema `public` a S3, que conserva las copias 30 días. Después llama a `GET /api/health`, y esa actividad evita la pausa del plan gratuito.
- **Tareas heredadas de US00:**
  - Pool de PostgreSQL con `max` y `connectionTimeoutMillis`, con `ssl` en producción.
  - `prisma` sigue siendo dependencia de desarrollo, porque la Lambda se empaqueta con esbuild y no hay `npm ci --omit=dev`.
  - Un `ConfigError` se registra como una línea JSON de pino en los dos puntos de entrada.
- **PostgreSQL 17 en local y en CI**, porque Supabase no ofrece la 18: cambian la imagen de Docker Compose y su volumen, y los contenedores de servicio de CI. **BREAKING (solo en desarrollo):** el volumen de PostgreSQL 18 no sirve con la 17, así que hay que ejecutar `docker compose down -v`.
- **Documentación:**
  - Una guía de los pasos manuales (cuenta de AWS, Supabase, DonDominio, reCAPTCHA y restauración de una copia).
  - `README.md` §2.4, `CLAUDE.md`, `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11, `openspec/config.yaml` y la historia US00_b.

## Capabilities

### New Capabilities

- `cloud-deployment`: la infraestructura en AWS y su despliegue continuo. Cubre la arquitectura y el mismo origen, el dominio y HTTPS, el registro cerrado, las migraciones explícitas, el smoke test, el rollback, las credenciales por OIDC, los logs, las copias de seguridad y los requisitos de la base de datos gestionada.
- `serverless-runtime`: el backend en AWS Lambda. Cubre el punto de entrada `lambda.ts`, la lectura de los secretos de SSM, la composición compartida con `server.ts`, la verificación de la cabecera de CloudFront y el pool de conexiones acotado.

### Modified Capabilities

- `app-configuration`:
  - Pasa a haber dos puntos de entrada que cargan la configuración (`server.ts` y `lambda.ts`).
  - Se añade la variable `ORIGIN_VERIFY_SECRET`, obligatoria en producción.
  - Un `ConfigError` se registra como una línea JSON de pino.
- `dev-workflow`: el workspace `infrastructure`, PostgreSQL 17 en Docker Compose y en CI, y el job de despliegue tras `quality` y `e2e` en los push a `main`.

## Impact

- **Infraestructura:** directorio nuevo `infrastructure/` con un workspace de npm y su propio `tsconfig`, lint y tests de CDK. Workflows nuevos `deploy.yml` y `backup.yml`; `ci.yml` cambia.
- **Backend:** ficheros nuevos `lambda.ts` (excluido de la cobertura, como `server.ts`), el módulo de composición, el lector de parámetros de SSM, el middleware de verificación del origen y una versión nueva de `createPrismaClient` (pool y SSL). Cambian `config.ts`, `server.ts` y `app.ts`.
- **Dependencias nuevas:**
  - Backend: `serverless-http` (o la alternativa que fije el diseño) y `@aws-sdk/client-ssm`.
  - Infraestructura: `aws-cdk-lib`, `constructs` y `aws-cdk`.
  - Si alguna trae scripts de instalación, se aprueba en `allowScripts`.
- **Frontend:** sin cambios de código. El build de producción recibe las claves de sitio de reCAPTCHA como variables del workflow.
- **API (`docs/api-spec.yml`):** solo cambia la descripción general, que documenta el `403 ORIGIN_NOT_ALLOWED` de las peticiones que no llegan por CloudFront. Sin endpoints ni códigos nuevos.
- **Modelo de datos:** sin cambios. Las migraciones existentes se aplican a Supabase.
- **Referencias:**
  - US00_b, incluidas las tareas heredadas de US00.
  - Lo pendiente para `despliegue-aws` de US01_d (`TRUST_PROXY_HOPS` y la cabecera secreta) y de US01_e (los secretos en AWS).
  - `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11, de la que se aparta como explica la historia.

### Fuera de alcance

- **Lo que hará `publicacion-registro`:** abrir `/api/auth/*`, la CSP con reCAPTCHA, la prueba del secreto v2 contra Google y el consentimiento y los textos legales.
- **Otros entornos:** un entorno `staging`, aunque el nombre del entorno queda como parámetro.
- **Piezas de la arquitectura objetivo:** WAF, VPC con base de datos privada, RDS o Aurora, Redis, SQS, X-Ray y monitorización avanzada.
- **Supabase y DNS como código:** el proyecto, los roles y los DNS de DonDominio se configuran a mano.
- **Prueba de carga del registro:** queda para cuando el registro esté publicado.
