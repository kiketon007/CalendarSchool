## ADDED Requirements

### Requirement: Peticiones autenticadas desde el frontend
El frontend MUST hacer las peticiones a los endpoints protegidos con un cliente que añade `Authorization: Bearer <access token>` con el token de la sesión en memoria. Ante un `401` con `INVALID_SESSION`, el cliente MUST renovar la sesión una sola vez con `refresh()` del contexto y, si la renovación da una sesión `authenticated`, repetir la petición una única vez con el token nuevo. Si la renovación no da una sesión, la sesión queda `anonymous` y la petición se resuelve como no autenticada, sin más reintentos. Varias peticiones que reciben `401` a la vez MUST compartir una única renovación. Cualquier otra respuesta MUST devolverse tal cual al servicio que hizo la petición. El cliente MUST NOT persistir el token.

#### Scenario: Token caducado con la sesión viva
- **GIVEN** una sesión `authenticated` cuyo access token ha caducado
- **WHEN** se hace una petición protegida, la API responde `401 INVALID_SESSION` y la renovación responde `200`
- **THEN** la petición se repite con el token nuevo y su respuesta llega al servicio

#### Scenario: Sesión perdida
- **WHEN** una petición protegida recibe `401 INVALID_SESSION` y la renovación responde `401`
- **THEN** la sesión pasa a `anonymous`, la petición no se repite y el servicio la recibe como no autenticada

#### Scenario: Un solo reintento
- **WHEN** la petición repetida tras renovar vuelve a recibir `401`
- **THEN** no se renueva ni se repite otra vez

#### Scenario: Renovación compartida
- **WHEN** dos peticiones protegidas reciben `401 INVALID_SESSION` a la vez
- **THEN** se hace una única petición `POST /api/auth/refresh` y las dos se repiten con el token nuevo

#### Scenario: Otras respuestas
- **WHEN** una petición protegida recibe `403` o `503`
- **THEN** el cliente no renueva la sesión y devuelve la respuesta al servicio
