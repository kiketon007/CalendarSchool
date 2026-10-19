## ADDED Requirements

### Requirement: Aviso de contraseña cambiada al llegar desde un restablecimiento
Cuando `/login` se abre tras confirmar un restablecimiento de contraseña (la navegación indica que la contraseña se ha cambiado), `LoginPage` MUST mostrar «Tu contraseña se ha cambiado. Inicia sesión con la nueva.» en un `role="status"`. La indicación MUST viajar solo en el estado de la navegación, sin guardarse en ningún almacenamiento, de modo que al recargar `/login` el aviso no se repite; un estado con otra forma MUST ignorarse. El aviso de cuenta creada (invitaciones) MUST seguir funcionando igual.

#### Scenario: Llegada desde el restablecimiento
- **WHEN** la página de restablecimiento navega a `/login` tras cambiar la contraseña
- **THEN** se ve «Tu contraseña se ha cambiado. Inicia sesión con la nueva.» en un `role="status"`

#### Scenario: Acceso directo
- **WHEN** se abre `/login` escribiendo la dirección o se recarga la página
- **THEN** no se ve el aviso
