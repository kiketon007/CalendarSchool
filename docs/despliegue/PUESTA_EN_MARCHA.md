# Puesta en marcha en AWS

Guía para dejar CalendarSchool funcionando en `https://app.calendarschools.es` por primera vez y para operarlo después. Es el resultado del cambio OpenSpec `despliegue-aws`; las decisiones y sus alternativas están en `openspec/changes/despliegue-aws/design.md` (se indican como D1, D2...).

La puesta en marcha se hace **una vez**, desde un terminal con Bash (Git Bash en Windows). A partir de ahí, cada push a `main` despliega solo.

> **Regla de oro: los secretos no se pegan en ningún chat, ticket ni fichero.** Se escriben en el prompt de `read -rs` (no se ven ni quedan en el historial), se generan en el momento con `openssl` o se pegan directamente en el panel de AWS, Supabase o GitHub. Ningún fichero versionado los contiene.

## 1. Qué se despliega y dónde

```text
Navegador ──HTTPS──> CloudFront (app.calendarschools.es)
                        ├── /*      ──> S3 privado (frontend de Vite)        [OAC]
                        └── /api/*  ──> API Gateway (HTTP API) ──> Lambda ──> Supabase (PostgreSQL 17)
                                        + cabecera secreta X-Origin-Verify
```

| Qué | Dónde | Por qué |
|---|---|---|
| Certificado de `app.calendarschools.es` | `us-east-1` (Virginia) | AWS exige que los certificados de CloudFront estén ahí. No contiene datos de usuarios |
| Frontend, Lambda, HTTP API, logs, bucket de copias y roles | `eu-central-1` (Fráncfort) | Los datos de los usuarios se quedan en la UE |
| Base de datos | Supabase, Fráncfort | Plan gratuito |
| DNS | DonDominio | Solo dos registros CNAME; no hay Route 53 |

Dos stacks de CDK (`infrastructure/`): `CalendarSchool-prod-Certificate` (`us-east-1`) y `CalendarSchool-prod-App` (`eu-central-1`).

**Registro cerrado.** Mientras no exista el cambio `publicacion-registro`, CloudFront responde `404` a todo lo que cuelga de `/api/auth/`. La aplicación se despliega y se puede probar, pero nadie puede registrarse.

**Coste esperado.** Cerca de 0 € al mes durante el piloto: todo entra en el nivel gratuito (Lambda, API Gateway, CloudFront, SSM estándar, S3 con pocas copias de 30 días) y Supabase usa su plan gratuito. Lo único que cuesta dinero es el dominio. Aun así, el paso 2 crea un presupuesto con alerta.

## 2. Orden de los pasos

```text
 1 AWS ──> 2 Supabase ──> 3 reCAPTCHA ──> 4 Secretos en SSM ──> 5 Certificado + CNAME de validación
                                                                            │
 9 Medir TRUST_PROXY_HOPS <── 8 Entorno de GitHub <── 7 CNAME app <── 6 Primer despliegue (local)
```

Cada paso depende del anterior. Los de consola (cuenta de AWS, Supabase, GitHub, Google y DonDominio) los hace una persona; los comandos los puede ejecutar quien tenga la sesión de AWS abierta.

---

## Paso 1. Cuenta de AWS

1. **MFA en el usuario raíz** y no volver a usarlo.
2. **Un usuario con permisos de administrador, solo para la puesta en marcha.** Hay dos formas:
   - **IAM Identity Center** (preferible, sin claves guardadas): actívalo en `eu-central-1`, crea tu usuario y un *permission set* con `AdministratorAccess` sobre esta cuenta.
   - **Usuario de IAM clásico**, con `AdministratorAccess`, **MFA** y una **clave de acceso** (Credenciales de seguridad > Crear clave de acceso > CLI). La clave es de larga duración: bórrala al terminar (paso final de esta guía).

   En los dos casos, GitHub no usa este usuario: despliega con su propio rol limitado, que crea el primer despliegue.
