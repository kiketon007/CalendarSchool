# serverless-runtime Specification

## Purpose
Define cómo se ejecuta el backend en AWS Lambda: punto de entrada, composición compartida con el servidor local, secretos desde SSM en el arranque en frío, verificación del origen y pool de conexiones acotado. Origen: cambio `despliegue-aws`.
## Requirements
### Requirement: Punto de entrada de Lambda
`backend/src/lambda.ts` MUST exportar un handler `async` que atiende eventos de la HTTP API de API Gateway (formato 2.0) con la app de `createApp()`, y la inicialización (lectura de secretos, configuración y composición) MUST hacerse una sola vez por instancia, al arrancar en frío. Como `server.ts`, `lambda.ts` MUST NOT contener lógica y MUST quedar excluido de la cobertura. La traducción de eventos a peticiones de Express MUST cubrirse con un test que invoca el handler de la librería con un evento de la HTTP API sobre una app con dobles.

#### Scenario: Salud a través del handler
- **GIVEN** la app de `createApp()` con un `DatabasePing` que responde
- **WHEN** se invoca el handler con un evento `GET /api/health` de la HTTP API
- **THEN** la respuesta tiene `statusCode` `200`, la cabecera `content-type` JSON y el cuerpo común con `"database": "up"`

#### Scenario: Cuerpo JSON y cookies
- **GIVEN** la app con una ruta que devuelve una cookie
- **WHEN** se invoca el handler con un evento `POST` con cuerpo JSON (también en base64)
- **THEN** Express recibe el cuerpo parseado y la respuesta incluye cada cookie en `cookies` y ninguna `Set-Cookie` en `headers`

#### Scenario: Varias peticiones en la misma instancia
- **WHEN** se invoca el handler dos veces
- **THEN** la configuración se carga y la app se compone una sola vez

### Requirement: Composición compartida entre los puntos de entrada
La construcción de las dependencias a partir de la configuración (logger, cliente Prisma, repositorios, casos de uso y `createApp`) MUST vivir en un único módulo que usan `server.ts` y `lambda.ts`. Los puntos de entrada MUST limitarse a obtener el entorno, llamar a ese módulo y arrancar el servidor o exportar el handler.

#### Scenario: Mismo cableado
- **GIVEN** una configuración válida
- **WHEN** se compone la aplicación desde el módulo compartido
- **THEN** `GET /api/health` responde `200` contra la base de datos de test

### Requirement: Secretos desde SSM al arrancar en frío
En Lambda, el backend MUST leer todos los parámetros `SecureString` de la ruta indicada por `SSM_PARAMETER_PATH` (descifrados), usar como nombre de variable el último segmento de cada parámetro y combinarlos con `process.env` antes de llamar a `loadConfig`. Un parámetro MUST prevalecer sobre una variable de entorno del mismo nombre. La lectura MUST paginar los resultados. Si la lectura falla, la inicialización MUST fallar con un log de pino que no incluye ningún valor, y la función MUST NOT atender peticiones. El lector MUST recibir el cliente de SSM inyectado para probarse sin AWS.

#### Scenario: Parámetros combinados
- **GIVEN** la ruta `/calendarschool/prod/` con `DATABASE_URL` y `JWT_SECRET`, y `APP_ORIGIN` en el entorno
- **WHEN** se lee el entorno
- **THEN** el resultado contiene las tres variables

#### Scenario: Varias páginas
- **GIVEN** SSM devuelve los parámetros en dos páginas
- **WHEN** se lee el entorno
- **THEN** el resultado contiene los parámetros de las dos

#### Scenario: SSM no responde
- **GIVEN** el cliente de SSM lanza un error
- **WHEN** se inicializa la función
- **THEN** la inicialización falla y el log no contiene ningún valor de parámetro

### Requirement: Solo peticiones que llegan por CloudFront
Si la configuración incluye `ORIGIN_VERIFY_SECRET`, `createApp` MUST rechazar con `403` y el código `ORIGIN_NOT_ALLOWED`, en el formato de error común, toda petición que no traiga la cabecera `X-Origin-Verify` con ese valor exacto, antes de cualquier otro middleware y comparándola en tiempo constante. El rechazo MUST registrarse a nivel `warn` sin el valor de la cabecera. Sin `ORIGIN_VERIFY_SECRET` (desarrollo, tests y E2E), la comprobación MUST NOT aplicarse. `TRUST_PROXY_HOPS` en producción MUST fijarse con el valor medido para que `req.ip` sea la IP del visitante.

#### Scenario: Cabecera correcta
- **GIVEN** `ORIGIN_VERIFY_SECRET` configurado
- **WHEN** llega `GET /api/health` con `X-Origin-Verify` igual al secreto
- **THEN** la respuesta es `200`

#### Scenario: Sin cabecera
- **GIVEN** `ORIGIN_VERIFY_SECRET` configurado
- **WHEN** llega `GET /api/health` sin `X-Origin-Verify`, o con otro valor
- **THEN** la respuesta es `403` con el código `ORIGIN_NOT_ALLOWED`
- **AND** el log no contiene el valor recibido

#### Scenario: Sin secreto configurado
- **GIVEN** `ORIGIN_VERIFY_SECRET` no configurado
- **WHEN** llega `GET /api/health` sin la cabecera
- **THEN** la respuesta es `200`

#### Scenario: Llamada directa a API Gateway
- **GIVEN** el entorno desplegado
- **WHEN** se hace `GET /api/health` a la URL `*.execute-api` sin la cabecera
- **THEN** la respuesta es `403` con el código `ORIGIN_NOT_ALLOWED`

#### Scenario: IP del visitante en producción
- **GIVEN** el entorno desplegado
- **WHEN** se hace una petición a través de CloudFront con un `X-Forwarded-For` escrito por el visitante
- **THEN** `req.ip` es la IP real del visitante y no la escrita

### Requirement: Pool de conexiones acotado
`createPrismaClient` MUST aceptar el tamaño máximo del pool, un `connectionTimeoutMillis` y la configuración de TLS. `server.ts` MUST mantener el pool por defecto y `lambda.ts` MUST usar como máximo 2 conexiones por instancia. Con `connectionTimeoutMillis`, una conexión que no se obtiene a tiempo MUST fallar y traducirse a `503 DATABASE_UNAVAILABLE`, en lugar de quedar pendiente. En producción, la conexión MUST usar TLS verificando el certificado del servidor con la CA de Supabase.

#### Scenario: Base de datos colgada
- **GIVEN** un pool con `connectionTimeoutMillis` y una base que no acepta conexiones
- **WHEN** se piden varias consultas
- **THEN** cada una falla en el tiempo fijado y no quedan peticiones pendientes acumuladas

#### Scenario: Certificado no válido
- **GIVEN** la configuración de TLS de producción
- **WHEN** el servidor presenta un certificado que no firma la CA de Supabase
- **THEN** la conexión se rechaza
