## ADDED Requirements

### Requirement: Generar un enlace de restablecimiento
`POST /api/users/{id}/password-reset` MUST ser un endpoint protegido reservado al rol `ADMIN` (sin sesión válida, `401 INVALID_SESSION`; con rol `MEMBER`, `403 FORBIDDEN`, antes de cualquier otra comprobación), sin cuerpo. El usuario de la ruta MUST ser del colegio de la identidad y estar `ACTIVE`; puede ser otro administrador o el propio administrador. Un id de otro colegio, inexistente, de un usuario `DELETED` o que no es un UUID MUST responder `404 NOT_FOUND`, sin distinguir los casos; un usuario `SUSPENDED`, `409 USER_NOT_ACTIVE`. En una única transacción MUST revocar (`revoked_at`) cualquier restablecimiento abierto del usuario (sin usar ni revocar, aunque haya caducado) y crear uno nuevo con `purpose` `PASSWORD_RESET`, el usuario, `created_by_id` igual a quien actúa y `expires_at` igual al instante de creación más 72 horas, a partir de un token aleatorio de 256 bits del que solo se guarda su SHA-256. MUST responder `201` con `success: true` y en `data` `{ passwordReset: { userId, createdAt, expiresAt }, url }`, donde `url` tiene la forma `<APP_ORIGIN>/restablecer#<token>`; es la única respuesta que contiene el enlace o el token. Si dos generaciones simultáneas chocan con el índice único de un pendiente por usuario, MUST reintentar una vez, de modo que ambas respondan `201` y solo valga el último enlace. MUST registrar `PASSWORD_RESET_LINK_CREATED` con `school_id`, `actor_id`, `user_id` y `replaced` (si revocó uno anterior). La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Generar para un usuario activo
- **GIVEN** un colegio con un `ADMIN` y un `MEMBER` `ACTIVE`
- **WHEN** el `ADMIN` llama a `POST /api/users/{id del MEMBER}/password-reset`
- **THEN** la respuesta es `201` con `passwordReset.userId` igual al id del `MEMBER`, `expiresAt` igual a `createdAt` + 72 horas y un `url` que empieza por `<APP_ORIGIN>/restablecer#`
- **AND** en `access_links` hay un `PASSWORD_RESET` de ese usuario cuyo `token_hash` es el SHA-256 del fragmento del `url`

#### Scenario: Generar para uno mismo
- **WHEN** un `ADMIN` genera un restablecimiento para su propio usuario
- **THEN** la respuesta es `201`

#### Scenario: El nuevo sustituye al anterior, aunque esté caducado
- **GIVEN** un usuario con un restablecimiento pendiente y otro usuario con uno caducado sin usar ni revocar
- **WHEN** el `ADMIN` genera uno nuevo para cada uno
- **THEN** las dos respuestas son `201`, los anteriores quedan con `revoked_at` y cada usuario tiene un único restablecimiento abierto

#### Scenario: Generaciones simultáneas
- **GIVEN** un usuario `ACTIVE` sin restablecimientos
- **WHEN** dos administradores generan a la vez un enlace para él
- **THEN** las dos respuestas son `201` y el usuario tiene un único restablecimiento abierto

#### Scenario: Usuario dado de baja
- **GIVEN** un usuario `SUSPENDED` del colegio
- **WHEN** el `ADMIN` genera un restablecimiento para él
- **THEN** la respuesta es `409 USER_NOT_ACTIVE` y no se crea ningún enlace

#### Scenario: Usuario fuera del colegio
- **WHEN** el `ADMIN` genera un restablecimiento para un usuario de otro colegio, inexistente, `DELETED` o con un id que no es un UUID
- **THEN** la respuesta es `404 NOT_FOUND` y no se crea ningún enlace

#### Scenario: Un miembro no genera restablecimientos
- **WHEN** un `MEMBER` llama a `POST /api/users/{id}/password-reset`
- **THEN** la respuesta es `403 FORBIDDEN`; sin `Authorization`, `401 INVALID_SESSION`

### Requirement: Revocar un restablecimiento pendiente
`POST /api/users/{id}/password-reset/revoke` MUST ser un endpoint protegido reservado al rol `ADMIN`, sin cuerpo. Con un restablecimiento pendiente del usuario MUST revocarlo y responder `204`, registrando `PASSWORD_RESET_LINK_REVOKED` con `school_id`, `actor_id` y `user_id`. Sin restablecimiento pendiente MUST responder `204` sin cambios ni evento (idempotente). El `404` MUST resolverse como al generar.