3. **Presupuesto con alerta**: AWS Budgets > presupuesto mensual de 5 € con aviso por email al 80 %.
4. **Sesión desde la CLI** (perfil `calendarschool`):

   ```bash
   aws configure sso --profile calendarschool     # con Identity Center
   aws sso login --profile calendarschool
   # o, con un usuario de IAM clásico (te pide la clave en el terminal; no la compartas):
   aws configure --profile calendarschool         # región: eu-central-1, salida: json

   export AWS_PROFILE=calendarschool
   aws sts get-caller-identity   # comprueba la cuenta
   ```

5. **Cuotas de la cuenta** (las cuentas nuevas pueden empezar con límites bajos):

   ```bash
   # Concurrencia de Lambda: debe ser >= 10. Con 10 no se puede reservar concurrencia, y no hace falta.
   aws lambda get-account-settings --region eu-central-1 --query 'AccountLimit.ConcurrentExecutions'
   ```

   Si AWS no te deja crear distribuciones de CloudFront ("Your account must be verified"), abre una incidencia de soporte antes de seguir.

6. **Preparar CDK (bootstrap)** en las dos regiones, una sola vez:

   ```bash
   export CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
   cd infrastructure
   npx cdk bootstrap "aws://$CDK_DEFAULT_ACCOUNT/eu-central-1" "aws://$CDK_DEFAULT_ACCOUNT/us-east-1"
   ```

   Los IDs de cuenta no se versionan: CDK los toma de tu sesión.

## Paso 2. Supabase

> **Cliente `psql`.** Los pasos 6 a 8 usan `psql` 17. Si no lo tienes instalado, usa el del contenedor de Docker Compose (`docker compose up -d` y `docker compose exec -T postgres psql …`; el script SQL se pasa con `< fichero`) o `docker run --rm -v "$PWD/infrastructure/assets:/ca:ro" postgres:17 psql …` con `sslrootcert=/ca/supabase-ca.crt`. En Git Bash antepón `MSYS_NO_PATHCONV=1` a esos comandos.

1. **Crea el proyecto** en la región de Fráncfort (`eu-central-1`) con una contraseña larga generada (guárdala en tu gestor de contraseñas). Anota el *project ref*.
2. **Desactiva la Data API** (Project Settings > Data API). La aplicación no la usa y sin ella `anon` y `authenticated` no tienen entrada.
3. **Activa *Enforce SSL*** (Database > Settings > SSL Configuration).
4. **Comprueba la CA.** El panel ofrece la CA para descargar. Compárala con la versionada en `infrastructure/assets/supabase-ca.crt` (Supabase Root 2021 CA). Si el panel ofrece otra distinta para tu proyecto, añádela a ese mismo fichero (un PEM admite varios certificados) y anótalo en D10.
5. **Cadenas de conexión** (Connect > Session pooler y Transaction pooler). Hay dos usuarios y dos puertos:

   | Para qué | Usuario | Host y puerto | Cadena |
   |---|---|---|---|
   | Migraciones y copias | `postgres.<ref>` | `aws-1-eu-central-1.pooler.supabase.com:5432` (sesión) | `…:5432/postgres?sslmode=require` |
   | La Lambda | `calendarschool_app.<ref>` | el mismo host, `:6543` (transacción) | `…:6543/postgres` |

   Si la contraseña tiene caracteres especiales (`@ : / ? #`), van codificados como URL.

6. **Aplica las migraciones** (crean las tablas y cargan los municipios). Hazlo antes de crear el rol de aplicación:

   ```bash
   read -rs -p "Cadena de migración (postgres.<ref>, :5432): " MIGRATION_DATABASE_URL; echo
   DATABASE_URL="$MIGRATION_DATABASE_URL" npm run db:migrate
   ```

