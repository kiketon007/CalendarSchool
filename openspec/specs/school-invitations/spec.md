# school-invitations Specification

## Purpose
Define las invitaciones al colegio: la tabla `access_links` (compartida con los restablecimientos de contraseña); el lado del administrador, con los contratos de `POST /api/invitations`, `GET /api/invitations` y `POST /api/invitations/{id}/revoke`, el enlace de un solo uso que se muestra una vez (solo se guarda el hash del token) y la sección de invitaciones de `/usuarios`; y el lado de la persona invitada, con los endpoints públicos `POST /api/invitations/lookup` y `POST /api/invitations/accept` (alta atómica, límite de intentos y eventos) y la página `/invitacion`. Incluye los recorridos de extremo a extremo de ambos lados.
## Requirements
### Requirement: Tabla de enlaces de acceso
La base de datos MUST tener la tabla `access_links`, compartida por las invitaciones y los restablecimientos de contraseña, con `id` (UUID), `school_id`, `purpose` (`INVITATION` o `PASSWORD_RESET`), `token_hash` (SHA-256 en hexadecimal, `CHAR(64)`, único), `role` (`ADMIN` o `MEMBER`), `user_id`, `created_by_id`, `expires_at`, `used_at`, `revoked_at` y `created_at`. MUST tener claves foráneas a `schools` (`school_id`) y a `users` (`user_id` y `created_by_id`) sin borrado en cascada y un índice (`school_id`, `purpose`). Un `CHECK` MUST exigir `role` informado y `user_id` vacío cuando `purpose` es `INVITATION`, y `user_id` informado y `role` vacío cuando es `PASSWORD_RESET`. Un índice único parcial MUST impedir dos restablecimientos pendientes (`used_at` y `revoked_at` nulos) del mismo usuario. El token en claro MUST NOT guardarse nunca.

#### Scenario: Invitación sin rol
- **WHEN** se inserta en `access_links` una fila con `purpose` `INVITATION` y `role` nulo
- **THEN** la base de datos la rechaza por el `CHECK`

#### Scenario: Restablecimiento sin usuario
- **WHEN** se inserta una fila con `purpose` `PASSWORD_RESET` y `user_id` nulo
- **THEN** la base de datos la rechaza por el `CHECK`

#### Scenario: Dos restablecimientos pendientes del mismo usuario
- **GIVEN** un restablecimiento pendiente de un usuario
- **WHEN** se inserta otro pendiente para el mismo usuario
- **THEN** la base de datos lo rechaza por el índice único parcial

#### Scenario: Token repetido
- **WHEN** se insertan dos enlaces con el mismo `token_hash`
- **THEN** la base de datos rechaza el segundo

### Requirement: Generar una invitación
`POST /api/invitations` MUST ser un endpoint protegido reservado al rol `ADMIN` (sin sesión válida, `401 INVALID_SESSION`; con rol `MEMBER`, `403 FORBIDDEN`) con el cuerpo `{ "role": "ADMIN" | "MEMBER" }`. Un cuerpo sin `role` MUST responder `400 VALIDATION_ERROR` con `{ field: role, code: REQUIRED }`, y un `role` con otro valor, con `{ field: role, code: INVALID_FORMAT }`; las propiedades desconocidas se ignoran. Con un cuerpo válido MUST crear un enlace de acceso con `purpose` `INVITATION`, el colegio de la identidad, el rol pedido, `created_by_id` igual al usuario que actúa y `expires_at` igual al instante de creación más 72 horas, a partir de un token aleatorio de 256 bits del que solo se guarda su SHA-256. MUST responder `201` con `success: true` y en `data` la invitación (con los mismos campos que en la lista) y `url`, el enlace completo con la forma `<APP_ORIGIN>/invitacion#<token>`. Es la única respuesta que contiene el enlace o el token. MUST registrar `INVITATION_CREATED` con `school_id`, `actor_id`, `invitation_id` y `role`. La respuesta MUST llevar `Cache-Control: no-store`.

#### Scenario: Invitación de miembro
- **GIVEN** un `ADMIN` con sesión
- **WHEN** llama a `POST /api/invitations` con `{ "role": "MEMBER" }`
- **THEN** la respuesta es `201` con la invitación (`role: MEMBER`, `createdBy` con su id y su nombre, `expiresAt` igual a `createdAt` + 72 horas) y un `url` que empieza por `<APP_ORIGIN>/invitacion#`
- **AND** en `access_links` hay una fila con `purpose` `INVITATION` cuyo `token_hash` es el SHA-256 del fragmento del `url`

