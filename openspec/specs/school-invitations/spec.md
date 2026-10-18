# school-invitations Specification

## Purpose
Define las invitaciones al colegio para sus administradores: la tabla `access_links` (compartida con los restablecimientos de contraseña), los contratos de `POST /api/invitations`, `GET /api/invitations` y `POST /api/invitations/{id}/revoke`, el enlace de un solo uso que se muestra una vez (solo se guarda el hash del token), la sección de invitaciones de `/usuarios` y los recorridos de extremo a extremo. Aceptar una invitación queda fuera (US02_b4).
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