7. **Crea el rol de aplicación** (`calendarschool_app`): puede leer y escribir, pero no cambiar el esquema ni tocar `_prisma_migrations`, y sus consultas se cortan a los 9 s.

   ```bash
   read -rs -p "Contraseña nueva del rol calendarschool_app: " APP_PASSWORD; echo
   psql "$MIGRATION_DATABASE_URL" -v app_password="$APP_PASSWORD" -f infrastructure/supabase/app-role.sql
   unset APP_PASSWORD
   ```

   El script es idempotente: repítelo si cambias la contraseña o si una migración nueva crea tablas y quieres reaplicar los permisos de `_prisma_migrations`.

8. **Comprueba el TLS verificado** con el rol de aplicación por el modo transacción:

   ```bash
   psql "host=aws-1-eu-central-1.pooler.supabase.com port=6543 dbname=postgres user=calendarschool_app.<ref> sslmode=verify-full sslrootcert=infrastructure/assets/supabase-ca.crt" -c "select current_user, current_setting('statement_timeout')"
   ```

   Debe devolver `calendarschool_app` y `9s`. **Si `verify-full` falla** (certificado con otro nombre o de otra CA), no sigas: la Lambda se negará a conectar. Hay que ajustar la CA o la decisión D10 de `design.md`.

## Paso 3. reCAPTCHA

El backend en producción **no arranca sin los secretos de reCAPTCHA** (`loadConfig` los exige), aunque el registro esté cerrado.

1. En la consola de reCAPTCHA (Google Cloud) crea dos claves: **v3** (por puntuación) y **v2 casilla** ("No soy un robot").
2. En las dos, añade el dominio `calendarschools.es` (cubre `app.calendarschools.es`) y, si quieres seguir probando en local, `localhost`.
3. Guarda las cuatro cadenas: dos **claves de sitio** (públicas, van al frontend) y dos **secretos** (van a SSM).

La comprobación del secreto v2 contra Google queda para `publicacion-registro`.

## Paso 4. Secretos en SSM

Cinco parámetros `SecureString` (nivel estándar, gratis) bajo `/calendarschool/prod/`. La Lambda los lee al arrancar en frío (D5).

```bash
put() {  # put NOMBRE : pide el valor sin mostrarlo
  read -rs -p "$1: " value; echo
  aws ssm put-parameter --region eu-central-1 --name "/calendarschool/prod/$1" \
    --type SecureString --value "$value" --overwrite > /dev/null
  unset value
}

put DATABASE_URL            # cadena de la Lambda: calendarschool_app.<ref>, :6543
put RECAPTCHA_V3_SECRET
put RECAPTCHA_V2_SECRET

# Estos dos se generan aquí mismo y nadie los ve:
for name in JWT_SECRET ORIGIN_VERIFY_SECRET; do
  aws ssm put-parameter --region eu-central-1 --name "/calendarschool/prod/$name" \
    --type SecureString --value "$(openssl rand -base64 48)" --overwrite > /dev/null
done

aws ssm get-parameters-by-path --region eu-central-1 --path /calendarschool/prod/ --query 'Parameters[].Name'
```

La última orden lista los nombres (no los valores): deben ser cinco.

## Paso 5. Certificado y CNAME de validación

```bash
cd infrastructure
npx cdk deploy CalendarSchool-prod-Certificate -c env=prod
```

CloudFormation **se queda esperando** a que el certificado se valide. Mientras tanto:

1. En ACM (región **us-east-1**, Virginia) abre el certificado de `app.calendarschools.es` y copia el registro CNAME de validación (nombre y valor).
2. En DonDominio, zona `calendarschools.es`, crea ese CNAME. Muchos paneles piden el nombre **sin** el dominio final (`_abc123.app` en lugar de `_abc123.app.calendarschools.es.`).
3. Espera a que ACM lo dé por válido (de unos minutos a una hora) y el comando termine.

## Paso 6. Primer despliegue desde local

El primer despliegue crea también los roles de GitHub, así que se hace desde tu máquina. Se empaqueta la Lambda para Linux x64 aunque estés en Windows (el binario de Bcrypt se fuerza en `appStack.ts`).

