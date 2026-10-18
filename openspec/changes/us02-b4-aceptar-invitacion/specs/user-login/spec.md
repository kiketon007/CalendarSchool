## ADDED Requirements

### Requirement: Aviso de cuenta creada al llegar desde una invitación
Cuando `/login` se abre tras aceptar una invitación (la navegación indica que la cuenta se ha creado y su email), `LoginPage` MUST mostrar «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y el campo email MUST aparecer con ese email. Sin esa indicación, la página MUST comportarse como siempre. La indicación MUST viajar solo en el estado de la navegación, sin guardarse en ningún almacenamiento, de modo que al recargar `/login` el aviso no se repite.

#### Scenario: Llegada desde la aceptación
- **GIVEN** que una invitación se acaba de aceptar con el email `ana@example.com`
- **WHEN** la página de aceptación navega a `/login`
- **THEN** se ve «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y el campo email contiene `ana@example.com`

#### Scenario: Acceso directo
- **WHEN** se abre `/login` escribiendo la dirección o se recarga la página
- **THEN** no se ve el aviso y el campo email está vacío
