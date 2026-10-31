## ADDED Requirements

### Requirement: Recuento de tramos no disponibles del profesor
Cada `Professor` MUST llevar `unavailableCount`, un entero ≥ 0 con el número de tramos no disponibles guardados (ya normalizados) del profesor. Lo llevan las respuestas de `GET /api/professors`, `GET /api/professors/{id}`, `POST` y `PUT`.

`professorsService` del frontend MUST exigirlo: cualquier otra forma es `unavailable`.

#### Scenario: Recuento en el listado
- **GIVEN** un profesor con dos tramos y otro sin ninguno
- **WHEN** se pide `GET /api/professors`
- **THEN** el primero lleva `unavailableCount: 2` y el segundo `unavailableCount: 0`

#### Scenario: Profesor recién creado
- **WHEN** se crea un profesor
- **THEN** la respuesta lleva `unavailableCount: 0`

### Requirement: Enlace a la disponibilidad desde el listado de profesores
`ProfessorsPage` MUST mostrar en cada profesor, en la columna «Acciones» de la tabla y al pie de cada tarjeta, a los dos roles, un enlace a `/profesores/{id}/disponibilidad`:
- **texto:** «Disponibilidad», o «Disponibilidad ({n} tramos)», con plural, si `unavailableCount` es mayor que 0;
- **`aria-label`:** «Disponibilidad de {Apellidos, Nombre}».

#### Scenario: Enlace con recuento
- **GIVEN** «García, Ana» con 2 tramos
- **WHEN** abro «Profesores»
- **THEN** su fila tiene el enlace «Disponibilidad (2 tramos)», que lleva a su página de disponibilidad

#### Scenario: Enlace sin tramos
- **GIVEN** un profesor sin tramos
- **THEN** su enlace dice «Disponibilidad»
