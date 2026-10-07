## ADDED Requirements

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
