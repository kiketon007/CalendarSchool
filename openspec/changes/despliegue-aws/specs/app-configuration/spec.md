## MODIFIED Requirements

### Requirement: Validación de la configuración al arrancar
El backend MUST validar sus variables de entorno con Zod al arrancar y MUST NOT arrancar si falta alguna obligatoria o es inválida, indicando en el log qué variable falla sin mostrar su valor. El error MUST registrarse como una línea JSON de pino de nivel `fatal`, no como una traza de Node: `server.ts` MUST terminar después con código distinto de cero y `lambda.ts` MUST hacer fallar la inicialización de la función.

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

#### Scenario: Error de configuración en JSON
- **GIVEN** una configuración inválida
- **WHEN** se carga con el registro de errores de los puntos de entrada
- **THEN** se escribe una única línea JSON de pino de nivel `fatal` con los nombres de las variables inválidas y sin sus valores
- **AND** el error se propaga para que el punto de entrada termine

### Requirement: La aplicación no lee el entorno directamente
Solo los puntos de entrada `server.ts` y `lambda.ts` MUST cargar la configuración. `createApp()` MUST recibir por parámetro todas sus dependencias, ya construidas a partir de la configuración (p. ej. el logger con su nivel y el `DatabasePing` con su conexión), y MUST NOT leer `process.env`. La configuración Zod de la aplicación MUST NOT incluir `TEST_DATABASE_URL`.

#### Scenario: Tests unitarios sin variables de entorno
- **GIVEN** un entorno sin `DATABASE_URL` (como el job de CI)
- **WHEN** se ejecutan los tests unitarios que usan `createApp()`
- **THEN** pasan sin errores de configuración

## ADDED Requirements

### Requirement: Configuración de la verificación del origen
`loadConfig` MUST aceptar `ORIGIN_VERIFY_SECRET` como cadena de al menos 32 caracteres y MUST exigirla cuando `NODE_ENV` es `production`. Un valor inválido o ausente en producción MUST impedir el arranque con un error que nombra la variable sin mostrar su valor. `backend/.env.example` MUST documentarla comentada.

#### Scenario: Sin secreto en desarrollo
- **GIVEN** `NODE_ENV=development` sin `ORIGIN_VERIFY_SECRET`
- **WHEN** se carga la configuración
- **THEN** `originVerifySecret` es `undefined`

#### Scenario: Producción sin secreto
- **GIVEN** `NODE_ENV=production`, los secretos de reCAPTCHA definidos y sin `ORIGIN_VERIFY_SECRET`
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra `ORIGIN_VERIFY_SECRET`

#### Scenario: Secreto demasiado corto
- **GIVEN** `ORIGIN_VERIFY_SECRET` de 31 caracteres
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra `ORIGIN_VERIFY_SECRET` sin mostrar su valor

#### Scenario: Plantilla documentada
- **WHEN** se lee `backend/.env.example`
- **THEN** contiene `ORIGIN_VERIFY_SECRET` comentada, con su propósito
- **AND** `loadConfig` sigue aceptando la plantilla
