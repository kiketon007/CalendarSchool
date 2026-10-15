## MODIFIED Requirements

### Requirement: Access token JWT de corta duración
El sistema MUST emitir access tokens JWT firmados con HS256 con el secreto `JWT_SECRET`, con `sub` (id del usuario), `schoolId`, `role`, `sid` (id de la sesión en `refresh_tokens` desde la que se emite), `iat` y `exp`, y un TTL de 15 minutos. La verificación MUST rechazar tokens con firma incorrecta, caducados, firmados con otro algoritmo, malformados o sin `sid`. El `sid` permite que la autenticación de los endpoints protegidos compruebe en cada petición que la sesión sigue sin revocar ni caducar.

#### Scenario: Contenido del token
- **WHEN** se emite un access token para un usuario administrador de un colegio desde una sesión
- **THEN** su carga contiene `sub` con el id del usuario, `schoolId` con el del colegio, `role` igual a `ADMIN` y `sid` con el id de la sesión
- **AND** `exp` es `iat` más 900 segundos

#### Scenario: Token emitido al renovar la sesión
- **WHEN** `POST /api/auth/refresh` emite un access token
- **THEN** su `sid` es el id de la fila de `refresh_tokens` de la cookie

#### Scenario: Token válido
- **WHEN** se verifica un access token emitido hace un minuto
- **THEN** la verificación devuelve el usuario, el colegio, el rol y la sesión

#### Scenario: Token caducado
- **WHEN** se verifica un access token con más de 15 minutos de antigüedad
- **THEN** la verificación lo rechaza

#### Scenario: Firma o algoritmo no válidos
- **WHEN** se verifica un token firmado con otro secreto, con algoritmo `none` o con el cuerpo modificado
- **THEN** la verificación lo rechaza

#### Scenario: Token sin sesión
- **WHEN** se verifica un token bien firmado que no lleva `sid`
- **THEN** la verificación lo rechaza

### Requirement: Contexto de sesión en el frontend
El frontend MUST guardar el access token y el usuario solo en memoria (nunca en `localStorage`, `sessionStorage` ni cookies accesibles por JavaScript). Al cargar la aplicación MUST intentar una única renovación con `POST /api/auth/refresh` y exponer el estado de la sesión (`loading`, `authenticated` o `anonymous`). Un `401` MUST dejar la sesión como `anonymous` sin mostrar ningún error. Las peticiones MUST enviar las cookies del mismo origen. El contexto MUST exponer `logout()`, que cierra la sesión con `POST /api/auth/logout`, y MUST pasar a `anonymous` cuando otra pestaña avisa de un cierre de sesión. Una respuesta de renovación que llegue después de un cierre de sesión MUST ignorarse.

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

#### Scenario: Cierre de sesión desde el contexto
- **GIVEN** una sesión `authenticated`
- **WHEN** se llama a `logout()` y el backend responde `204`
- **THEN** el estado pasa a `anonymous` y el access token deja de estar en memoria

#### Scenario: Renovación superada por un cierre de sesión
- **GIVEN** una renovación de sesión en curso
- **WHEN** se cierra la sesión antes de que responda y después responde `200`
- **THEN** el estado sigue siendo `anonymous`

#### Scenario: Cierre de sesión en otra pestaña
- **GIVEN** una sesión `authenticated`
- **WHEN** llega por `calendarschool:session` el aviso de cierre de sesión de otra pestaña
- **THEN** el estado pasa a `anonymous` sin ninguna petición al backend