#### Scenario: Revocar
- **GIVEN** un usuario con un restablecimiento pendiente
- **WHEN** el `ADMIN` llama a `POST /api/users/{id}/password-reset/revoke`
- **THEN** la respuesta es `204`, el restablecimiento queda con `revoked_at` y su enlace responde `410` al consultarlo

#### Scenario: Revocar otra vez
- **WHEN** el `ADMIN` revoca el restablecimiento de un usuario que no tiene ninguno pendiente
- **THEN** la respuesta es `204` y no se registra ningún evento

### Requirement: Consultar un restablecimiento desde el enlace
`POST /api/password-resets/lookup` MUST ser un endpoint público (sin `Authorization` ni cookies) con el cuerpo `{ "token": string }`. MUST buscar, por el SHA-256 del token, un enlace con `purpose` `PASSWORD_RESET` pendiente (sin usar, sin revocar y con `expires_at` posterior al instante de la petición) cuyo usuario esté `ACTIVE`. Si lo encuentra, MUST responder `200` con `success: true` y en `data` `{ school: { name }, email }`, con el email enmascarado (primer carácter, `***` y dominio), sin escribir nada. En otro caso (caducado, usado, revocado, inexistente, una invitación, el usuario ya no está `ACTIVE`, o el `token` falta o no es una cadena no vacía) MUST responder `410 ACCESS_LINK_INVALID`, sin distinguir el caso. La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Restablecimiento pendiente
- **GIVEN** un restablecimiento pendiente de `jose.garcia@example.com` en «CEIP Lluís Vives»
- **WHEN** se consulta con su token
- **THEN** la respuesta es `200` con `school.name` igual a «CEIP Lluís Vives» y `email` igual a `j***@example.com`
- **AND** el enlace sigue sin `used_at`

#### Scenario: Enlace no válido
- **GIVEN** un restablecimiento caducado, otro usado, otro revocado, otro de un usuario `SUSPENDED` y una invitación pendiente
- **WHEN** se consulta con el token de cada uno, con un token inexistente y sin `token`
- **THEN** todas las respuestas son `410 ACCESS_LINK_INVALID` con el mismo mensaje

### Requirement: Confirmar la contraseña nueva
`POST /api/password-resets/confirm` MUST ser un endpoint público con el cuerpo `{ token, password }`. MUST procesar en este orden: límite de intentos (`429`); enlace pendiente con la misma regla que la consulta (`410 ACCESS_LINK_INVALID`); contraseña con las reglas del registro (de 8 caracteres a 72 bytes y variedad; `400 VALIDATION_ERROR` con el campo `password`); y el cambio. Las propiedades desconocidas MUST ignorarse. El cambio MUST hacer en una única transacción: marcar el enlace como usado (`used_at`), sustituir el hash de la contraseña del usuario (Bcrypt) solo si sigue `ACTIVE` y revocar todas sus sesiones abiertas; si el enlace dejó de estar pendiente o el usuario ya no está `ACTIVE`, nada cambia y responde `410`. Con éxito MUST responder `204`, sin sesión ni cookies, y registrar `PASSWORD_RESET_COMPLETED` con `school_id`, `user_id` y el número de sesiones revocadas. Los access tokens de las sesiones revocadas MUST recibir `401` en la petición siguiente.

#### Scenario: Cambiar la contraseña
- **GIVEN** un usuario con una contraseña conocida, dos sesiones abiertas y un restablecimiento pendiente
- **WHEN** se confirma con su token y una contraseña nueva válida
- **THEN** la respuesta es `204` sin cabecera `Set-Cookie`
- **AND** el usuario puede iniciar sesión con la contraseña nueva y no con la anterior
- **AND** sus dos sesiones quedan con `revoked_at` y sus access tokens reciben `401`
- **AND** el enlace tiene `used_at` y otra confirmación con el mismo token responde `410`

#### Scenario: Contraseña no válida
- **GIVEN** un restablecimiento pendiente
- **WHEN** se confirma con una contraseña sin variedad
- **THEN** la respuesta es `400 VALIDATION_ERROR` con `{ field: password, code: WEAK_PASSWORD }`, la contraseña no cambia y el enlace sigue pendiente

#### Scenario: El enlace se comprueba antes que la contraseña
- **GIVEN** un restablecimiento revocado
- **WHEN** se confirma con su token y una contraseña no válida
- **THEN** la respuesta es `410 ACCESS_LINK_INVALID`, no `400`

