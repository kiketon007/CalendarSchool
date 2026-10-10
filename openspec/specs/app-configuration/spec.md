# app-configuration Specification

## Purpose
Define cómo carga y valida el backend su configuración: validación de variables de entorno al arrancar, carga del fichero `.env`, aislamiento de `createApp()` respecto a `process.env` y aplicación explícita de migraciones. Origen: cambio `bootstrap-proyecto` (US00).
## Requirements
### Requirement: Validación de la configuración al arrancar
El backend MUST validar sus variables de entorno con Zod al arrancar y MUST NOT arrancar si falta alguna obligatoria o es inválida, indicando en el log qué variable falla sin mostrar su valor.

#### Scenario: Variable obligatoria ausente
- **GIVEN** `DATABASE_URL` no está definida
- **WHEN** se arranca el backend
- **THEN** el proceso termina con código distinto de cero y el log indica que falta `DATABASE_URL`

#### Scenario: Variable inválida
- **GIVEN** `PORT` tiene un valor no numérico
- **WHEN** se arranca el backend
- **THEN** el proceso termina con código distinto de cero y el log indica que `PORT` es inválida

#### Scenario: Configuración válida
- **GIVEN** todas las variables obligatorias son válidas
- **WHEN** se carga la configuración
- **THEN** se obtiene un objeto de configuración tipado

### Requirement: La aplicación no lee el entorno directamente
Solo el punto de entrada `server.ts` MUST cargar la configuración. `createApp()` MUST recibir por parámetro todas sus dependencias, ya construidas a partir de la configuración (p. ej. el logger con su nivel y el `DatabasePing` con su conexión), y MUST NOT leer `process.env`. La configuración Zod de la aplicación MUST NOT incluir `TEST_DATABASE_URL`.

#### Scenario: Tests unitarios sin variables de entorno
- **GIVEN** un entorno sin `DATABASE_URL` (como el job de CI)
- **WHEN** se ejecutan los tests unitarios que usan `createApp()`
- **THEN** pasan sin errores de configuración

### Requirement: Plantilla de entorno versionada
El repositorio MUST incluir `backend/.env.example` con todas las variables necesarias (`DATABASE_URL`, `TEST_DATABASE_URL` y el resto), con credenciales coincidentes con `docker-compose.yml`, y MUST NOT versionar ningún `.env`.

#### Scenario: Ningún .env versionado
- **WHEN** se listan los ficheros versionados
- **THEN** existe `backend/.env.example` y no existe ningún fichero `.env`

### Requirement: Carga del fichero .env
En desarrollo, el backend MUST cargar `backend/.env` con el soporte nativo de Node (`--env-file-if-exists`). La CLI de Prisma MUST cargarlo desde `prisma.config.ts` con `dotenv`, leyendo `process.env.DATABASE_URL` sin el helper `env()`, de modo que `prisma generate` funcione sin `.env` y una variable ya definida en el entorno tenga prioridad sobre el fichero.

#### Scenario: Instalación sin .env
- **GIVEN** un clon limpio sin `backend/.env`
- **WHEN** se ejecuta `npm install`
- **THEN** el `postinstall` genera el cliente Prisma y la instalación termina sin errores

#### Scenario: El entorno tiene prioridad sobre el fichero
- **GIVEN** `backend/.env` define `DATABASE_URL` apuntando a `calendarschool`
- **WHEN** se invoca la CLI de Prisma con `DATABASE_URL` apuntando a `calendarschool_test` en el entorno
- **THEN** la CLI opera sobre `calendarschool_test`

### Requirement: Migraciones explícitas
Las migraciones MUST aplicarse solo mediante pasos explícitos y nunca al arrancar la aplicación: `npm run db:migrate` (`prisma migrate deploy`) para la base de desarrollo, el `globalSetup` de Vitest para los esquemas de test por worker y `test:e2e` para el esquema `public` de test.

#### Scenario: Migración de la base de desarrollo
- **GIVEN** PostgreSQL levantado con Docker Compose y `backend/.env` creado
- **WHEN** se ejecuta `npm run db:migrate`
- **THEN** la migración inicial queda aplicada en `calendarschool`

#### Scenario: Arrancar no migra
- **GIVEN** una migración pendiente
- **WHEN** se ejecuta `npm run dev`
- **THEN** el backend arranca sin aplicar la migración

### Requirement: Configuración de la sesión
`loadConfig` MUST exigir `JWT_SECRET` (cadena de al menos 32 caracteres) y `APP_ORIGIN` (URL con esquema `http` o `https` y host, sin ruta, y que `loadConfig` normaliza a su origen) y MUST NOT arrancar el backend si falta alguna o es inválida. El error MUST nombrar la variable sin mostrar su valor. `backend/.env.example` y el entorno del backend de `scripts/e2e.mjs` MUST definirlas con valores de desarrollo; como CI solo arranca el backend a través de ese script, el workflow no necesita definirlas.