```bash
cd infrastructure
SECRET="$(aws ssm get-parameter --region eu-central-1 --name /calendarschool/prod/ORIGIN_VERIFY_SECRET --with-decryption --query Parameter.Value --output text)"
ROTATION="$(printf '%s' "$SECRET" | sha256sum | cut -c1-12)"

npx cdk deploy CalendarSchool-prod-App -c env=prod \
  --parameters "CalendarSchool-prod-App:OriginVerifySecret=$SECRET" \
  --parameters "CalendarSchool-prod-App:OriginVerifyRotation=$ROTATION" \
  --outputs-file cdk-outputs.json
unset SECRET
```

Si la cuenta ya tenía un proveedor OIDC de GitHub (solo puede haber uno por cuenta), añade `-c githubOidcProviderArn=arn:aws:iam::<cuenta>:oidc-provider/token.actions.githubusercontent.com`.

Las salidas de `cdk-outputs.json` (no contienen secretos, pero está en `.gitignore`) son lo que necesitan los pasos 7 y 8:

| Salida | Para qué |
|---|---|
| `DistributionDomainName` | Destino del CNAME `app` (paso 7) |
| `DeployRoleArn` y `BackupRoleArn` | Variables de GitHub (paso 8) |
| `BackupBucketName` | Variable de GitHub (paso 8) |
| `ApiUrl` | URL directa de `execute-api`: debe responder `403` sin cabecera |

## Paso 7. CNAME `app` en DonDominio

Crea `app` → CNAME → el valor de `DistributionDomainName` (algo como `d1234abcd.cloudfront.net`). Tarda de minutos a horas en propagarse.

## Paso 8. Entorno `prod` de GitHub

Se hace una vez, con `gh` (o desde Settings > Environments).

```bash
REPO=kiketon007/CalendarSchool

# Entorno que solo admite la rama main
gh api -X PUT "repos/$REPO/environments/prod" \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST "repos/$REPO/environments/prod/deployment-branch-policies" -f name=main

# Secreto: la cadena de migraciones (te la pide, no se muestra)
gh secret set MIGRATION_DATABASE_URL --env prod --repo "$REPO"

# Variables: no son secretas (ARNs, nombre del bucket y claves de SITIO de reCAPTCHA)
gh variable set AWS_DEPLOY_ROLE_ARN --env prod --repo "$REPO" --body "<DeployRoleArn>"
gh variable set AWS_BACKUP_ROLE_ARN --env prod --repo "$REPO" --body "<BackupRoleArn>"
gh variable set BACKUP_BUCKET --env prod --repo "$REPO" --body "<BackupBucketName>"
gh variable set VITE_RECAPTCHA_SITE_KEY_V3 --env prod --repo "$REPO" --body "<clave de sitio v3>"
gh variable set VITE_RECAPTCHA_SITE_KEY_V2 --env prod --repo "$REPO" --body "<clave de sitio v2>"
```

El repositorio **no debe tener** ninguna `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY`: GitHub entra en AWS por OIDC y solo el entorno `prod` de este repositorio puede asumir los roles.

Después, publica el frontend lanzando el workflow a mano: **Actions > Deploy > Run workflow**, con la referencia de un commit de `main` (el último). Hace todos los pasos de un despliegue normal, incluidos el frontend y el smoke test. El smoke test reintenta 2 minutos; si el CNAME `app` aún no ha propagado, falla: espera y vuelve a lanzarlo.

## Paso 9. Medir `TRUST_PROXY_HOPS`

El límite de intentos usa la IP del visitante, y Express la saca de `X-Forwarded-For` contando cuántos proxies de confianza hay delante. Se espera **2** (CloudFront y API Gateway), pero **se mide, no se supone** (D7).

1. Redespliega con el log en `debug` (desde local, como en el paso 6, añadiendo `-c logLevel=debug`).
2. Haz una petición con un `X-Forwarded-For` escrito por ti:

   ```bash
   curl -s -H 'X-Forwarded-For: 198.51.100.9' https://app.calendarschools.es/api/health
   ```

