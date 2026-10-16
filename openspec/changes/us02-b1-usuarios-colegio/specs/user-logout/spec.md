## MODIFIED Requirements

### Requirement: Cabecera con el botón de cierre de sesión
El frontend MUST mostrar, en todas las páginas que cuelgan del layout de las páginas autenticadas, una cabecera con el nombre de la aplicación, el nombre del usuario, el nombre de su colegio y un botón «Cerrar sesión». Las páginas públicas (`/`, `/registro`, `/login` y `/privacidad`) MUST NOT mostrarla, aunque haya sesión. El botón MUST cerrar la sesión directamente, sin diálogo de confirmación, y MUST estar deshabilitado mientras el cierre está en curso, con una guarda síncrona contra pulsaciones repetidas. Todos los textos MUST venir de i18n.

#### Scenario: Cabecera con sesión
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre `/onboarding` o cualquier otra página protegida
- **THEN** ve la cabecera con su nombre, el de su colegio y el botón «Cerrar sesión»

#### Scenario: Sin cabecera sin sesión
- **WHEN** un visitante sin sesión abre `/login`, `/registro` o `/privacidad`
- **THEN** no ve la cabecera

#### Scenario: Sin cabecera en las páginas públicas
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre `/privacidad`
- **THEN** no ve la cabecera

#### Scenario: Una sola petición por pulsación
- **WHEN** el usuario pulsa «Cerrar sesión» dos veces seguidas
- **THEN** se envía una única petición `POST /api/auth/logout`
