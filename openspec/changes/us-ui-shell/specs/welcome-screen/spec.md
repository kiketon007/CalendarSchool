## MODIFIED Requirements

### Requirement: Volver al inicio desde la cabecera
En la barra lateral de las páginas autenticadas, la marca de la aplicación y el enlace «Inicio» MUST llevar a `/onboarding`. Cuando la ruta actual es `/onboarding`, «Inicio» MUST marcarse con `aria-current="page"` y la marca no, para que haya un solo enlace actual.

#### Scenario: Desde otra página
- **GIVEN** un `ADMIN` en `/usuarios`
- **WHEN** pulsa la marca «CalendarSchool» o «Inicio» en la barra lateral
- **THEN** llega a `/onboarding`

#### Scenario: Página actual
- **WHEN** un usuario autenticado está en `/onboarding`
- **THEN** «Inicio» lleva `aria-current="page"` y la marca no