3. Busca la línea `Petición recibida` en CloudWatch:

   ```bash
   aws logs tail /aws/lambda/calendarschool-prod-api --region eu-central-1 --since 5m --format short | grep 'Petición recibida'
   ```

   Lleva `ip` (lo que Express cree que es el visitante) y `forwardedFor` (la cadena completa). Con 2 saltos, `ip` debe ser **tu IP pública** y no `198.51.100.9`.
4. Si `ip` no es tu IP, cambia el valor por defecto de `trustProxyHops` en `infrastructure/lib/appStack.ts`, anota el resultado y la cadena observada en `design.md` (preguntas abiertas), haz commit y despliega.
5. El siguiente despliegue desde el workflow vuelve a `LOG_LEVEL=info` por sí solo.

## Operación diaria

### Despliegues

Cada push a `main` con `quality` y `e2e` en verde despliega solo: build, migraciones, CDK, frontend, invalidación y smoke test. Dos despliegues no se pisan.

### Volver a una versión anterior (rollback)

**Actions > Deploy > Run workflow** con la referencia de un commit anterior de `main`. Hace los mismos pasos y pasa por el smoke test. Solo admite commits que están en `main`. Ojo: las migraciones ya aplicadas no se deshacen; por eso cada migración debe ser compatible con el código anterior (*expand/contract*).

### Logs

```bash
aws logs tail /aws/lambda/calendarschool-prod-api --region eu-central-1 --follow --format short
```

Las líneas son JSON de pino (nivel, evento, causa). Se conservan 30 días. Las contraseñas y los secretos nunca se registran.

### Rotar el secreto de origen (`ORIGIN_VERIFY_SECRET`)

```bash
aws ssm put-parameter --region eu-central-1 --name /calendarschool/prod/ORIGIN_VERIFY_SECRET \
  --type SecureString --value "$(openssl rand -base64 48)" --overwrite > /dev/null
```

Y lanza el workflow de despliegue. Lee el valor nuevo, lo pasa a CloudFront y cambia un hash en la Lambda para que arranque instancias nuevas. Durante unos segundos puede haber `403`.

### Rotar otro secreto (`JWT_SECRET`, `DATABASE_URL`, reCAPTCHA)

Cambia el parámetro con `put-parameter --overwrite`. La Lambda solo lee SSM al arrancar en frío, así que fuerza instancias nuevas:

```bash
aws lambda update-function-configuration --region eu-central-1 \
  --function-name calendarschool-prod-api --description "rotación $(date -u +%F)"
```

Cambiar `JWT_SECRET` invalida los access tokens vigentes (duran 15 minutos); los refresh tokens siguen siendo válidos.

### Copias de seguridad

`backup.yml` se ejecuta cada día a las 03:17 UTC: `pg_dump` del esquema `public`, subida a S3 (se borran a los 30 días) y una llamada a `/api/health`. Esa consulta diaria evita que Supabase pause el proyecto gratuito.

Se puede lanzar a mano (**Actions > Backup > Run workflow**) y el resultado aparece en el resumen del workflow.

> **Aviso: GitHub desactiva los workflows programados** de un repositorio público tras 60 días sin actividad (commits, PR...). Si el proyecto se queda quieto, la copia diaria **deja de ejecutarse sin avisar** y Supabase puede pausar la base de datos tras 7 días sin actividad. Si ves ese aviso en la pestaña Actions, pulsa "Enable workflow", y comprueba que existe una copia reciente en S3.

### Restaurar una copia en un PostgreSQL 17 vacío

Sirve para recuperar datos y para comprobar que las copias son buenas. Se prueba una vez al poner en marcha (tarea 15.4).

