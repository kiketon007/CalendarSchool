## ADDED Requirements

### Requirement: Refresh token persistente y revocable
El sistema MUST generar cada refresh token como una cadena aleatoria criptográficamente segura de al menos 256 bits y MUST guardar en la tabla `refresh_tokens` solo su hash SHA-256 (`tokenHash`, único), nunca el token en claro. Cada registro MUST tener identificador UUIDv7, `userId` (FK a `users`), `expiresAt` (24 horas después de la creación), `revokedAt` (nulo mientras sea válido), `userAgent`, `ipAddress` y `createdAt`. Un token MUST considerarse utilizable solo si existe, `revokedAt` es nulo y `expiresAt` es posterior al instante actual.

#### Scenario: Solo se guarda el hash
- **WHEN** se crea una sesión
- **THEN** la fila de `refresh_tokens` contiene el SHA-256 del token en `tokenHash`, 64 caracteres hexadecimales
- **AND** el token en claro no aparece en ninguna columna ni en los logs

#### Scenario: Tokens distintos para sesiones distintas
- **WHEN** se crean dos sesiones
- **THEN** sus refresh tokens y sus `tokenHash` son distintos

#### Scenario: Vigencia de 24 horas
- **WHEN** se crea una sesión en el instante T
- **THEN** `expiresAt` es T más 24 horas

#### Scenario: Token revocado o caducado
- **GIVEN** un refresh token con `revokedAt` informado, o con `expiresAt` anterior al instante actual
- **WHEN** se evalúa si es utilizable
- **THEN** no lo es

#### Scenario: Borrado en cascada del usuario
- **WHEN** se elimina un usuario en la base de datos
- **THEN** se eliminan sus refresh tokens

### Requirement: Access token JWT de corta duración
El sistema MUST emitir access tokens JWT firmados con HS256 con el secreto `JWT_SECRET`, con `sub` (id del usuario), `schoolId`, `role`, `iat` y `exp`, y un TTL de 15 minutos. La verificación MUST rechazar tokens con firma incorrecta, caducados, firmados con otro algoritmo o malformados.

#### Scenario: Contenido del token
- **WHEN** se emite un access token para un usuario administrador de un colegio
- **THEN** su carga contiene `sub` con el id del usuario, `schoolId` con el del colegio y `role` igual a `ADMIN`
- **AND** `exp` es `iat` más 900 segundos

#### Scenario: Token válido
- **WHEN** se verifica un access token emitido hace un minuto
- **THEN** la verificación devuelve el usuario, el colegio y el rol

#### Scenario: Token caducado
- **WHEN** se verifica un access token con más de 15 minutos de antigüedad
- **THEN** la verificación lo rechaza

#### Scenario: Firma o algoritmo no válidos
- **WHEN** se verifica un token firmado con otro secreto, con algoritmo `none` o con el cuerpo modificado
- **THEN** la verificación lo rechaza

