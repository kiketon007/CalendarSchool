## MODIFIED Requirements

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
