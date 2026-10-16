# user-logout Specification

## Purpose
Define el cierre de sesión (`POST /api/auth/logout`, US03): su contrato en `docs/api-spec.yml`, la revocación idempotente de la sesión de la cookie (solo esa sesión, nunca `401`) con la cookie borrada, el `Origin` obligatorio, el `503` sin borrar la cookie cuando la base de datos no responde, los eventos de log sin datos sensibles, la cabecera con el botón «Cerrar sesión» sin confirmación, el comportamiento del frontend tras cerrar (o no poder cerrar) la sesión, la sincronización entre pestañas con `BroadcastChannel` y las pruebas E2E. Origen: cambio `cierre-sesion` (US03).
## Requirements
### Requirement: Contrato del cierre de sesión documentado en OpenAPI
`docs/api-spec.yml` MUST describir `POST /api/auth/logout` antes de implementarlo: sin cuerpo de petición, con la cookie `refresh_token` opcional, y con las respuestas `204` (con la cabecera `Set-Cookie` que borra la cookie), `403` y `503` reutilizando `components.responses`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Endpoint documentado
- **WHEN** se consulta `docs/api-spec.yml`
- **THEN** describe `POST /api/auth/logout` con las respuestas `204`, `403` y `503`
- **AND** `frontend/src/api/generated/schema.ts` incluye la operación

