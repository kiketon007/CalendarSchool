## MODIFIED Requirements

### Requirement: Enlace a las reglas en la navegación
La navegación de la barra lateral MUST mostrar el enlace «Reglas» (`/reglas`) a los dos roles, en «Espacio de trabajo» justo después de «Asignaturas». Se marca activo en esa ruta.

#### Scenario: Enlace para los dos roles
- **WHEN** un `ADMIN` o un `MEMBER` ve la barra lateral
- **THEN** «Reglas» aparece tras «Asignaturas» y lleva a `/reglas`
