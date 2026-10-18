## ADDED Requirements

### Requirement: Consultar una invitación desde el enlace
`POST /api/invitations/lookup` MUST ser un endpoint público (sin `Authorization` ni cookies) con el cuerpo `{ "token": string }`. MUST buscar, por el SHA-256 del token, un enlace de acceso con `purpose` `INVITATION` pendiente (no usado, no revocado y con `expires_at` posterior al instante de la petición). Si lo encuentra, MUST responder `200` con `success: true` y en `data` `{ school: { name }, role }`, sin escribir nada en la base de datos. Si no lo encuentra, o si el `token` falta o no es una cadena no vacía, MUST responder `410` con `ACCESS_LINK_INVALID`, sin distinguir si el enlace está caducado, usado, revocado, no existe o es un restablecimiento. La respuesta MUST llevar `Cache-Control: no-store` y nunca el id del enlace ni su hash.

#### Scenario: Invitación pendiente
- **GIVEN** una invitación pendiente con rol `MEMBER` del colegio «CEIP Lluís Vives»
- **WHEN** se llama a `POST /api/invitations/lookup` con su token
- **THEN** la respuesta es `200` con `school.name` igual a «CEIP Lluís Vives» y `role` igual a `MEMBER`

#### Scenario: Consultar no consume la invitación
- **GIVEN** una invitación pendiente
- **WHEN** se consulta tres veces con su token
- **THEN** las tres respuestas son `200` y la invitación sigue con `used_at` y `revoked_at` nulos

#### Scenario: Enlace no válido
- **GIVEN** una invitación caducada, otra usada, otra revocada y un restablecimiento pendiente
- **WHEN** se consulta con el token de cada uno, con un token que no existe y sin `token`
- **THEN** todas las respuestas son `410` con `ACCESS_LINK_INVALID` y el mismo mensaje

### Requirement: Aceptar una invitación
`POST /api/invitations/accept` MUST ser un endpoint público con el cuerpo `{ token, firstName, lastName, email, password, privacyPolicyAccepted }`. MUST procesar en este orden: límite de intentos (`429`); enlace pendiente con la misma regla que la consulta (`410 ACCESS_LINK_INVALID`); validación de los campos con las mismas reglas del registro, incluidas la normalización NFC, el email en minúsculas y sin espacios, la contraseña de 8 caracteres a 72 bytes y `privacyPolicyAccepted` igual a `true` (`400 VALIDATION_ERROR` con un `{ field, code }` por campo inválido); y el alta. Las propiedades desconocidas, como `role` o `schoolId`, MUST ignorarse: el colegio y el rol salen siempre de la invitación. El alta MUST marcar la invitación como usada (`used_at`) y crear el usuario con estado `ACTIVE`, el colegio y el rol de la invitación, la contraseña con Bcrypt y la fecha y la versión de la política de privacidad, en una única transacción: si el email ya está registrado (en cualquier colegio y estado) MUST responder `409 EMAIL_ALREADY_REGISTERED` y la invitación MUST seguir pendiente. Con éxito MUST responder `201` con `success: true` y en `data` `{ user: { id, firstName, lastName, email, role }, school: { id, name } }`, sin crear sesión ni fijar cookies. La respuesta MUST llevar `Cache-Control: no-store`. La invitación de un administrador dado de baja MUST seguir pudiendo aceptarse.

#### Scenario: Aceptar una invitación de miembro
- **GIVEN** una invitación pendiente con rol `MEMBER`
- **WHEN** se acepta con nombre, apellidos, email y contraseña válidos y `privacyPolicyAccepted: true`
- **THEN** la respuesta es `201` con el usuario (`role: MEMBER`) y el colegio de la invitación, sin cabecera `Set-Cookie`
- **AND** en `users` hay un usuario `ACTIVE` con ese email en ese colegio, con `privacy_policy_accepted_at` y `privacy_policy_version`
- **AND** la invitación tiene `used_at`, y el usuario puede iniciar sesión con su contraseña

#### Scenario: Aceptar una invitación de administrador
- **GIVEN** una invitación pendiente con rol `ADMIN`
- **WHEN** se acepta con datos válidos
- **THEN** el usuario creado tiene rol `ADMIN`

