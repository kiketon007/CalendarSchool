## ADDED Requirements

### Requirement: Respuestas de la API sin caché por defecto
Todas las respuestas bajo `/api`, de éxito o de error (incluidas las de `notFoundHandler` y `errorHandler`), MUST llevar `Cache-Control: no-store`, fijado por un middleware común de `createApp`, para que el navegador no guarde datos de la sesión que se puedan ver tras cerrarla. Una ruta MAY sustituirlo por su propia política solo si sus datos son públicos: `GET /api/municipalities` mantiene `public` con `max-age` de un día.

#### Scenario: Respuesta de éxito sin caché
- **WHEN** se llama a `GET /api/health`
- **THEN** la respuesta incluye `Cache-Control: no-store`

#### Scenario: Respuesta de error sin caché
- **WHEN** se llama a una ruta inexistente bajo `/api` o una petición termina en error
- **THEN** la respuesta incluye `Cache-Control: no-store`

#### Scenario: Ruta con caché propia
- **WHEN** se llama a `GET /api/municipalities` con éxito
- **THEN** la respuesta incluye `Cache-Control` con `public` y `max-age` de al menos 86400 segundos, y no `no-store`

### Requirement: Fallos de conexión con la base de datos traducidos a 503
Los repositorios de Prisma MUST traducir cualquier fallo de conexión con la base de datos a `DatabaseUnavailable`, que la API responde como `503 DATABASE_UNAVAILABLE` sin detalles técnicos, y MUST conservar la causa original para el log. Se consideran fallos de conexión los códigos de red `ECONNREFUSED`, `ETIMEDOUT` y `ENOTFOUND`, los códigos de Prisma `P1000`, `P1001`, `P1002`, `P1008` y `P1017`, y el error sin código que lanza el pool de `pg` cuando el servidor corta la conexión durante la consulta (`Connection terminated unexpectedly`) o por el tiempo de conexión del cliente (`Connection terminated due to connection timeout`). Cualquier otro error MUST propagarse sin traducir.

#### Scenario: Conexión cortada por el servidor durante la consulta
- **GIVEN** un servidor que acepta la conexión y la cierra tras recibir el mensaje de arranque, como el proxy de puertos de Docker con el contenedor de PostgreSQL parado
- **WHEN** un repositorio ejecuta una consulta
- **THEN** lanza `DatabaseUnavailable` con la causa original
- **AND** la petición HTTP correspondiente responde `503 DATABASE_UNAVAILABLE`, no `500 INTERNAL_ERROR`

#### Scenario: Errores que no son de conexión
- **WHEN** una consulta falla por una violación de unicidad u otro error que no es de conexión
- **THEN** el error se propaga sin traducir