#### Scenario: Usuario dado de baja tras generar el enlace
- **GIVEN** un restablecimiento pendiente de un usuario al que después se da de baja
- **WHEN** se confirma con su token y una contraseña válida
- **THEN** la respuesta es `410 ACCESS_LINK_INVALID` y la contraseña no cambia

#### Scenario: Confirmaciones simultáneas
- **GIVEN** un restablecimiento pendiente
- **WHEN** se confirman dos peticiones a la vez con el mismo token
- **THEN** una responde `204` y la otra `410 ACCESS_LINK_INVALID`

#### Scenario: Base de datos caída
- **GIVEN** que la base de datos no responde
- **WHEN** se consulta o se confirma un restablecimiento, o se genera o revoca uno
- **THEN** la respuesta es `503 DATABASE_UNAVAILABLE`

### Requirement: Límite de intentos de los restablecimientos públicos
La consulta y la confirmación MUST compartir un límite de intentos por IP con la clave `password-reset:<ip>`, la ventana de 15 minutos y el máximo `PASSWORD_RESET_ATTEMPTS_MAX`, independiente del de las invitaciones. Solo MUST contar los intentos con un enlace no válido (`410`): cada petición reserva un intento antes de comprobar el enlace y lo libera si el enlace es válido, aunque después responda `400`. Con el límite agotado MUST responder `429 TOO_MANY_REQUESTS` con `Retry-After`, sin comprobar el enlace.

#### Scenario: Se agota con enlaces no válidos
- **GIVEN** `PASSWORD_RESET_ATTEMPTS_MAX` igual a 3
- **WHEN** una IP consulta tres veces con tokens que no existen y una cuarta con un token válido
- **THEN** las tres primeras responden `410` y la cuarta `429` con `Retry-After`

#### Scenario: Las contraseñas rechazadas no cuentan
- **GIVEN** `PASSWORD_RESET_ATTEMPTS_MAX` igual a 3 y un restablecimiento pendiente
- **WHEN** una IP confirma cuatro veces con el token válido y una contraseña no válida
- **THEN** las cuatro responden `400`

#### Scenario: Independiente de las invitaciones
- **GIVEN** una IP que ha agotado el límite de las invitaciones
- **WHEN** consulta un restablecimiento válido
- **THEN** la respuesta es `200`

### Requirement: Registro de eventos del restablecimiento sin datos sensibles
Los eventos del restablecimiento (`PASSWORD_RESET_LINK_CREATED`, `PASSWORD_RESET_LINK_REVOKED`, `PASSWORD_RESET_COMPLETED` y `PASSWORD_RESET_REJECTED`, este con `reason` e IP) MUST llevar el colegio y los usuarios por su id. Ningún log MUST contener el token, su hash, el enlace, la contraseña ni el email en claro.

#### Scenario: Sin secretos en el log
- **WHEN** se genera un restablecimiento, se consulta, se confirma y se intenta confirmar otra vez
- **THEN** se registran `PASSWORD_RESET_LINK_CREATED`, `PASSWORD_RESET_COMPLETED` y `PASSWORD_RESET_REJECTED`, y ningún log contiene el token, su hash, el `url` ni la contraseña

### Requirement: Restablecimiento desde la página de usuarios
En `/usuarios`, cada fila de un usuario `ACTIVE` (incluida la propia) MUST ofrecer «Restablecer contraseña»; las filas `SUSPENDED` no. Una fila con `passwordResetPending` MUST mostrar «Restablecimiento pendiente» y «Revocar restablecimiento». Tras el `201`, la página MUST mostrar el panel del enlace (el mismo componente que el de las invitaciones) con el enlace en un campo de solo lectura, «Copiar» (con la selección del texto como alternativa) y el aviso «Copia este enlace ahora: no se volverá a mostrar. Si el usuario tenía otro enlace pendiente, ha dejado de funcionar.», y marcar la fila como pendiente sin volver a pedir la lista. El enlace MUST vivir solo en memoria. Una guarda por fila MUST impedir los envíos repetidos. Los fallos MUST mostrar su aviso en un `role="alert"`: `409 USER_NOT_ACTIVE` → «Reactiva el usuario antes de restablecer su contraseña»; `404` → el aviso de usuario no disponible y una recarga de la lista; `403` → el camino de la página (renovar la sesión y `/onboarding`); otros → «No se ha podido generar el enlace» o «No se ha podido revocar el restablecimiento». Los textos MUST venir de i18n y la página MUST cumplir WCAG 2.1 AA.