#### Scenario: El cliente no elige rol ni colegio
- **GIVEN** una invitación pendiente con rol `MEMBER`
- **WHEN** se acepta con datos válidos y además `role: "ADMIN"` y el `schoolId` de otro colegio
- **THEN** el usuario se crea con rol `MEMBER` en el colegio de la invitación

#### Scenario: Email ya registrado
- **GIVEN** una invitación pendiente y un usuario ya registrado con `jose@example.com` en otro colegio
- **WHEN** se acepta con el email `JOSE@example.com`
- **THEN** la respuesta es `409 EMAIL_ALREADY_REGISTERED`, no se crea ningún usuario y la invitación sigue pendiente

#### Scenario: Campos no válidos
- **GIVEN** una invitación pendiente
- **WHEN** se acepta con una contraseña sin mayúsculas y sin `privacyPolicyAccepted`
- **THEN** la respuesta es `400 VALIDATION_ERROR` con `{ field: password, code: WEAK_PASSWORD }` y `{ field: privacyPolicyAccepted, code: REQUIRED }`, y la invitación sigue pendiente

#### Scenario: El enlace se comprueba antes que los campos
- **GIVEN** una invitación revocada y un email ya registrado
- **WHEN** se acepta con el token revocado, campos no válidos o ese email
- **THEN** la respuesta es `410 ACCESS_LINK_INVALID`, no `400` ni `409`

#### Scenario: Aceptaciones simultáneas
- **GIVEN** una invitación pendiente
- **WHEN** se aceptan dos peticiones a la vez con el mismo token y emails distintos
- **THEN** una responde `201`, la otra `410 ACCESS_LINK_INVALID`, y se ha creado un único usuario

#### Scenario: Una invitación usada no se vuelve a aceptar
- **GIVEN** una invitación ya aceptada
- **WHEN** se acepta otra vez con otro email
- **THEN** la respuesta es `410 ACCESS_LINK_INVALID` y no se crea ningún usuario

#### Scenario: Base de datos caída
- **GIVEN** que la base de datos no responde
- **WHEN** se consulta o se acepta una invitación
- **THEN** la respuesta es `503 DATABASE_UNAVAILABLE`

### Requirement: Límite de intentos de las invitaciones públicas
La consulta y la aceptación MUST compartir un límite de intentos por IP con la clave `invitation:<ip>`, la ventana de 15 minutos y el máximo `INVITATION_ATTEMPTS_MAX`. Solo MUST contar los intentos con un enlace no válido (`410`): cada petición reserva un intento antes de comprobar el enlace y lo libera si el enlace es válido, aunque después responda `400` o `409`. Con el límite agotado MUST responder `429 TOO_MANY_REQUESTS` con `Retry-After`, sin comprobar el enlace.

#### Scenario: Se agota con enlaces no válidos
- **GIVEN** `INVITATION_ATTEMPTS_MAX` igual a 3
- **WHEN** una IP consulta tres veces con tokens que no existen y una cuarta con un token válido
- **THEN** las tres primeras responden `410` y la cuarta `429` con `Retry-After`

#### Scenario: Los errores del formulario no cuentan
- **GIVEN** `INVITATION_ATTEMPTS_MAX` igual a 3 y una invitación pendiente
- **WHEN** una IP acepta cuatro veces con el token válido y campos no válidos
- **THEN** las cuatro responden `400`

### Requirement: Registro de eventos de la aceptación sin datos sensibles
Una aceptación correcta MUST registrar `INVITATION_ACCEPTED` (nivel `info`) con `school_id`, `invitation_id`, `user_id` y `role`. Un rechazo por enlace no válido o por email ya registrado MUST registrar `INVITATION_ACCEPT_REJECTED` (nivel `warn`) con `reason` (`LINK_INVALID` o `EMAIL_ALREADY_REGISTERED`), la IP y, si lo hay, el email enmascarado como en el login. Ningún log MUST contener el token, su hash, el enlace ni la contraseña.

#### Scenario: Aceptación registrada
- **WHEN** se acepta una invitación
- **THEN** se registra `INVITATION_ACCEPTED` con el colegio, la invitación, el usuario y el rol
- **AND** ningún log contiene el token, su hash ni la contraseña

