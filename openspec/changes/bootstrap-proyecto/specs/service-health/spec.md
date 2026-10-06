## ADDED Requirements

### Requirement: Endpoint de salud del servicio
El backend MUST exponer `GET /api/health`, sin autenticación, que informe del estado del servicio y de la conexión a la base de datos usando el formato de respuesta común de la API. La respuesta MUST NOT incluir detalles internos (versión de PostgreSQL, host, credenciales, mensajes ni trazas de error).

#### Scenario: Servicio y base de datos disponibles
- **GIVEN** el backend está en marcha y la base de datos responde
- **WHEN** un cliente hace `GET /api/health`
- **THEN** recibe `200` con el cuerpo `{ "success": true, "data": { "status": "ok", "database": "up" } }`

#### Scenario: Base de datos no disponible
- **GIVEN** el backend está en marcha y la base de datos rechaza la conexión
- **WHEN** un cliente hace `GET /api/health`
- **THEN** recibe `503` con `{ "success": false, "error": { "code": "DATABASE_UNAVAILABLE", "message": "..." } }`
- **AND** el error original de la base de datos se registra en el log y no aparece en la respuesta

#### Scenario: La respuesta no expone detalles internos
- **GIVEN** cualquier estado de la base de datos
- **WHEN** un cliente hace `GET /api/health`
- **THEN** el cuerpo no contiene la versión de PostgreSQL, el host, el puerto, el usuario ni ninguna traza de error

### Requirement: Timeout propio de la comprobación de base de datos
La comprobación de la base de datos MUST tener un timeout propio de 2 segundos, menor que el timeout de 10 segundos de la petición, de modo que una base de datos colgada produzca un `503` rápido y no un timeout genérico.

#### Scenario: Base de datos que no responde
- **GIVEN** la comprobación de la base de datos no termina
- **WHEN** un cliente hace `GET /api/health`
- **THEN** recibe `503` con el código `DATABASE_UNAVAILABLE` tras unos 2 segundos, sin esperar al timeout de 10 segundos de la petición

### Requirement: Comprobación de salud desacoplada de Prisma
La lógica de salud MUST depender de un puerto `DatabasePing` definido en la capa de aplicación, implementado por un adaptador Prisma en infraestructura e inyectado en `createApp()`, de modo que se pueda probar sin base de datos.

#### Scenario: Prueba unitaria sin base de datos
- **GIVEN** `createApp()` recibe un `DatabasePing` falso que indica que la base de datos está caída
- **WHEN** un test hace `GET /api/health` con Supertest
- **THEN** recibe `503` con `DATABASE_UNAVAILABLE` sin que exista ninguna conexión real a PostgreSQL

#### Scenario: Adaptador real contra la base de test
- **GIVEN** el adaptador Prisma de `DatabasePing` conectado a `calendarschool_test`
- **WHEN** un test de integración hace `GET /api/health`
- **THEN** recibe `200` con `database: "up"`