#### Scenario: Generar desde la fila
- **GIVEN** un `ADMIN` en `/usuarios` con un `MEMBER` `ACTIVE` en la lista
- **WHEN** pulsa «Restablecer contraseña» en su fila
- **THEN** ve el panel con el enlace, «Copiar» y el aviso, y la fila muestra «Restablecimiento pendiente» y «Revocar restablecimiento»

#### Scenario: Revocar desde la fila
- **GIVEN** una fila con «Restablecimiento pendiente»
- **WHEN** el `ADMIN` pulsa «Revocar restablecimiento» y la API responde `204`
- **THEN** la fila deja de mostrar el restablecimiento pendiente

#### Scenario: Usuario dado de baja entre medias
- **WHEN** el `ADMIN` genera un restablecimiento y la API responde `409 USER_NOT_ACTIVE`
- **THEN** ve «Reactiva el usuario antes de restablecer su contraseña» en un `role="alert"`

#### Scenario: Doble clic
- **WHEN** el `ADMIN` pulsa dos veces seguidas «Restablecer contraseña» en la misma fila
- **THEN** se envía una sola petición

### Requirement: Página pública para restablecer la contraseña
El frontend MUST ofrecer `/restablecer` (`PasswordResetPage`), una ruta pública fuera de `AuthenticatedLayout`. Al montar MUST leer el token del fragmento de la URL, quitarlo de la barra de direcciones con `history.replaceState` y guardarlo solo en memoria. Sin token MUST mostrar la vista de enlace no válido sin llamar al servidor. Con token MUST consultar el restablecimiento una sola vez, aunque `StrictMode` ejecute el efecto dos veces, con un indicador `role="status"` mientras carga, y según el resultado:
- encontrado: «Vas a cambiar la contraseña de {email enmascarado} en {colegio}.» y el formulario con «Contraseña nueva» y «Repite la contraseña»;
- `410`: «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.», sin formulario;
- `429`: el aviso de espera con los minutos, redondeados hacia arriba;
- `503` o fallo de red: un aviso con «Reintentar».

La contraseña MUST validarse en línea con las reglas del registro, y si la confirmación no coincide MUST mostrar «Las contraseñas no coinciden» sin enviar nada. Una guarda síncrona MUST impedir el doble envío. Con `204` MUST navegar a `/login` con `replace`, indicando que la contraseña se ha cambiado; con `410`, la vista de enlace no válido; con `400`, el error del campo; con `429` y `503`, su aviso. La página MUST NOT cargar recursos de terceros, MUST cumplir WCAG 2.1 AA y sus textos MUST venir de i18n.

#### Scenario: El token sale de la URL
- **WHEN** se abre `/restablecer#<token>`
- **THEN** la barra de direcciones pasa a `/restablecer` sin fragmento y el token no está en `localStorage` ni en `sessionStorage`

#### Scenario: Email enmascarado y colegio
- **GIVEN** un restablecimiento pendiente de `jose.garcia@example.com` en «CEIP Lluís Vives»
- **WHEN** se abre su enlace
- **THEN** la página muestra «Vas a cambiar la contraseña de j***@example.com en CEIP Lluís Vives.» y el formulario

#### Scenario: Las contraseñas no coinciden
- **WHEN** se envía el formulario con dos contraseñas válidas distintas
- **THEN** se ve «Las contraseñas no coinciden» y no se envía ninguna petición

#### Scenario: Contraseña cambiada
- **WHEN** se envía el formulario con dos contraseñas iguales válidas y la API responde `204`
- **THEN** la página navega a `/login`

#### Scenario: Enlace no válido
- **WHEN** se abre `/restablecer` sin fragmento o con el token de un restablecimiento revocado
- **THEN** la página muestra «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.» y ningún formulario

### Requirement: Restablecimiento de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, que un administrador genera un enlace de restablecimiento para un miembro en `/usuarios` y lo copia; que al abrir el enlace la URL pierde el fragmento y se define la contraseña nueva; que se llega a `/login` con el aviso de contraseña cambiada y se entra con la nueva y no con la anterior; que un enlace revocado o sustituido muestra la vista de enlace no válido; y que la página no viola la CSP.

#### Scenario: Recorrido completo en el E2E
- **GIVEN** un administrador registrado con datos únicos en el E2E y un miembro de su colegio
- **WHEN** genera un restablecimiento para el miembro, se abre el enlace y se define la contraseña nueva
- **THEN** se llega a `/login` con el aviso, el miembro entra con la contraseña nueva y no con la anterior
