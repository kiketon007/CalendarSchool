## ADDED Requirements

### Requirement: Listado de usuarios con GET /api/users
`GET /api/users` MUST ser un endpoint protegido reservado al rol `ADMIN`. MUST responder `200` con `success: true` y en `data` un array con los usuarios del colegio de la identidad cuyo estado sea `ACTIVE` o `SUSPENDED`, cada uno con exactamente `id`, `firstName`, `lastName`, `email`, `role`, `status` y `createdAt` (fecha y hora ISO 8601). Los usuarios `DELETED` MUST NOT aparecer. La lista MUST ordenarse por `lastName`, después `firstName` y después `email`. No hay paginación. La respuesta MUST llevar `Cache-Control: no-store` y MUST NOT contener el hash de la contraseña ni datos de consentimiento.

#### Scenario: Administrador con usuarios en su colegio
- **GIVEN** un colegio con un `ADMIN` y un `MEMBER` activos y un `MEMBER` `SUSPENDED`
- **WHEN** el `ADMIN` llama a `GET /api/users`
- **THEN** la respuesta es `200` con los tres usuarios, cada uno con `id`, `firstName`, `lastName`, `email`, `role`, `status` y `createdAt`, y nada más

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