#### Scenario: Secreto ausente
- **GIVEN** `JWT_SECRET` no está definida
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que indica `JWT_SECRET` sin mostrar ningún valor

#### Scenario: Secreto demasiado corto
- **GIVEN** `JWT_SECRET` tiene 31 caracteres
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que indica `JWT_SECRET`
- **AND** el mensaje no contiene el valor del secreto

#### Scenario: Origen inválido
- **GIVEN** `APP_ORIGIN` es `localhost:5173` (sin esquema) o `http://localhost:5173/app` (con ruta)
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que indica `APP_ORIGIN`

#### Scenario: Configuración de sesión válida
- **GIVEN** `JWT_SECRET` de 32 o más caracteres y `APP_ORIGIN` igual a `http://localhost:5173`
- **WHEN** se carga la configuración
- **THEN** el objeto devuelto contiene `jwtSecret` y `appOrigin`

#### Scenario: Plantilla actualizada
- **WHEN** se lee `backend/.env.example`
- **THEN** contiene `JWT_SECRET` y `APP_ORIGIN` con valores de desarrollo que `loadConfig` acepta

### Requirement: Configuración del límite de intentos
`loadConfig` MUST aceptar dos variables opcionales: `TRUST_PROXY_HOPS` (entero mayor o igual que 0, por defecto `0`), número de proxies de confianza delante del backend, y `REGISTRATION_ATTEMPTS_MAX` (entero mayor o igual que 1, por defecto `5`), máximo de intentos de registro por IP cada 15 minutos. Un valor inválido MUST impedir el arranque con un error que nombra la variable. `backend/.env.example` MUST documentarlas comentadas con sus valores por defecto.

#### Scenario: Valores por defecto
- **GIVEN** ninguna de las dos variables definida
- **WHEN** se carga la configuración
- **THEN** `trustProxyHops` es `0` y `registrationAttemptsMax` es `5`

#### Scenario: Valores válidos
- **GIVEN** `TRUST_PROXY_HOPS=2` y `REGISTRATION_ATTEMPTS_MAX=1000`
- **WHEN** se carga la configuración
- **THEN** `trustProxyHops` es `2` y `registrationAttemptsMax` es `1000`

#### Scenario: Valores inválidos
- **GIVEN** `TRUST_PROXY_HOPS` es `-1` o `abc`, o `REGISTRATION_ATTEMPTS_MAX` es `0` o `2.5`
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra la variable inválida

#### Scenario: Plantilla documentada
- **WHEN** se lee `backend/.env.example`
- **THEN** contiene `TRUST_PROXY_HOPS` y `REGISTRATION_ATTEMPTS_MAX` comentadas, con su valor por defecto y su propósito
- **AND** `loadConfig` sigue aceptando la plantilla

### Requirement: Configuración de reCAPTCHA
En el backend, `loadConfig` MUST aceptar `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` como cadenas no vacías, las dos o ninguna, y MUST exigirlas cuando `NODE_ENV` es `production`. Un valor inválido MUST impedir el arranque con un error que nombra la variable sin mostrar su valor. En el frontend, `VITE_RECAPTCHA_SITE_KEY_V3` y `VITE_RECAPTCHA_SITE_KEY_V2` MUST definirse las dos o ninguna, y un único módulo MUST leerlas. Las plantillas de entorno MUST documentarlas comentadas.

#### Scenario: Sin secretos en desarrollo
- **GIVEN** `NODE_ENV=development` sin ninguno de los dos secretos
- **WHEN** se carga la configuración
- **THEN** no hay configuración de reCAPTCHA y el backend usará el verificador falso

#### Scenario: Con los dos secretos
- **GIVEN** los dos secretos definidos
- **WHEN** se carga la configuración
- **THEN** la configuración contiene los dos secretos

#### Scenario: Solo uno de los dos
- **GIVEN** solo `RECAPTCHA_V3_SECRET` definida, o solo `RECAPTCHA_V2_SECRET`
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra la variable que falta

#### Scenario: Producción sin secretos
- **GIVEN** `NODE_ENV=production` sin los secretos
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET`, sin mostrar ningún valor

#### Scenario: Claves de sitio incompletas en el frontend
- **GIVEN** solo una de las dos claves de sitio definida
- **WHEN** se lee la configuración del captcha en el frontend
- **THEN** lanza un error que nombra la que falta

#### Scenario: Plantillas documentadas
- **WHEN** se leen `backend/.env.example` y `frontend/.env.example`
- **THEN** contienen las variables de reCAPTCHA comentadas, con su propósito
- **AND** `loadConfig` sigue aceptando la plantilla del backend