#### Scenario: Rechazo registrado
- **WHEN** se acepta con un enlace revocado
- **THEN** se registra `INVITATION_ACCEPT_REJECTED` con `reason` `LINK_INVALID`

### Requirement: Página pública para aceptar una invitación
El frontend MUST ofrecer `/invitacion` (`AcceptInvitationPage`), una ruta pública fuera de `AuthenticatedLayout`. Al montar MUST leer el token del fragmento de la URL, quitarlo de la barra de direcciones con `history.replaceState` y guardarlo solo en memoria, sin escribirlo en ningún almacenamiento del navegador. Sin token MUST mostrar la vista de enlace no válido sin llamar al servidor. Con token MUST consultar la invitación una sola vez, aunque `StrictMode` ejecute el efecto dos veces, mostrando un indicador `role="status"` mientras carga, y según el resultado:
- encontrada: «Te han invitado a {colegio} como {rol}» y el formulario con nombre, apellidos, email, contraseña y la casilla de la política de privacidad (con enlace a `/privacidad`), con la validación en línea del registro;
- `410`: «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.», sin formulario;
- `429`: «Demasiados intentos. Vuelve a intentarlo dentro de N minutos.», con N redondeado hacia arriba;
- `503` o fallo de red: un aviso con «Reintentar».

Al enviar, una guarda síncrona MUST impedir el doble envío. Con `201` MUST navegar a `/login` con `replace`, indicando que la cuenta se ha creado y su email; con `409`, mostrar «Este email ya está registrado» en el campo email y conservar el resto; con `410`, la vista de enlace no válido; con `400`, los errores de cada campo; con `429`, el aviso de espera; y con `503` o un fallo de red, «No se ha podido crear la cuenta. Inténtalo de nuevo.». La página MUST NOT cargar recursos de terceros (tampoco reCAPTCHA), MUST cumplir WCAG 2.1 AA y sus textos MUST venir de i18n. Una sesión abierta en el navegador no cambia su comportamiento.

#### Scenario: El token sale de la URL
- **WHEN** se abre `/invitacion#<token>`
- **THEN** la barra de direcciones pasa a `/invitacion` sin fragmento y el token no está en `localStorage` ni en `sessionStorage`

#### Scenario: Colegio y rol visibles
- **GIVEN** una invitación pendiente de «CEIP Lluís Vives» con rol `MEMBER`
- **WHEN** se abre su enlace
- **THEN** la página muestra «Te han invitado a CEIP Lluís Vives como Miembro» y el formulario

#### Scenario: Enlace no válido
- **WHEN** se abre `/invitacion` sin fragmento o con el token de una invitación revocada
- **THEN** la página muestra «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.» y ningún formulario

#### Scenario: Email ya registrado
- **GIVEN** el formulario de una invitación pendiente
- **WHEN** se envía con un email ya registrado
- **THEN** el campo email muestra «Este email ya está registrado» y los demás campos conservan su valor

#### Scenario: Cuenta creada
- **GIVEN** el formulario de una invitación pendiente
- **WHEN** se envía con datos válidos y la API responde `201`
- **THEN** la página navega a `/login`

#### Scenario: Doble envío
- **WHEN** se pulsa dos veces seguidas el botón con el formulario válido
- **THEN** se envía una sola petición de aceptación

### Requirement: Aceptación de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, que una invitación generada por un administrador se abre en su enlace, muestra el colegio y el rol, permite crear la cuenta, lleva a `/login` con el aviso de cuenta creada y el email escrito, y que con esa cuenta se inicia sesión como `MEMBER`; que un enlace revocado muestra la vista de enlace no válido; que un email ya registrado muestra su error en el campo; y que la página no viola la CSP.

#### Scenario: Recorrido completo en el E2E
- **GIVEN** un administrador registrado con datos únicos en el E2E que genera una invitación de miembro
- **WHEN** se abre el enlace, se crea la cuenta y se inicia sesión con ella
- **THEN** se ve el colegio y el rol, después `/login` con el aviso de cuenta creada, y tras iniciar sesión `/onboarding` sin el enlace «Usuarios»
