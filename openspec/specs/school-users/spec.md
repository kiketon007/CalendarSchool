# school-users Specification

## Purpose
Define la lista de usuarios de un colegio para sus administradores y su gestión: el contrato de `GET /api/users`, sus campos, los estados incluidos, el orden y el aislamiento por colegio, y la página `/usuarios` con su enlace en la navegación (US02_b1); y el cambio de rol, la baja y la reactivación, con la regla de que el colegio conserve siempre un administrador activo, también con peticiones simultáneas, la baja propia prohibida, la idempotencia, el `404` uniforme y las acciones de la página con su confirmación (US02_b2).
## Requirements
### Requirement: Listado de usuarios con GET /api/users
`GET /api/users` MUST ser un endpoint protegido reservado al rol `ADMIN`. MUST responder `200` con `success: true` y en `data` un array con los usuarios del colegio de la identidad cuyo estado sea `ACTIVE` o `SUSPENDED`, cada uno con exactamente `id`, `firstName`, `lastName`, `email`, `role`, `status`, `createdAt` (fecha y hora ISO 8601) y `passwordResetPending` (booleano: `true` si el usuario tiene un restablecimiento de contraseña sin usar, sin revocar y sin caducar en el instante de la petición). Los usuarios `DELETED` MUST NOT aparecer. La lista MUST ordenarse por `lastName`, después `firstName` y después `email`. No hay paginación. La respuesta MUST llevar `Cache-Control: no-store` y MUST NOT contener el hash de la contraseña, datos de consentimiento ni ningún dato del enlace de restablecimiento (id, token o hash).

#### Scenario: Administrador con usuarios en su colegio
- **GIVEN** un colegio con un `ADMIN` y un `MEMBER` activos y un `MEMBER` `SUSPENDED`
- **WHEN** el `ADMIN` llama a `GET /api/users`
- **THEN** la respuesta es `200` con los tres usuarios, cada uno con `id`, `firstName`, `lastName`, `email`, `role`, `status`, `createdAt` y `passwordResetPending`, y nada más

#### Scenario: Restablecimiento pendiente
- **GIVEN** un `MEMBER` con un restablecimiento pendiente, otro con uno caducado y otro con uno usado
- **WHEN** el `ADMIN` llama a `GET /api/users`
- **THEN** solo el primero tiene `passwordResetPending` igual a `true`

#### Scenario: Usuarios eliminados
- **GIVEN** un colegio con un usuario en estado `DELETED`
- **WHEN** el `ADMIN` llama a `GET /api/users`
- **THEN** ese usuario no aparece en la respuesta

#### Scenario: Orden
- **GIVEN** los usuarios «Pérez Ruiz, Ana», «García López, Luis» y «García López, Ana»
- **WHEN** el `ADMIN` llama a `GET /api/users`
- **THEN** aparecen en el orden «García López, Ana», «García López, Luis» y «Pérez Ruiz, Ana»

#### Scenario: Sin caché
- **WHEN** el `ADMIN` llama a `GET /api/users`
- **THEN** la respuesta lleva `Cache-Control: no-store`

### Requirement: Solo los usuarios del propio colegio
`GET /api/users` MUST devolver solo los usuarios del colegio de la identidad de la petición, aunque existan otros colegios con usuarios.

#### Scenario: Dos colegios
- **GIVEN** dos colegios, cada uno con su administrador y un miembro
- **WHEN** el administrador del primero llama a `GET /api/users`
- **THEN** la respuesta solo contiene los dos usuarios del primer colegio

### Requirement: Página de usuarios
La página `/usuarios` MUST colgar del layout de las páginas autenticadas y de la guarda de rol `ADMIN`. MUST mostrar una tabla con nombre, apellidos, email, rol, estado y fecha de alta de cada usuario, con el rol y el estado traducidos y la fecha formateada con el idioma activo. Mientras carga MUST mostrar un indicador con `role="status"`. Si la petición falla con `503`, por la red o con cualquier respuesta inesperada, MUST mostrar «No se ha podido cargar la lista de usuarios» con `role="alert"` y un botón «Reintentar» que repite la petición. Si la API responde `403 FORBIDDEN`, la página MUST renovar la sesión y navegar a `/onboarding` reemplazando la entrada del historial, sin mensaje. Todos los textos MUST venir de i18n. El servicio que llama al endpoint MUST interpretar la respuesta por su código y MUST NOT lanzar excepciones.

