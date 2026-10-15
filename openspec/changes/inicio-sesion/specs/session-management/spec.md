## MODIFIED Requirements

### Requirement: Refresh token persistente y revocable
El sistema MUST generar cada refresh token como una cadena aleatoria criptográficamente segura de al menos 256 bits y MUST guardar en la tabla `refresh_tokens` solo su hash SHA-256 (`tokenHash`, único), nunca el token en claro. Cada registro MUST tener identificador UUIDv7, `userId` (FK a `users`), `expiresAt` (24 horas después de la creación), `revokedAt` (nulo mientras sea válido) y `createdAt`. El registro MUST NOT guardar la IP ni el user agent del cliente: ninguna funcionalidad los usa, y guardarlos obligaría a conservar datos personales mientras exista la cuenta, sin purga. La IP y el user agent de una sesión solo quedan en los logs de actividad, que se conservan 30 días. Un token MUST considerarse utilizable solo si existe, `revokedAt` es nulo y `expiresAt` es posterior al instante actual.

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

#### Scenario: La tabla no guarda datos del cliente
- **WHEN** se inspecciona la estructura de la tabla `refresh_tokens`
- **THEN** no tiene columnas para la IP ni para el user agent

#### Scenario: Una sesión no deja la IP ni el user agent en la base de datos
- **WHEN** se crea una sesión desde una petición con una IP y un user agent conocidos, en el registro y en el inicio de sesión
- **THEN** ningún valor de ninguna columna de `refresh_tokens` contiene esa IP ni ese user agent