#### Scenario: Invitación de administrador
- **WHEN** un `ADMIN` llama a `POST /api/invitations` con `{ "role": "ADMIN" }`
- **THEN** la respuesta es `201` con `role: ADMIN`

#### Scenario: Rol no válido
- **WHEN** un `ADMIN` llama a `POST /api/invitations` sin `role` o con `{ "role": "OWNER" }`
- **THEN** la respuesta es `400 VALIDATION_ERROR` con el campo `role` y no se crea ningún enlace

#### Scenario: Un miembro no genera invitaciones
- **WHEN** un `MEMBER` llama a `POST /api/invitations`
- **THEN** la respuesta es `403 FORBIDDEN` y no se crea ningún enlace

#### Scenario: El token no se registra
- **WHEN** un `ADMIN` genera una invitación
- **THEN** se registra `INVITATION_CREATED`, y ningún log contiene el token, su hash ni el `url`

### Requirement: Listar las invitaciones pendientes
`GET /api/invitations` MUST ser un endpoint protegido reservado al rol `ADMIN` que responde `200` con `success: true` y en `data` las invitaciones pendientes del colegio de la identidad: `purpose` `INVITATION`, `used_at` y `revoked_at` nulos y `expires_at` posterior al instante de la petición. Cada una MUST tener exactamente `id`, `role`, `createdBy` (`id`, `firstName`, `lastName`), `createdAt` y `expiresAt` (fechas ISO 8601), y MUST NOT contener el token, su hash ni el enlace. MUST ordenarse de la más reciente a la más antigua. MUST incluir las invitaciones generadas por un administrador que ya no esté `ACTIVE`. MUST NOT incluir invitaciones de otros colegios ni enlaces con otro propósito.

#### Scenario: Pendientes de mi colegio
- **GIVEN** un colegio con dos invitaciones pendientes, una revocada, una usada y una caducada, y otro colegio con una pendiente
- **WHEN** su `ADMIN` llama a `GET /api/invitations`
- **THEN** la respuesta es `200` con las dos pendientes, de la más reciente a la más antigua, y nada más

#### Scenario: El enlace no se vuelve a mostrar
- **GIVEN** una invitación recién generada
- **WHEN** el `ADMIN` llama a `GET /api/invitations`
- **THEN** la invitación aparece sin `url`, sin token y sin hash

#### Scenario: Caducada en el instante exacto
- **GIVEN** una invitación cuyo `expires_at` es el instante de la petición
- **WHEN** el `ADMIN` llama a `GET /api/invitations`
- **THEN** la invitación no aparece

#### Scenario: Quien la generó está dado de baja
- **GIVEN** una invitación pendiente generada por un administrador que después pasó a `SUSPENDED`
- **WHEN** otro `ADMIN` del colegio llama a `GET /api/invitations`
- **THEN** la invitación aparece con el nombre de quien la generó

### Requirement: Revocar una invitación
`POST /api/invitations/{id}/revoke` MUST ser un endpoint protegido reservado al rol `ADMIN`, sin cuerpo. Si `{id}` es una invitación pendiente del colegio de la identidad, MUST informar `revoked_at` con el instante de la petición, registrar `INVITATION_REVOKED` con `school_id`, `actor_id` e `invitation_id` y responder `204`. Si es una invitación del colegio que ya no está pendiente (revocada, usada o caducada), MUST responder `204` sin cambios y sin registrar evento. Si `{id}` no es un UUID, no existe, pertenece a otro colegio o es un enlace con otro propósito, MUST responder `404 NOT_FOUND`, sin distinguir los casos y sin cambiar nada. Una revocación ya revocada conserva su primer instante.

#### Scenario: Revocar una pendiente
- **GIVEN** una invitación pendiente del colegio
- **WHEN** el `ADMIN` llama a `POST /api/invitations/{id}/revoke`
- **THEN** la respuesta es `204`, la fila tiene `revoked_at` y la invitación ya no aparece en `GET /api/invitations`

#### Scenario: Revocar otra vez
- **GIVEN** una invitación ya revocada
- **WHEN** el `ADMIN` la revoca otra vez
- **THEN** la respuesta es `204`, `revoked_at` conserva su primer valor y no se registra `INVITATION_REVOKED`

#### Scenario: Invitación de otro colegio
- **GIVEN** una invitación pendiente de otro colegio
- **WHEN** el `ADMIN` llama a `POST /api/invitations/{id}/revoke` con su id
- **THEN** la respuesta es `404 NOT_FOUND` y la invitación sigue pendiente

#### Scenario: Restablecimiento de contraseña
- **GIVEN** un enlace con `purpose` `PASSWORD_RESET` del colegio
- **WHEN** el `ADMIN` llama a `POST /api/invitations/{id}/revoke` con su id
- **THEN** la respuesta es `404 NOT_FOUND` y el enlace no cambia