#### Scenario: Administrador abre la página
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/usuarios` y la API responde `200`
- **THEN** ve la tabla con los usuarios de su colegio, con su rol y su estado traducidos y la fecha de alta

#### Scenario: Cargando
- **WHEN** se abre `/usuarios` y la API aún no ha respondido
- **THEN** se muestra un indicador con `role="status"`

#### Scenario: Servicio no disponible y reintento
- **GIVEN** que la API responde `503` a la primera petición
- **WHEN** el administrador abre `/usuarios`
- **THEN** ve «No se ha podido cargar la lista de usuarios» con `role="alert"` y el botón «Reintentar»
- **AND** al pulsarlo, si la API responde `200`, ve la tabla

#### Scenario: Rol perdido con la página abierta
- **GIVEN** un usuario cuya sesión en memoria dice `ADMIN` pero cuyo rol ya es `MEMBER`
- **WHEN** abre `/usuarios` y la API responde `403 FORBIDDEN`
- **THEN** se renueva la sesión y llega a `/onboarding`

### Requirement: Acceso a la página de usuarios desde la navegación
La navegación de las páginas autenticadas MUST mostrar el enlace «Usuarios» a `/usuarios` solo cuando el rol de la sesión es `ADMIN`.

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve el enlace «Usuarios» en la navegación, y al pulsarlo llega a `/usuarios`

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** no ve el enlace «Usuarios»

### Requirement: Usuarios del colegio de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, que un administrador recién registrado llega a `/usuarios` desde la navegación y se ve en la lista; que un `MEMBER` del mismo colegio, creado con la tarea de Cypress `createUser` (solo sobre bases `*_test`), no ve el enlace y es llevado a `/onboarding` al abrir `/usuarios`; y que tras cerrar la sesión `/usuarios` lleva a `/login`.

#### Scenario: Administrador en el E2E
- **GIVEN** un administrador registrado con datos únicos en el E2E
- **WHEN** pulsa «Usuarios» en la navegación
- **THEN** llega a `/usuarios` y ve una fila con su email y el rol de administrador

#### Scenario: Miembro en el E2E
- **GIVEN** un `MEMBER` creado con `createUser` que inicia sesión
- **WHEN** abre `/usuarios`
- **THEN** llega a `/onboarding` sin ver el enlace «Usuarios»

#### Scenario: Tras cerrar la sesión
- **GIVEN** un administrador en `/usuarios`
- **WHEN** cierra la sesión y vuelve a abrir `/usuarios`
- **THEN** llega a `/login`

### Requirement: Endpoints de gestión de usuarios
La API MUST ofrecer tres endpoints protegidos reservados al rol `ADMIN`, que reutilizan la autenticación y la guarda de rol de los endpoints protegidos (sin sesión válida, `401 INVALID_SESSION`; con rol `MEMBER`, `403 FORBIDDEN`, siempre antes de cualquier otra comprobación):
- `PUT /api/users/{id}/role` con el cuerpo `{ "role": "ADMIN" | "MEMBER" }`; un cuerpo sin `role` o con otro valor MUST responder `400 VALIDATION_ERROR`.
- `POST /api/users/{id}/suspend`, sin cuerpo.
- `POST /api/users/{id}/reactivate`, sin cuerpo.

Si la operación termina bien, la respuesta MUST ser `200` con `success: true` y en `data` el usuario tras la operación, con exactamente los mismos campos que un elemento de `GET /api/users`. El colegio y el usuario que actúa MUST salir de la identidad de la petición; ningún endpoint los acepta en la ruta ni en el cuerpo. Las respuestas MUST llevar `Cache-Control: no-store`.

#### Scenario: Cambio de rol correcto
- **GIVEN** un colegio con un `ADMIN` y un `MEMBER` activos
- **WHEN** el `ADMIN` llama a `PUT /api/users/{id del MEMBER}/role` con `{ "role": "ADMIN" }`
- **THEN** la respuesta es `200` con el usuario y `role` igual a `ADMIN`

#### Scenario: Cuerpo no válido
- **WHEN** un `ADMIN` llama a `PUT /api/users/{id}/role` con `{ "role": "OWNER" }`
- **THEN** la respuesta es `400` con `VALIDATION_ERROR` y no cambia nada

#### Scenario: Un miembro no gestiona usuarios
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** llama a cualquiera de los tres endpoints
- **THEN** la respuesta es `403` con `FORBIDDEN` y no cambia nada

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los tres endpoints sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y la cabecera `WWW-Authenticate: Bearer`

### Requirement: Usuario objetivo del propio colegio
Los tres endpoints MUST responder `404 NOT_FOUND`, sin cambiar nada y sin distinguir los casos, cuando `{id}` no es un UUID, no existe, pertenece a otro colegio o corresponde a un usuario `DELETED`. Esta comprobación MUST ir antes que cualquier otra regla de la operación.

#### Scenario: Usuario de otro colegio
- **GIVEN** dos colegios, cada uno con su administrador y un miembro
- **WHEN** el administrador del primero llama a cualquiera de los tres endpoints con el id del miembro del segundo
- **THEN** la respuesta es `404` con `NOT_FOUND` y el miembro del segundo colegio no cambia

#### Scenario: Identificador que no es un UUID
- **WHEN** un `ADMIN` llama a `POST /api/users/no-es-un-uuid/suspend`
- **THEN** la respuesta es `404` con `NOT_FOUND`

#### Scenario: Usuario eliminado
- **GIVEN** un usuario `DELETED` del colegio
- **WHEN** el `ADMIN` llama a `POST /api/users/{id}/reactivate`
- **THEN** la respuesta es `404` con `NOT_FOUND` y el usuario sigue `DELETED`

### Requirement: Cambio de rol
`PUT /api/users/{id}/role` MUST cambiar el rol del usuario entre `ADMIN` y `MEMBER`. Si el usuario está `SUSPENDED`, MUST responder `409 USER_NOT_ACTIVE` sin cambiar nada, aunque pida el rol que ya tiene. Si el usuario ya tiene el rol pedido, MUST responder `200` sin cambios y sin registrar evento. El cambio MUST NOT revocar sus sesiones: el usuario tiene los permisos nuevos desde su siguiente petición, porque la identidad se lee de la base de datos. Cuando hay cambio, MUST registrar `USER_ROLE_CHANGED` con `schoolId`, `actorId`, `userId`, `previousRole` y `newRole`.

#### Scenario: Ascender a administrador
- **GIVEN** un `MEMBER` activo con un access token vigente
- **WHEN** el `ADMIN` le cambia el rol a `ADMIN`
- **THEN** la siguiente petición del antiguo `MEMBER` a `GET /api/users` con ese mismo access token responde `200`

#### Scenario: Pasar a miembro
- **GIVEN** un colegio con dos `ADMIN` activos
- **WHEN** uno cambia el rol del otro a `MEMBER`
- **THEN** la siguiente petición del otro a `GET /api/users` responde `403 FORBIDDEN`
- **AND** sus sesiones siguen sin revocar

#### Scenario: Usuario dado de baja
- **GIVEN** un usuario `SUSPENDED` con rol `MEMBER`
- **WHEN** el `ADMIN` llama a `PUT /api/users/{id}/role` con `{ "role": "ADMIN" }` o con `{ "role": "MEMBER" }`
- **THEN** la respuesta es `409` con `USER_NOT_ACTIVE` y el usuario no cambia

#### Scenario: Mismo rol
- **GIVEN** un `MEMBER` activo
- **WHEN** el `ADMIN` le pide el rol `MEMBER`
- **THEN** la respuesta es `200` con el usuario sin cambios y no se registra `USER_ROLE_CHANGED`

### Requirement: Baja de un usuario
`POST /api/users/{id}/suspend` MUST pasar al usuario a `SUSPENDED` y, en la misma transacción, revocar todas sus sesiones que sigan sin revocar. Si `{id}` es el usuario que actúa, MUST responder `409 CANNOT_SUSPEND_SELF` sin cambiar nada, haya o no otros administradores. Si el usuario ya está `SUSPENDED`, MUST responder `200` sin cambios, sin revocar nada y sin registrar evento. Tras la baja, el usuario MUST NOT poder iniciar sesión (`403 ACCOUNT_SUSPENDED`), renovar su sesión ni usar sus access tokens (`401 INVALID_SESSION`). Cuando hay cambio, MUST registrar `USER_SUSPENDED` con `schoolId`, `actorId`, `userId` y el número de sesiones revocadas.

#### Scenario: Dar de baja a otro usuario
- **GIVEN** un `MEMBER` activo con dos sesiones abiertas
- **WHEN** el `ADMIN` llama a `POST /api/users/{id}/suspend`
- **THEN** la respuesta es `200` con `status` igual a `SUSPENDED`
- **AND** las dos sesiones quedan revocadas, su access token anterior recibe `401 INVALID_SESSION`, su refresh token no renueva y su inicio de sesión con la contraseña correcta responde `403 ACCOUNT_SUSPENDED`

#### Scenario: Darse de baja a uno mismo
- **GIVEN** un colegio con dos `ADMIN` activos
- **WHEN** uno llama a `POST /api/users/{su propio id}/suspend`
- **THEN** la respuesta es `409` con `CANNOT_SUSPEND_SELF`, sigue `ACTIVE` y sus sesiones no se revocan

#### Scenario: Ya dado de baja
- **GIVEN** un usuario `SUSPENDED`
- **WHEN** el `ADMIN` vuelve a darlo de baja
- **THEN** la respuesta es `200` con el usuario sin cambios y no se registra `USER_SUSPENDED`

### Requirement: Reactivación de un usuario
`POST /api/users/{id}/reactivate` MUST pasar a `ACTIVE` a un usuario `SUSPENDED`, con el mismo rol y la misma contraseña. Las sesiones revocadas MUST seguir revocadas: el usuario vuelve a iniciar sesión. Si el usuario ya está `ACTIVE`, MUST responder `200` sin cambios y sin registrar evento. Cuando hay cambio, MUST registrar `USER_REACTIVATED` con `schoolId`, `actorId` y `userId`.

#### Scenario: Reactivar
- **GIVEN** un usuario `SUSPENDED` con rol `MEMBER`
- **WHEN** el `ADMIN` llama a `POST /api/users/{id}/reactivate`
- **THEN** la respuesta es `200` con `status` igual a `ACTIVE` y `role` igual a `MEMBER`
- **AND** el usuario inicia sesión con su contraseña de antes, y sus sesiones de antes de la baja siguen revocadas

#### Scenario: Ya activo
- **GIVEN** un usuario `ACTIVE`
- **WHEN** el `ADMIN` llama a `POST /api/users/{id}/reactivate`
- **THEN** la respuesta es `200` con el usuario sin cambios y no se registra `USER_REACTIVATED`

### Requirement: Siempre queda un administrador activo
Ninguna operación MUST dejar el colegio sin al menos un usuario con rol `ADMIN` y estado `ACTIVE`. Si la dejara (pasar a `MEMBER` a un `ADMIN` activo, también a uno mismo, o dar de baja a un `ADMIN` activo), la API MUST responder `409 LAST_ADMIN_REQUIRED` sin cambiar nada. La regla MUST cumplirse también con operaciones simultáneas del mismo colegio: cada operación MUST ejecutarse en una transacción que bloquea el colegio antes de contar los administradores y escribir. Las comprobaciones MUST aplicarse en este orden: usuario del colegio (`404`), baja propia (`CANNOT_SUSPEND_SELF`), usuario no activo en el cambio de rol (`USER_NOT_ACTIVE`), idempotencia (`200` sin cambios) y último administrador (`LAST_ADMIN_REQUIRED`). Cada rechazo `409` MUST registrar `USER_MANAGEMENT_REJECTED` con `reason`, `schoolId`, `actorId` y `userId`, sin datos personales.

#### Scenario: Único administrador se pasa a miembro
- **GIVEN** un colegio con un único `ADMIN` activo
- **WHEN** se llama a `PUT /api/users/{su id}/role` con `{ "role": "MEMBER" }`
- **THEN** la respuesta es `409` con `LAST_ADMIN_REQUIRED` y sigue siendo `ADMIN`

#### Scenario: Pasarse a miembro habiendo otro administrador
- **GIVEN** un colegio con dos `ADMIN` activos
- **WHEN** uno se cambia a sí mismo el rol a `MEMBER`
- **THEN** la respuesta es `200` y queda un `ADMIN` activo

#### Scenario: Un administrador dado de baja no cuenta
- **GIVEN** un colegio con un `ADMIN` activo y otro `ADMIN` `SUSPENDED`
- **WHEN** el activo intenta pasarse a `MEMBER`
- **THEN** la respuesta es `409` con `LAST_ADMIN_REQUIRED`

#### Scenario: Peticiones simultáneas
- **GIVEN** un colegio con exactamente dos `ADMIN` activos
- **WHEN** cada uno cambia a la vez el rol del otro a `MEMBER`
- **THEN** una petición responde `200`, la otra `409` con `LAST_ADMIN_REQUIRED`, y queda exactamente un `ADMIN` activo

#### Scenario: Rechazo registrado
- **WHEN** una operación responde `409`
- **THEN** se registra `USER_MANAGEMENT_REJECTED` con el `reason` del código, sin emails ni nombres

### Requirement: Acciones sobre los usuarios en la página
La página `/usuarios` MUST mostrar en cada fila una columna de acciones: para un usuario `ACTIVE`, «Hacer administrador» si es `MEMBER` o «Hacer miembro» si es `ADMIN`, y «Dar de baja»; para un `SUSPENDED`, solo «Reactivar». La fila del usuario de la sesión MUST llevar la marca «(tú)» y MUST NOT mostrar «Dar de baja». «Dar de baja» MUST pedir confirmación en un diálogo modal que nombra al usuario y avisa de que se cerrarán sus sesiones; cancelar MUST NOT enviar ninguna petición. Mientras la petición de una fila está en curso, los botones de esa fila MUST estar deshabilitados y un segundo clic MUST NOT enviar otra petición; las demás filas siguen disponibles. Con `200`, la fila MUST sustituirse por el usuario devuelto sin recargar la lista. Los rechazos MUST mostrar un aviso con `role="alert"` y dejar la fila como estaba: `LAST_ADMIN_REQUIRED` muestra «El colegio debe tener al menos un administrador»; `CANNOT_SUSPEND_SELF` y `USER_NOT_ACTIVE`, su propio mensaje; `404`, «Este usuario ya no está disponible» y recarga la lista; `503`, un fallo de red o cualquier respuesta inesperada, un aviso genérico. Un `403` MUST seguir el mismo camino que la carga de la lista (renovar la sesión y navegar a `/onboarding`). Si el usuario de la sesión se pasa a sí mismo a `MEMBER`, tras el `200` la página MUST renovar la sesión, y la guarda de rol lo lleva a `/onboarding`. Todos los textos MUST venir de i18n, y el servicio que llama a los endpoints MUST interpretar la respuesta por su código y MUST NOT lanzar excepciones.

#### Scenario: Acciones según el estado
- **GIVEN** un `ADMIN` en `/usuarios` con un `MEMBER` activo y un usuario `SUSPENDED` en la lista
- **THEN** la fila del `MEMBER` ofrece «Hacer administrador» y «Dar de baja», la del `SUSPENDED` solo «Reactivar», y la suya lleva «(tú)» y no ofrece «Dar de baja»

#### Scenario: Confirmar la baja
- **GIVEN** el modal de confirmación de la baja de un `MEMBER`
- **WHEN** el administrador confirma y la API responde `200`
- **THEN** la fila muestra el estado «Dado de baja» y solo ofrece «Reactivar»

#### Scenario: Cancelar la baja
- **GIVEN** el modal de confirmación de la baja
- **WHEN** el administrador lo cancela
- **THEN** no se envía ninguna petición y la fila no cambia

#### Scenario: Doble clic
- **WHEN** el administrador pulsa dos veces seguidas «Hacer administrador» en la misma fila
- **THEN** se envía una sola petición

#### Scenario: Último administrador en la página
- **GIVEN** el único `ADMIN` activo en `/usuarios`
- **WHEN** pulsa «Hacer miembro» en su fila y la API responde `409 LAST_ADMIN_REQUIRED`
- **THEN** ve «El colegio debe tener al menos un administrador» con `role="alert"` y su fila sigue mostrando el rol de administrador

#### Scenario: Usuario que ya no está disponible
- **WHEN** una acción recibe `404 NOT_FOUND`
- **THEN** se muestra «Este usuario ya no está disponible» con `role="alert"` y la lista se vuelve a cargar

#### Scenario: Pasarse a miembro uno mismo
- **GIVEN** un `ADMIN` en `/usuarios` y otro `ADMIN` activo en el colegio
- **WHEN** pulsa «Hacer miembro» en su fila y la API responde `200`
- **THEN** se renueva la sesión y llega a `/onboarding` sin el enlace «Usuarios»

### Requirement: Gestión de usuarios de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, que un administrador recién registrado asciende a un `MEMBER` creado con la tarea `createUser`; que lo da de baja confirmando el modal y ese usuario ya no puede iniciar sesión; que lo reactiva y el usuario vuelve a iniciar sesión con su contraseña; que el único administrador que intenta pasarse a `MEMBER` ve el aviso del último administrador; y que un administrador que se pasa a `MEMBER` habiendo otro llega a `/onboarding`.

#### Scenario: Baja y reactivación en el E2E
- **GIVEN** un administrador registrado y un `MEMBER` del mismo colegio creado con `createUser`
- **WHEN** el administrador da de baja al `MEMBER` confirmando el modal
- **THEN** el inicio de sesión del `MEMBER` muestra el mensaje de cuenta suspendida
- **AND** tras reactivarlo, el `MEMBER` inicia sesión con su contraseña

#### Scenario: Último administrador en el E2E
- **GIVEN** un administrador recién registrado, único `ADMIN` de su colegio
- **WHEN** pulsa «Hacer miembro» en su fila
- **THEN** ve «El colegio debe tener al menos un administrador»

