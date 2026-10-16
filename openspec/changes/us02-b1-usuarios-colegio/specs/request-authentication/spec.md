## ADDED Requirements

### Requirement: Access token obligatorio en los endpoints protegidos
Un endpoint protegido MUST exigir la cabecera `Authorization` con el esquema `Bearer` y un access token. Si la cabecera falta, usa otro esquema, viene vacía, o el token no es un JWT HS256 válido, firmado con `JWT_SECRET` y sin caducar, el backend MUST responder `401` con el código `INVALID_SESSION` y la cabecera `WWW-Authenticate: Bearer`, sin indicar la causa en la respuesta y sin consultar la base de datos. Los endpoints protegidos MUST NOT exigir la cabecera `Origin`, porque no se autentican con cookies.

#### Scenario: Sin cabecera Authorization
- **WHEN** se llama a `GET /api/users` sin la cabecera `Authorization`
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION` y la cabecera `WWW-Authenticate: Bearer`

#### Scenario: Otro esquema o token vacío
- **WHEN** se llama a `GET /api/users` con `Authorization: Basic dXNlcjpwYXNz` o con `Authorization: Bearer ` sin token
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION`

#### Scenario: Token mal formado, con otra firma o caducado
- **WHEN** se llama a `GET /api/users` con un token que no es un JWT, firmado con otra clave, con el algoritmo `none` o caducado
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION` y no se consulta la base de datos

#### Scenario: Sin Origin
- **GIVEN** un administrador con un access token válido
- **WHEN** llama a `GET /api/users` sin la cabecera `Origin`
- **THEN** la respuesta es `200`

### Requirement: Sesión y usuario comprobados en cada petición
Con un token válido, el backend MUST leer en una única consulta por clave primaria la sesión indicada en el claim `sid` junto con su usuario, y MUST responder `401 INVALID_SESSION` con `WWW-Authenticate: Bearer` si la sesión no existe, está revocada, ha caducado, pertenece a un usuario distinto del claim `sub` o su usuario no está `ACTIVE`. Así, un cierre de sesión o una baja invalidan los access tokens al instante (decisión B). Si la base de datos no responde, MUST responder `503 DATABASE_UNAVAILABLE`, nunca `401`.

#### Scenario: Sesión cerrada con el token aún vigente
- **GIVEN** un access token vigente cuya sesión se ha cerrado con `POST /api/auth/logout`
- **WHEN** se llama a `GET /api/users` con ese token
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION`

#### Scenario: Sesión caducada o inexistente
- **WHEN** se llama a un endpoint protegido con un token cuya sesión ha caducado o no existe
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION`

#### Scenario: Sesión de otro usuario
- **WHEN** se llama a un endpoint protegido con un token firmado cuyo `sid` pertenece a una sesión de otro usuario
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION`

#### Scenario: Usuario dado de baja con el token aún vigente
- **GIVEN** un access token vigente de un usuario que ha pasado a `SUSPENDED`
- **WHEN** se llama a `GET /api/users` con ese token
- **THEN** la respuesta es `401` con `error.code` `INVALID_SESSION`

#### Scenario: Base de datos caída
- **GIVEN** un access token válido
- **WHEN** se llama a un endpoint protegido y la base de datos no responde
- **THEN** la respuesta es `503` con `error.code` `DATABASE_UNAVAILABLE`

### Requirement: Identidad de la petición leída de la base de datos
La identidad de una petición autenticada (`userId`, `schoolId`, `role` y `sessionId`) MUST salir de la sesión y del usuario leídos de la base de datos. Ninguna decisión de autorización ni de acceso a datos MUST usar los claims `role` y `schoolId` del access token, que se mantienen solo por compatibilidad. Un cambio de rol MUST aplicarse desde la siguiente petición, sin cerrar las sesiones del usuario.

#### Scenario: Rol cambiado con el token antiguo
- **GIVEN** un access token emitido con rol `ADMIN`
- **WHEN** el rol del usuario pasa a `MEMBER` en la base de datos y se llama a `GET /api/users` con ese token
- **THEN** la respuesta es `403` con `error.code` `FORBIDDEN`

#### Scenario: Ascenso con el token antiguo
- **GIVEN** un access token emitido con rol `MEMBER`
- **WHEN** el rol del usuario pasa a `ADMIN` en la base de datos y se llama a `GET /api/users` con ese token
- **THEN** la respuesta es `200`

### Requirement: Autorización por rol
Un endpoint reservado a un rol MUST responder `403` con el código `FORBIDDEN` cuando el rol de la identidad no es el exigido. La comprobación del rol MUST ir siempre después de la autenticación: una petición sin sesión válida MUST recibir `401`, nunca `403`.

#### Scenario: Miembro en un endpoint de administrador
- **GIVEN** un usuario `MEMBER` con un access token válido
- **WHEN** llama a `GET /api/users`
- **THEN** la respuesta es `403` con `error.code` `FORBIDDEN`

#### Scenario: Sin sesión en un endpoint de administrador
- **WHEN** se llama a `GET /api/users` sin access token
- **THEN** la respuesta es `401`, no `403`

### Requirement: Aislamiento de los datos por colegio
Los endpoints protegidos MUST tomar el colegio solo de la identidad de la petición y MUST NOT aceptarlo en la ruta, en la consulta ni en el cuerpo. Los puertos que leen datos del colegio MUST recibir el `schoolId` como parámetro obligatorio.

#### Scenario: Colegio en la consulta
- **GIVEN** un administrador de un colegio
- **WHEN** llama a `GET /api/users?schoolId=<id de otro colegio>`
- **THEN** la respuesta solo contiene usuarios de su propio colegio

### Requirement: Eventos de log de autenticación y autorización
El backend MUST registrar `AUTHENTICATION_REJECTED` con un `reason` (`TOKEN_MISSING`, `TOKEN_INVALID`, `SESSION_NOT_FOUND`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `SESSION_USER_MISMATCH` o `USER_INACTIVE`) a nivel `info` en cada `401` de un endpoint protegido, y `AUTHORIZATION_DENIED` con `userId`, `schoolId`, el rol actual y el exigido a nivel `warn` en cada `403 FORBIDDEN`. Los eventos que registre un endpoint protegido MUST incluir el `userId` y el `schoolId` de la identidad. Ningún log MUST contener el access token ni la cabecera `Authorization`.

#### Scenario: Rechazo registrado sin el token
- **WHEN** se llama a `GET /api/users` con un token de una sesión revocada
- **THEN** se registra `AUTHENTICATION_REJECTED` con `reason` `SESSION_REVOKED` y el log no contiene el token

#### Scenario: Denegación registrada
- **WHEN** un `MEMBER` llama a `GET /api/users`
- **THEN** se registra `AUTHORIZATION_DENIED` con su `userId`, su `schoolId`, el rol `MEMBER` y el rol exigido `ADMIN`