#### Scenario: Identificador que no es un UUID
- **WHEN** el `ADMIN` llama a `POST /api/invitations/no-es-un-uuid/revoke`
- **THEN** la respuesta es `404 NOT_FOUND`

### Requirement: Sección de invitaciones en la página de usuarios
La página `/usuarios` MUST mostrar, debajo de la tabla de usuarios, una sección «Invitaciones pendientes» que pide su propia lista (un fallo de la lista de invitaciones no afecta a la de usuarios). MUST ofrecer un selector de rol («Miembro» por defecto, o «Administrador») y el botón «Generar invitación», con una guarda síncrona contra el doble clic. Tras el `201` MUST mostrar un panel con el enlace en un campo de solo lectura, el botón «Copiar», el aviso «Copia este enlace ahora: no se volverá a mostrar. Envíalo tú a la persona invitada.» y el botón «Hecho», que cierra el panel; el enlace solo vive en la memoria de la página, así que al recargar o salir desaparece. «Copiar» MUST escribir el enlace en el portapapeles y mostrar «Enlace copiado» con `role="status"`; si el portapapeles no está disponible o falla, MUST seleccionar el texto del campo y pedir que se copie a mano. La invitación nueva MUST aparecer en la lista sin volver a pedirla. La lista MUST mostrar rol, quién la generó y las fechas de creación y caducidad formateadas con el idioma activo, y en cada fila «Revocar», sin confirmación y con una guarda por fila; con el `204` la fila desaparece. Los fallos MUST mostrarse en un `role="alert"` sin cambiar nada: «No se ha podido generar la invitación», «No se ha podido revocar la invitación» y, al cargar la lista, un aviso con «Reintentar»; un `404` al revocar MUST avisar y volver a pedir la lista; un `403` MUST seguir el camino de la página (renovar la sesión y navegar a `/onboarding`). Todos los textos MUST venir de i18n, y el servicio que llama a los endpoints MUST interpretar la respuesta por su código y MUST NOT lanzar excepciones.

#### Scenario: Generar y ver el enlace
- **GIVEN** un `ADMIN` en `/usuarios`
- **WHEN** elige «Miembro», pulsa «Generar invitación» y la API responde `201`
- **THEN** ve el panel con el enlace, «Copiar» y el aviso, y la invitación aparece en la lista con rol «Miembro» y su nombre

#### Scenario: Copiar el enlace
- **GIVEN** el panel con el enlace
- **WHEN** pulsa «Copiar»
- **THEN** el enlace queda en el portapapeles y ve «Enlace copiado» con `role="status"`

#### Scenario: Sin portapapeles
- **GIVEN** el panel con el enlace y un navegador sin acceso al portapapeles
- **WHEN** pulsa «Copiar»
- **THEN** el texto del campo queda seleccionado y ve cómo copiarlo a mano

#### Scenario: Recargar la página
- **GIVEN** un enlace recién generado en el panel
- **WHEN** recarga la página
- **THEN** la invitación sigue en la lista y el panel con el enlace ya no está

#### Scenario: Doble clic al generar
- **WHEN** pulsa dos veces seguidas «Generar invitación»
- **THEN** se envía una sola petición

#### Scenario: Revocar desde la lista
- **GIVEN** una invitación en la lista
- **WHEN** pulsa «Revocar» y la API responde `204`
- **THEN** la fila desaparece

#### Scenario: Fallo al generar
- **WHEN** pulsa «Generar invitación» y la API responde `503`
- **THEN** ve «No se ha podido generar la invitación» con `role="alert"` y no aparece ningún panel

#### Scenario: Fallo al cargar la lista de invitaciones
- **GIVEN** que `GET /api/invitations` responde `503` y `GET /api/users` responde `200`
- **WHEN** abre `/usuarios`
- **THEN** ve la tabla de usuarios y, en la sección de invitaciones, un aviso con «Reintentar»

### Requirement: Invitaciones de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, que un administrador recién registrado genera una invitación de miembro, ve el enlace y lo copia (con el portapapeles del navegador simulado), que tras recargar la página el enlace ya no está pero la invitación sigue en la lista, y que al revocarla desaparece; y que la sección y el panel no violan la CSP.

#### Scenario: Generar, recargar y revocar en el E2E
- **GIVEN** un administrador registrado con datos únicos en el E2E
- **WHEN** genera una invitación de miembro, la copia, recarga la página y la revoca
- **THEN** ve el enlace y «Enlace copiado» tras generarla, la invitación sin el enlace tras recargar, y la lista sin ella tras revocarla

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