### Requirement: Cookie de sesión segura
La respuesta de un registro correcto MUST fijar el refresh token en una cookie llamada `refresh_token` con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth` y `Max-Age` de 86400 segundos. Esa respuesta y la respuesta correcta (`200`) de `POST /api/auth/refresh`, que contienen o fijan credenciales, MUST llevar `Cache-Control: no-store`; las respuestas de error no llevan credenciales y no lo necesitan. El refresh token MUST NOT aparecer nunca en el cuerpo de una respuesta.

#### Scenario: Atributos de la cookie
- **WHEN** el servidor inicia una sesión
- **THEN** la cabecera `Set-Cookie` de `refresh_token` incluye `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth` y `Max-Age=86400`

#### Scenario: Token fuera del cuerpo
- **WHEN** el servidor inicia una sesión
- **THEN** el cuerpo de la respuesta no contiene el refresh token ni su hash

#### Scenario: Respuesta no cacheable
- **WHEN** el servidor responde a un registro correcto o a un refresh correcto
- **THEN** la respuesta incluye `Cache-Control: no-store`

### Requirement: Renovación del access token con POST /api/auth/refresh
`POST /api/auth/refresh` MUST ser un endpoint público (sin access token) que lee la cookie `refresh_token` y, si el token es utilizable y el usuario está `ACTIVE`, responde `200` con el formato de éxito común y `data` con `session` (`accessToken` y `expiresIn` en segundos), el usuario (`id`, `email`, `firstName`, `lastName`, `role`) y su colegio (`id`, `name`). Es la única operación que emite access tokens. MUST NOT rotar el refresh token ni ampliar su caducidad. Si falta la cookie, el token no existe, está revocado o caducado, o el usuario no está `ACTIVE`, MUST responder `401` con `INVALID_SESSION`, sin indicar la causa, y borrar la cookie. Las respuestas `5xx` y las comunes a toda la API siguen el formato de error común. El endpoint MUST documentarse en `docs/api-spec.yml`.

#### Scenario: Renovación correcta
- **GIVEN** un usuario registrado, con su cookie `refresh_token` vigente
- **WHEN** se envía `POST /api/auth/refresh` con esa cookie y un `Origin` permitido
- **THEN** responde `200` con un `accessToken` nuevo, `expiresIn` igual a 900, los datos del usuario y el nombre de su colegio
- **AND** el refresh token sigue siendo el mismo y su `expiresAt` no cambia

#### Scenario: Sin cookie
- **WHEN** se envía `POST /api/auth/refresh` sin la cookie
- **THEN** responde `401` con `INVALID_SESSION` en el formato de error común

#### Scenario: Token desconocido
- **WHEN** la cookie contiene un valor que no corresponde a ningún refresh token
- **THEN** responde `401` con `INVALID_SESSION`
- **AND** la respuesta borra la cookie (`Max-Age=0`)

#### Scenario: Token revocado
- **GIVEN** un refresh token con `revokedAt` informado
- **WHEN** se envía `POST /api/auth/refresh` con su cookie
- **THEN** responde `401` con `INVALID_SESSION`, indistinguible de un token desconocido

#### Scenario: Token caducado
- **GIVEN** un refresh token con más de 24 horas
- **WHEN** se envía `POST /api/auth/refresh` con su cookie
- **THEN** responde `401` con `INVALID_SESSION`

#### Scenario: Usuario no activo
- **GIVEN** un refresh token vigente cuyo usuario tiene estado `SUSPENDED` o `DELETED`
- **WHEN** se envía `POST /api/auth/refresh` con su cookie
- **THEN** responde `401` con `INVALID_SESSION`

#### Scenario: Base de datos no disponible
- **WHEN** la base de datos no responde mientras se procesa un refresh
- **THEN** responde `503` con `DATABASE_UNAVAILABLE`, sin detalles técnicos, y no borra la cookie

#### Scenario: Eventos de log
- **WHEN** un refresh tiene éxito o falla
- **THEN** se registra `SESSION_REFRESHED` o `SESSION_REFRESH_FAILED`, este último con `reason` (`MISSING`, `UNKNOWN`, `REVOKED`, `EXPIRED` o `USER_INACTIVE`), IP y user agent
- **AND** ningún log contiene el token

#### Scenario: Un visitante sin sesión no genera avisos
- **GIVEN** un visitante anónimo que abre cualquier página, con lo que la aplicación intenta una renovación sin cookie
- **WHEN** el refresh falla con `reason` `MISSING`
- **THEN** `SESSION_REFRESH_FAILED` se registra con nivel `info`, porque es el caso normal de quien aún no ha iniciado sesión
- **AND** los demás motivos (`UNKNOWN`, `REVOKED`, `EXPIRED` y `USER_INACTIVE`), que indican un token que existió o se falsificó, se registran con nivel `warn`

#### Scenario: Códigos de error sincronizados
- **WHEN** se ejecutan los tests del backend
- **THEN** `INVALID_SESSION` y `ORIGIN_NOT_ALLOWED` figuran en el enum `ErrorCode` del contrato y en `ERROR_CODES`, y `appError.test.ts` pasa

### Requirement: Protección frente a CSRF y fijación de sesión
`POST /api/auth/refresh` MUST rechazar con `403` y `ORIGIN_NOT_ALLOWED` toda petición cuya cabecera `Origin` falte o no coincida con `APP_ORIGIN`, sin consultar la base de datos. El identificador de sesión MUST generarlo siempre el servidor tras el alta, y MUST NOT aceptarse uno aportado por el cliente. El servidor MUST NOT habilitar CORS para otros orígenes.

#### Scenario: Origen permitido
- **WHEN** se envía `POST /api/auth/refresh` con `Origin` igual a `APP_ORIGIN` y una cookie válida
- **THEN** responde `200`

#### Scenario: Origen ajeno
- **WHEN** se envía `POST /api/auth/refresh` con `Origin: https://malicioso.example` y una cookie válida
- **THEN** responde `403` con `ORIGIN_NOT_ALLOWED`
- **AND** no se consulta la base de datos

#### Scenario: Origen ausente
- **WHEN** se envía `POST /api/auth/refresh` sin cabecera `Origin`
- **THEN** responde `403` con `ORIGIN_NOT_ALLOWED`

#### Scenario: Sin CORS para otros orígenes
- **WHEN** se envía una petición con `Origin: https://malicioso.example` a cualquier endpoint
- **THEN** la respuesta no incluye `Access-Control-Allow-Origin`
- **AND** una petición `OPTIONS` de preflight desde ese origen no obtiene permisos

#### Scenario: Cookie aportada por el cliente en el registro
- **WHEN** se envía `POST /api/auth/register` con una cookie `refresh_token` cualquiera
- **THEN** la sesión creada usa un token generado por el servidor y la cookie enviada se ignora
- **AND** el token enviado por el cliente no existe en `refresh_tokens`

### Requirement: Contexto de sesión en el frontend
El frontend MUST guardar el access token y el usuario solo en memoria (nunca en `localStorage`, `sessionStorage` ni cookies accesibles por JavaScript). Al cargar la aplicación MUST intentar una única renovación con `POST /api/auth/refresh` y exponer el estado de la sesión (`loading`, `authenticated` o `anonymous`). Un `401` MUST dejar la sesión como `anonymous` sin mostrar ningún error. Las peticiones MUST enviar las cookies del mismo origen.

#### Scenario: Sesión recuperada tras recargar
- **GIVEN** un usuario con sesión iniciada que recarga la página
- **WHEN** la aplicación se monta y `refresh` responde `200`
- **THEN** el estado pasa de `loading` a `authenticated` con los datos del usuario y de su colegio

#### Scenario: Sin sesión
- **WHEN** la aplicación se monta y `refresh` responde `401`
- **THEN** el estado es `anonymous` y no se muestra ningún mensaje de error

#### Scenario: Una sola renovación en el arranque
- **WHEN** la aplicación se monta en modo estricto de React
- **THEN** se realiza una única petición `POST /api/auth/refresh`

#### Scenario: El token no se persiste
- **WHEN** hay una sesión iniciada
- **THEN** `localStorage` y `sessionStorage` no contienen el access token