```bash
BUCKET=<BackupBucketName>
aws s3 ls "s3://$BUCKET/"                                  # elige la fecha
aws s3 cp "s3://$BUCKET/calendarschool-AAAA-MM-DD.dump" .

docker compose up -d                                       # PostgreSQL 17 local
docker compose exec -T postgres createdb -U calendarschool restaurada
docker compose exec -T postgres pg_restore -U calendarschool -d restaurada \
  --no-owner --no-privileges < calendarschool-AAAA-MM-DD.dump

docker compose exec -T postgres psql -U calendarschool -d restaurada \
  -c "select (select count(*) from users) as users, (select count(*) from schools) as schools, (select count(*) from municipalities) as municipalities"
docker compose exec -T postgres dropdb -U calendarschool restaurada
```

Las tablas y los datos de la copia deben aparecer. La copia es del esquema `public` completo, incluido `_prisma_migrations`, así que una base restaurada sigue sabiendo qué migraciones tiene.

### Si hay que deshacerlo todo

`npx cdk destroy --all -c env=prod` en `infrastructure/`. Los buckets (frontend y copias) tienen `RETAIN` y se borran a mano. El proyecto de Supabase se pausa o elimina desde su panel. Los parámetros de SSM se borran con `aws ssm delete-parameter`.

## Cuando algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El smoke test falla en `GET /` o `/api/health` justo tras el primer despliegue | El CNAME `app` aún no ha propagado, o CloudFront no ha terminado de desplegar | Espera unos minutos y relanza el workflow |
| `/api/health` da `403` | La Lambda y CloudFront tienen secretos de origen distintos | Relanza el despliegue (lee SSM y actualiza los dos). Comprueba que el parámetro existe |
| `/api/health` da `503 DATABASE_UNAVAILABLE` | Cadena de conexión errónea, rol sin permisos o base de datos pausada | Mira el log (`aws logs tail`): la causa se registra. Reactiva el proyecto de Supabase si está pausado |
| La Lambda no arranca y el log dice "Configuración inválida" | Falta un parámetro de SSM o es inválido | El log lista los nombres de las variables (nunca los valores). Revisa el paso 4 |
| El log dice "No se pudieron leer los parámetros de SSM" | El rol de la Lambda no puede leer la ruta, o el nombre de entorno no coincide | `errorName` indica la causa (`AccessDeniedException`, `ParameterNotFound`...) |
| El log dice `unable to verify the first certificate` | La CA de `supabase-ca.crt` no firma el certificado del pooler | Paso 2.4: descarga la CA del panel y añádela al fichero |
| Fallan las migraciones del workflow | La cadena de `MIGRATION_DATABASE_URL` es del modo transacción (`:6543`) o la contraseña cambió | Debe ser el modo sesión (`:5432`) con `postgres.<ref>` |
| `Could not assume role` en el workflow | Falta la variable del rol, o el workflow no corre desde `main` | Revisa el paso 8; el entorno `prod` solo admite `main` |
| Una petición tras mucho rato sin uso falla y la siguiente funciona | Conexión muerta del pool al descongelar la Lambda | Anótalo en D10 (`idleTimeoutMillis` y `pool.on('error')`) |
| ACM no valida el certificado | El CNAME de validación está mal escrito en DonDominio | Compara nombre y valor con ACM; muchos paneles añaden el dominio solos |

## Al terminar la puesta en marcha: borra la clave de administrador

Si usaste una clave de acceso de un usuario de IAM (no Identity Center), elimínala en cuanto el despliegue automático funcione, porque es una credencial de larga duración con permisos de administrador:

1. En la consola: IAM > Usuarios > tu usuario > Credenciales de seguridad > la clave de acceso > **Desactivar** y después **Eliminar**.
2. En tu equipo: borra el perfil `calendarschool` de `~/.aws/credentials` y `~/.aws/config`, y el fichero de secretos que hayas usado para la puesta en marcha (por ejemplo `~/.calendarschool-secrets.env`).

A partir de ahí no hay ninguna clave de AWS en tu equipo ni en GitHub. Si algún día necesitas tocar la infraestructura a mano, crea una clave nueva, úsala y bórrala, o pasa a Identity Center.