### Requirement: Cierre de sesión con POST /api/auth/logout
`POST /api/auth/logout` MUST procesar la petición en este orden: (1) `Origin` igual a `APP_ORIGIN` (`requireAllowedOrigin`), o `403 ORIGIN_NOT_ALLOWED`; (2) si la cookie `refresh_token` falta, no corresponde a ninguna sesión, o su sesión ya está revocada o caducada, responder `204` con la cookie borrada y sin cambiar nada en la base de datos; (3) si la sesión es utilizable, revocarla (`revokedAt = now()`, solo si aún es nulo) y responder `204` con la cookie borrada. La cookie MUST borrarse con `Max-Age=0` y los mismos atributos con los que se creó (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`). El cierre de sesión MUST NOT responder `401` y MUST revocar solo la sesión de la cookie.

#### Scenario: Cerrar una sesión válida
- **GIVEN** un usuario con una sesión válida
- **WHEN** envía `POST /api/auth/logout` con su cookie y el `Origin` de la aplicación
- **THEN** la respuesta es `204` sin cuerpo
- **AND** incluye `Set-Cookie` que borra `refresh_token` con `Max-Age=0`, `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/api/auth`
- **AND** su fila de `refresh_tokens` tiene `revokedAt` informado

#### Scenario: El refresh token cerrado ya no renueva la sesión
- **GIVEN** un usuario que ha cerrado sesión
- **WHEN** se envía su refresh token anterior a `POST /api/auth/refresh`
- **THEN** la respuesta es `401 INVALID_SESSION`

#### Scenario: Otras sesiones intactas
- **GIVEN** un usuario con sesiones en dos navegadores
- **WHEN** cierra sesión en uno
- **THEN** el refresh token del otro sigue renovando la sesión

#### Scenario: Sin sesión que cerrar
- **WHEN** se envía `POST /api/auth/logout` sin cookie, con un token desconocido, con uno ya revocado o con uno caducado
- **THEN** la respuesta es `204` con la cookie borrada
- **AND** ninguna fila de `refresh_tokens` cambia

#### Scenario: Origen no permitido
- **WHEN** se envía `POST /api/auth/logout` con un `Origin` distinto de `APP_ORIGIN` o sin él
- **THEN** la respuesta es `403 ORIGIN_NOT_ALLOWED`
- **AND** la sesión de la cookie sigue siendo válida y la respuesta no borra la cookie

### Requirement: Fallo al cerrar sesión sin borrar la cookie
Si la base de datos no responde al buscar o revocar la sesión, `POST /api/auth/logout` MUST responder `503 DATABASE_UNAVAILABLE` y MUST NOT borrar la cookie, para que el navegador no dé por cerrada una sesión que sigue válida en el servidor.

#### Scenario: Base de datos no disponible
- **GIVEN** la base de datos no responde
- **WHEN** se envía `POST /api/auth/logout` con una cookie de sesión
- **THEN** la respuesta es `503 DATABASE_UNAVAILABLE`
- **AND** no incluye ningún `Set-Cookie` que borre `refresh_token`

### Requirement: Registro de eventos del cierre de sesión sin datos sensibles
El cierre de sesión MUST registrar `USER_LOGOUT` (`info`) con el id del usuario, la IP y el user agent cuando revoca una sesión, y `USER_LOGOUT_WITHOUT_SESSION` (`info`) con `reason` `MISSING`, `UNKNOWN`, `REVOKED` o `EXPIRED`, la IP y el user agent cuando no hay sesión que revocar. Los logs MUST NOT contener el refresh token, su hash ni la cookie.

#### Scenario: Cierre registrado
- **WHEN** un usuario cierra una sesión válida
- **THEN** se registra `USER_LOGOUT` con su id, la IP y el user agent

#### Scenario: Cierre sin sesión registrado
- **WHEN** se cierra sesión con un token ya revocado
- **THEN** se registra `USER_LOGOUT_WITHOUT_SESSION` con `reason` `REVOKED`

#### Scenario: Sin datos sensibles
- **WHEN** se procesa cualquier cierre de sesión
- **THEN** ninguna línea de log contiene el refresh token, su hash ni la cabecera `Cookie`

### Requirement: Cabecera con el botón de cierre de sesión
El frontend MUST mostrar, solo con la sesión iniciada y en todas las páginas, una cabecera con el nombre de la aplicación, el nombre del usuario, el nombre de su colegio y un botón «Cerrar sesión». El botón MUST cerrar la sesión directamente, sin diálogo de confirmación, y MUST estar deshabilitado mientras el cierre está en curso, con una guarda síncrona contra pulsaciones repetidas. Todos los textos MUST venir de i18n.

#### Scenario: Cabecera con sesión
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre cualquier página
- **THEN** ve la cabecera con su nombre, el de su colegio y el botón «Cerrar sesión»

#### Scenario: Sin cabecera sin sesión
- **WHEN** un visitante sin sesión abre `/login`, `/registro` o `/privacidad`
- **THEN** no ve la cabecera

#### Scenario: Una sola petición por pulsación
- **WHEN** el usuario pulsa «Cerrar sesión» dos veces seguidas
- **THEN** se envía una única petición `POST /api/auth/logout`

### Requirement: Comportamiento del frontend al cerrar sesión
Tras un `204` de `POST /api/auth/logout`, el frontend MUST descartar el access token y el usuario de la memoria, dejar la sesión como `anonymous`, descartar cualquier renovación de sesión en curso y navegar a `/login` reemplazando la entrada del historial. Con un `503`, un error de red o cualquier otra respuesta, MUST mantener la sesión y mostrar «No se ha podido cerrar la sesión. Inténtalo de nuevo» con `role="alert"`. El servicio que llama al endpoint MUST interpretar la respuesta por su código y MUST NOT lanzar excepciones.

#### Scenario: Cierre correcto
- **GIVEN** un usuario con la sesión iniciada en `/onboarding`
- **WHEN** pulsa «Cerrar sesión» y el backend responde `204`
- **THEN** llega a `/login` y la cabecera desaparece

#### Scenario: La sesión no vuelve al recargar ni con «Atrás»
- **GIVEN** un usuario que acaba de cerrar sesión
- **WHEN** recarga la página o vuelve atrás a `/onboarding`
- **THEN** se le redirige a `/login`

#### Scenario: Cierre fallido
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** pulsa «Cerrar sesión» y el backend responde `503` o la red falla
- **THEN** sigue en la misma página con la sesión iniciada
- **AND** ve «No se ha podido cerrar la sesión. Inténtalo de nuevo»

### Requirement: Sincronización del cierre de sesión entre pestañas
Tras un cierre de sesión correcto, el frontend MUST avisar a las demás pestañas del mismo navegador por un `BroadcastChannel` llamado `calendarschool:session`. Cada pestaña que recibe el aviso MUST dejar su sesión como `anonymous` sin llamar al backend, de modo que su página la lleve a `/login`. Si el navegador no tiene `BroadcastChannel`, el cierre MUST funcionar igual en la pestaña actual, sin errores.

#### Scenario: Otra pestaña abierta
- **GIVEN** un usuario con CalendarSchool abierto en dos pestañas
- **WHEN** cierra sesión en una
- **THEN** la otra pasa a `/login` sin intervención del usuario y sin llamar al backend

#### Scenario: Navegador sin BroadcastChannel
- **GIVEN** un navegador sin `BroadcastChannel`
- **WHEN** el usuario cierra sesión
- **THEN** llega a `/login` y no se produce ningún error

### Requirement: Pruebas E2E del cierre de sesión
El E2E MUST cubrir con Cypress el flujo login → «Cerrar sesión» → `/login`, que tras recargar la página sigue sin sesión y que el refresh token anterior responde `401 INVALID_SESSION`.

#### Scenario: Flujo de cierre de sesión
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** la spec de cierre de sesión inicia sesión, cierra sesión, comprueba la redirección a `/login`, recarga sin recuperar la sesión y comprueba el `401` del token anterior

